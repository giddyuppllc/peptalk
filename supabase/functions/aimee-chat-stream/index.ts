/**
 * Aimee Chat (streaming, Claude-backed) — Supabase Edge Function.
 *
 * What's different from the legacy `aimee-chat` function:
 *  - Provider: Anthropic Claude Sonnet 4.6 (not Grok)
 *  - Streams tokens to the client over SSE (not a single JSON blob)
 *  - Tool-calling enabled (suggest_workout, summarize_pattern,
 *    draft_meal_template, propose_log_field)
 *  - Cost-aware: dollar-denominated daily caps (per-user + system-wide)
 *
 * Auth, prompt-injection defense, tier gating, and per-message rate
 * limiting are all carried over from the legacy function.
 *
 * Deploy: supabase functions deploy aimee-chat-stream
 * Secrets:
 *   ANTHROPIC_API_KEY        (required)
 *   ANTHROPIC_MODEL          (optional — default claude-sonnet-4-6)
 *   ANTHROPIC_BASE_URL       (optional — default api.anthropic.com)
 *   AIMEE_DAILY_BUDGET_CENTS (optional — default 1000 = $10)
 *   AIMEE_PER_USER_DAILY_CENTS (optional — default 200 = $2)
 *   BETA_TESTER_EMAILS       (optional — CSV of pro-tier overrides)
 *
 * Wire format: SSE events
 *   data: {"type":"text_delta","text":"..."}
 *   data: {"type":"tool_use","name":"...","input":{...},"id":"..."}
 *   data: {"type":"tool_result","tool_use_id":"...","output":{...}}
 *   data: {"type":"pending_action","id":"...","tool":"...","preview":{...}}
 *   data: {"type":"done","usage":{...},"cost_microcents":1234}
 *   data: {"type":"error","message":"..."}
 *
 * The RN client (src/services/llmService.ts) consumes this. The legacy
 * aimee-chat endpoint stays live until all TestFlight builds upgrade.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildAimeeSystemPrompt,
  SAFETY_TRAILER,
  type AimeeServerContext,
} from './_prompt.ts';
import {
  streamAnthropic,
  completeAnthropic,
  tokensToMicrocents,
  type AnthropicMessage,
  type AnthropicUsage,
} from './_anthropic.ts';
import { AIMEE_TOOLS, executeTool } from './_tools.ts';
import { checkCostCap, denialMessage, recordSpend } from './_cost.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Per-tier per-day MESSAGE caps (existing behaviour) — runs alongside the
// dollar-aware cap from _cost.ts. Either cap can stop a runaway call.
const RATE_LIMITS: Record<string, number> = {
  free: 0,
  plus: 25,
  pro: 300,
};

// Payload guards.
const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 40_000;
const MAX_TOOL_ROUNDS = 3; // hard ceiling on the tool_use → tool_result loop

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Auth ----------------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonError(401, 'Missing auth token');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonError(401, 'Invalid auth token');
  }

  // 2. Tier resolution -----------------------------------------------------
  const BETA_TESTER_EMAILS = new Set<string>(
    (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const isBetaTester =
    !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();
  const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
  const messageLimit = RATE_LIMITS[tier] ?? 0;
  if (messageLimit === 0) {
    return jsonError(
      403,
      'AI chat requires PepTalk+ or Pro subscription',
      { upgrade: true },
    );
  }

  // 3. Per-message rate limit (existing ai_usage_log) ----------------------
  const rateLimit = await checkRateLimit(
    supabase,
    user.id,
    'aimee-chat-stream',
    messageLimit,
  );
  if (!rateLimit.allowed) {
    if (rateLimit.failedClosed) {
      return jsonError(
        503,
        'Aimee is temporarily unavailable — please try again in a minute.',
        { retryAfter: rateLimit.retryAfter },
      );
    }
    return jsonError(
      429,
      `Daily message limit reached (${rateLimit.limit}/day)${tier === 'plus' ? '. Upgrade to Pro for more.' : '. Resets tomorrow.'}`,
      { upgrade: tier === 'plus', retryAfter: rateLimit.retryAfter },
    );
  }

  // 4. Dollar-aware cost cap ----------------------------------------------
  const costCheck = await checkCostCap(supabase, user.id);
  if (!costCheck.allowed) {
    return jsonError(429, denialMessage(costCheck.reason), {
      reason: costCheck.reason,
    });
  }

  // 5. Parse and validate body --------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const clientContext = (body.context ?? {}) as Record<string, unknown>;
  const conversationId =
    typeof body.conversationId === 'string' ? body.conversationId : null;

  if (messages.length === 0) {
    return jsonError(400, 'messages required');
  }
  if (messages.length > MAX_MESSAGES) {
    return jsonError(413, `Too many messages (limit ${MAX_MESSAGES}).`);
  }
  const totalChars = messages.reduce(
    (acc: number, m: any) =>
      acc + (typeof m?.content === 'string' ? m.content.length : 0),
    0,
  );
  if (totalChars > MAX_TOTAL_CHARS) {
    return jsonError(413, 'Message thread too large.');
  }

  // 6. Build the server-side system prompt --------------------------------
  const safeContext: AimeeServerContext = sanitizeContext(clientContext, tier);
  const systemPrompt = buildAimeeSystemPrompt(safeContext);

  // 7. Set up streaming response -----------------------------------------
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* client gone */
        }
      };
      const close = () => {
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // Convert chat history to Anthropic Messages shape.
        let convoMessages = mapMessages(messages);
        // Append safety trailer as a final user message — same defense as
        // the legacy function: even an adversarial earlier message can't
        // shadow the trailer because it's the last thing the model sees.
        convoMessages.push({ role: 'user', content: SAFETY_TRAILER });

        let totalUsage: AnthropicUsage = { input_tokens: 0, output_tokens: 0 };
        let finalAssistantText = '';
        let pendingActions: Array<{
          id: string;
          tool: string;
          preview: Record<string, unknown>;
        }> = [];

        // Tool-use loop: stream until message_stop. If the model emitted a
        // tool_use, execute it, append the result, and call Claude again
        // (non-streaming this time — keeps the loop simple). Cap at
        // MAX_TOOL_ROUNDS so we can't infinite-loop.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const collected = await streamRound({
            system: systemPrompt,
            messages: convoMessages,
            send,
            isFirstRound: round === 0,
          });

          totalUsage = {
            input_tokens: totalUsage.input_tokens + collected.usage.input_tokens,
            output_tokens: totalUsage.output_tokens + collected.usage.output_tokens,
          };

          if (collected.text) {
            finalAssistantText = collected.text;
          }

          if (collected.toolUses.length === 0) {
            // No tool calls — we're done.
            break;
          }

          // Append the assistant's tool_use turn verbatim.
          convoMessages.push({
            role: 'assistant',
            content: collected.assistantContentBlocks,
          });

          // Execute each tool and emit tool_result events to the client.
          const toolResultBlocks: Array<Record<string, unknown>> = [];
          for (const tu of collected.toolUses) {
            send({
              type: 'tool_use',
              name: tu.name,
              input: tu.input,
              id: tu.id,
            });
            let result: Record<string, unknown>;
            try {
              result = await executeTool(tu.name, tu.input, {
                supabase,
                userId: user.id,
                conversationId,
              });
            } catch (e) {
              console.error(`[aimee-chat-stream] tool ${tu.name} failed:`, e);
              result = { error: 'tool execution failed' };
            }
            send({
              type: 'tool_result',
              tool_use_id: tu.id,
              tool: tu.name,
              output: result,
            });
            // If the tool returned a pending action, surface it explicitly.
            if (
              typeof result.pending_action_id === 'string' &&
              result.requires_confirm === true
            ) {
              pendingActions.push({
                id: result.pending_action_id,
                tool: tu.name,
                preview: (result.preview as Record<string, unknown>) ?? {},
              });
              send({
                type: 'pending_action',
                id: result.pending_action_id,
                tool: tu.name,
                preview: result.preview ?? {},
              });
            }
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify(result),
            });
          }

          convoMessages.push({
            role: 'user',
            content: toolResultBlocks,
          });

          if (round === MAX_TOOL_ROUNDS - 1) {
            // Hit the round cap — record and stop.
            send({
              type: 'warning',
              message: 'Tool round limit reached',
            });
          }
        }

        // 8. Persist conversation + record spend ----------------------------
        const costMC = tokensToMicrocents(totalUsage);
        await recordSpend(supabase, user.id, costMC);

        // Save user message + assistant reply to chat_messages.
        const userMessageContent = lastUserMessageText(messages);
        if (userMessageContent && finalAssistantText) {
          await supabase.from('chat_messages').insert([
            {
              id: cryptoRandomId(),
              user_id: user.id,
              chat_id: conversationId,
              role: 'user',
              content: userMessageContent,
            },
            {
              id: cryptoRandomId(),
              user_id: user.id,
              chat_id: conversationId,
              role: 'assistant',
              content: finalAssistantText,
            },
          ]);
        }

        send({
          type: 'done',
          usage: totalUsage,
          cost_microcents: costMC,
          pending_actions: pendingActions,
        });
        close();
      } catch (err) {
        console.error('[aimee-chat-stream] fatal:', err);
        send({
          type: 'error',
          message: 'AI service temporarily unavailable',
        });
        close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});

