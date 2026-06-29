/**
 * Grok (xAI) wrapper for Aimee — OpenAI-compatible chat completions.
 *
 * The xAI API speaks the OpenAI Chat Completions wire format, so the
 * same shape works for streaming text + tool calling. We call it
 * directly (no SDK) so we control the SSE parser and so Deno cold-
 * starts stay snappy.
 *
 * Model: grok-4-1-fast-reasoning — matches the client-side direct
 * fallback in src/services/llmService.ts so client + server agree on a
 * verified live id (the old 'grok-4.3' default was an invalid
 * placeholder that threw on every call). Set the GROK_MODEL secret to
 * the live id at deploy to override.
 *
 * Costs are computed from the `usage` block in the final stream event
 * (or final response) so we don't have to estimate. Stored in
 * microcents (1 USD = 100,000,000 mc).
 *
 * Pricing (May 2026, grok-4-1-fast-reasoning — confirm at deploy time):
 *   input:  $0.20 / 1M tokens  → 20  microcents/token
 *   output: $0.50 / 1M tokens  → 50  microcents/token
 * Override with GROK_INPUT_MC_PER_TOKEN / GROK_OUTPUT_MC_PER_TOKEN.
 */

const GROK_API_KEY = Deno.env.get('GROK_API_KEY') ?? Deno.env.get('XAI_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? '';
const GROK_BASE_URL = Deno.env.get('GROK_BASE_URL') ?? Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
// Default to the SAME verified id the client uses (src/services/llmService.ts
// MODEL = 'grok-4-1-fast-reasoning'); 'grok-4.3' was an invalid placeholder
// that made every chat throw and silently drop users to the local bot.
// Set the GROK_MODEL secret to the live id at deploy.
const GROK_MODEL = Deno.env.get('GROK_MODEL') ?? Deno.env.get('OPENAI_MODEL') ?? 'grok-4-1-fast-reasoning';

const INPUT_MICROCENTS_PER_TOKEN = Number(
  Deno.env.get('GROK_INPUT_MC_PER_TOKEN') ?? 20,
);
const OUTPUT_MICROCENTS_PER_TOKEN = Number(
  Deno.env.get('GROK_OUTPUT_MC_PER_TOKEN') ?? 50,
);

// ─── Wire shapes ──────────────────────────────────────────────────────────

export interface GrokTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GrokToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Set on assistant messages that called tools. */
  tool_calls?: GrokToolCall[];
  /** Set on role='tool' messages — refers to the assistant tool call id. */
  tool_call_id?: string;
  /** Set on role='tool' messages so the model knows what tool produced it. */
  name?: string;
}

export interface GrokUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface GrokStreamEvent {
  /** Logical event type for the index handler to switch on. */
  type:
    | 'text_delta'           // assistant message content delta
    | 'tool_call_start'      // a new tool_call appeared in the stream
    | 'tool_call_arg_delta'  // partial JSON arg delta
    | 'message_stop'         // finish_reason emitted
    | 'usage';               // final usage block (some providers fold this into stop)
  index?: number;
  text?: string;
  toolCall?: { id: string; name: string };
  argDelta?: string;
  finishReason?: string;
  usage?: GrokUsage;
}

export function tokensToMicrocents(usage: GrokUsage): number {
  return (
    usage.input_tokens * INPUT_MICROCENTS_PER_TOKEN +
    usage.output_tokens * OUTPUT_MICROCENTS_PER_TOKEN
  );
}

// ─── Streaming call ───────────────────────────────────────────────────────

/**
 * Stream a Grok chat completion. Yields parsed wire events. The caller
 * reassembles text + tool_call deltas into final blocks and handles the
 * tool_use → tool_result loop.
 *
 * Throws on HTTP-level failure. The caller should map errors to 502.
 */
export async function* streamGrok(args: {
  system: string;
  messages: GrokMessage[];
  tools?: GrokTool[];
  maxTokens?: number;
  temperature?: number;
}): AsyncGenerator<GrokStreamEvent, void, unknown> {
  if (!GROK_API_KEY) {
    throw new Error('GROK_API_KEY (or XAI_API_KEY) is not configured');
  }

  const body: Record<string, unknown> = {
    model: GROK_MODEL,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: args.maxTokens ?? 1024,
    temperature: args.temperature ?? 0.7,
    messages: [
      { role: 'system', content: args.system },
      ...args.messages,
    ],
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    // Let the model decide when to call tools (default for xAI/OpenAI).
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Grok HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  // OpenAI-style SSE: each event is `data: {json}\n\n`; final event is
  // `data: [DONE]\n\n`. No `event:` lines.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf('\n\n');

      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) dataLine += line.slice(6);
        else if (line.startsWith('data:')) dataLine += line.slice(5);
      }
      const trimmed = dataLine.trim();
      if (!trimmed) continue;
      if (trimmed === '[DONE]') return;
      let parsed: any;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      // OpenAI streaming chunk shape:
      //   { id, choices: [{ index, delta: { content?, tool_calls? }, finish_reason }], usage? }
      const choice = parsed?.choices?.[0];
      if (choice) {
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          yield { type: 'text_delta', text: delta.content, index: choice.index };
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const i = typeof tc.index === 'number' ? tc.index : 0;
            // First chunk for this tool_call carries id + function.name.
            if (tc.id || tc.function?.name) {
              yield {
                type: 'tool_call_start',
                index: i,
                toolCall: {
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                },
              };
            }
            // Subsequent chunks carry function.arguments as a JSON-string
            // delta — accumulate on the caller side and JSON.parse at end.
            if (typeof tc.function?.arguments === 'string' && tc.function.arguments.length > 0) {
              yield {
                type: 'tool_call_arg_delta',
                index: i,
                argDelta: tc.function.arguments,
              };
            }
          }
        }
        if (choice.finish_reason) {
          yield { type: 'message_stop', finishReason: choice.finish_reason };
        }
      }
      // Final chunk with usage (stream_options.include_usage = true).
      if (parsed?.usage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: parsed.usage.prompt_tokens ?? 0,
            output_tokens: parsed.usage.completion_tokens ?? 0,
          },
        };
      }
    }
  }
}

/**
 * Non-streaming convenience — same shape as streaming caller but
 * returns one final result. Useful for tests, fallbacks, and any
 * place we want a simple ask/answer without an SSE wire.
 */
export async function completeGrok(args: {
  system: string;
  messages: GrokMessage[];
  tools?: GrokTool[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{
  content: string;
  toolCalls: GrokToolCall[];
  usage: GrokUsage;
  finishReason: string;
}> {
  if (!GROK_API_KEY) {
    throw new Error('GROK_API_KEY (or XAI_API_KEY) is not configured');
  }
  const body: Record<string, unknown> = {
    model: GROK_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    temperature: args.temperature ?? 0.7,
    messages: [
      { role: 'system', content: args.system },
      ...args.messages,
    ],
  };
  if (args.tools && args.tools.length > 0) {
    body.tools = args.tools;
    body.tool_choice = 'auto';
  }
  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    throw new Error(`Grok HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
  const json = await res.json();
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  return {
    content: typeof msg.content === 'string' ? msg.content : '',
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    usage: {
      input_tokens: json?.usage?.prompt_tokens ?? 0,
      output_tokens: json?.usage?.completion_tokens ?? 0,
    },
    finishReason: choice?.finish_reason ?? 'stop',
  };
}