// ─── Streaming helpers ────────────────────────────────────────────────────

interface StreamRoundResult {
  text: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  assistantContentBlocks: Array<Record<string, unknown>>;
  usage: AnthropicUsage;
}

async function streamRound(args: {
  system: string;
  messages: AnthropicMessage[];
  send: (obj: Record<string, unknown>) => void;
  isFirstRound: boolean;
}): Promise<StreamRoundResult> {
  const blocks: Map<number, { type: string; text?: string; name?: string; id?: string; jsonStr?: string }> = new Map();
  let usage: AnthropicUsage = { input_tokens: 0, output_tokens: 0 };

  for await (const ev of streamAnthropic({
    system: args.system,
    messages: args.messages,
    tools: AIMEE_TOOLS,
    maxTokens: 1024,
    temperature: 0.7,
  })) {
    const d = ev.data as any;
    switch (ev.type) {
      case 'message_start': {
        if (d?.message?.usage) {
          usage.input_tokens += d.message.usage.input_tokens ?? 0;
          usage.output_tokens += d.message.usage.output_tokens ?? 0;
        }
        break;
      }
      case 'content_block_start': {
        const idx = d.index;
        const block = d.content_block ?? {};
        blocks.set(idx, {
          type: block.type ?? 'unknown',
          text: block.text ?? '',
          name: block.name,
          id: block.id,
          jsonStr: '',
        });
        if (block.type === 'tool_use') {
          // Surface tool name early so the UI can show "calling tool…".
          args.send({
            type: 'tool_use_start',
            name: block.name,
            id: block.id,
          });
        }
        break;
      }
      case 'content_block_delta': {
        const idx = d.index;
        const delta = d.delta ?? {};
        const block = blocks.get(idx);
        if (!block) break;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = (block.text ?? '') + delta.text;
          args.send({ type: 'text_delta', text: delta.text });
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          block.jsonStr = (block.jsonStr ?? '') + delta.partial_json;
        }
        break;
      }
      case 'content_block_stop': {
        // No-op — finalization is in the loop tail.
        break;
      }
      case 'message_delta': {
        if (d.usage) {
          usage.output_tokens += d.usage.output_tokens ?? 0;
        }
        break;
      }
      case 'message_stop':
        break;
      default:
        break;
    }
  }

  // Assemble final shape.
  const assistantContentBlocks: Array<Record<string, unknown>> = [];
  const toolUses: StreamRoundResult['toolUses'] = [];
  let fullText = '';
  for (const [, b] of [...blocks.entries()].sort((a, b) => a[0] - b[0])) {
    if (b.type === 'text') {
      const t = b.text ?? '';
      fullText += t;
      assistantContentBlocks.push({ type: 'text', text: t });
    } else if (b.type === 'tool_use') {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = b.jsonStr ? JSON.parse(b.jsonStr) : {};
      } catch (e) {
        console.warn('[aimee-chat-stream] tool input parse failed:', e);
      }
      toolUses.push({
        id: b.id ?? cryptoRandomId(),
        name: b.name ?? 'unknown',
        input: parsedInput,
      });
      assistantContentBlocks.push({
        type: 'tool_use',
        id: b.id,
        name: b.name,
        input: parsedInput,
      });
    }
  }

  return { text: fullText, toolUses, assistantContentBlocks, usage };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ error: message, ...(extra ?? {}) }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function sanitizeContext(
  clientContext: Record<string, unknown>,
  tier: string,
): AimeeServerContext {
  const s = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined;
  const n = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  return {
    tier,
    hasConsent: clientContext?.hasConsent === true,
    simpleMode: clientContext?.simpleMode === true,
    activeProtocolSummary: s(clientContext?.activeProtocolSummary, 500),
    recentDosesSummary: s(clientContext?.recentDosesSummary, 500),
    healthAlertsSummary: s(clientContext?.healthAlertsSummary, 500),
    healthProfileSummary: s(clientContext?.healthProfileSummary, 500),
    biometricsSummary: s(clientContext?.biometricsSummary, 300),
    labResultsSummary: s(clientContext?.labResultsSummary, 800),
    workoutSummary: s(clientContext?.workoutSummary, 400),
    nutritionSummary: s(clientContext?.nutritionSummary, 400),
    bodyTrendSummary: s(clientContext?.bodyTrendSummary, 200),
    selfStatedGoal: s(clientContext?.selfStatedGoal, 400),
    workoutDaysPerWeek: n(clientContext?.workoutDaysPerWeek),
    currentRoute: s(clientContext?.currentRoute, 100),
  };
}

function mapMessages(messages: any[]): AnthropicMessage[] {
  // Anthropic only accepts alternating user/assistant. The legacy client may
  // send role 'bot' for assistant; normalize.
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
    const role = m.role === 'assistant' || m.role === 'bot' ? 'assistant' : 'user';
    out.push({ role, content: m.content });
  }
  // Anthropic requires the first message to be from user. Drop a leading
  // assistant if any.
  while (out.length > 0 && out[0].role === 'assistant') out.shift();
  return out;
}

function lastUserMessageText(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return null;
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

// ─── Per-message rate limit (carried over from legacy fn) ─────────────────

async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{
  allowed: boolean;
  limit: number;
  count: number;
  retryAfter?: number;
  failedClosed?: boolean;
}> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: existing } = await supabase
      .from('ai_usage_log')
      .select('count')
      .eq('user_id', userId)
      .eq('function_name', functionName)
      .eq('date', today)
      .maybeSingle();
    const count = existing?.count ?? 0;
    if (count >= limit) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      const retryAfter = Math.max(
        1,
        Math.round((tomorrow.getTime() - now.getTime()) / 1000),
      );
      return { allowed: false, limit, count, retryAfter };
    }
    await supabase
      .from('ai_usage_log')
      .upsert(
        {
          user_id: userId,
          function_name: functionName,
          date: today,
          count: count + 1,
          last_called_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,function_name,date' },
      );
    return { allowed: true, limit, count: count + 1 };
  } catch (err) {
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, count: 0, retryAfter: 60, failedClosed: true };
  }
}
