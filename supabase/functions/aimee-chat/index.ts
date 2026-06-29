/**
 * Aimee Chat — Supabase Edge Function
 *
 * Proxies chat requests to OpenAI/Grok with:
 * - Auth validation (user must be logged in)
 * - Tier-based rate limiting (free=0, plus=limited, pro=unlimited)
 * - API key stays server-side (never exposed to client)
 *
 * Deploy: supabase functions deploy aimee-chat
 * Set secret: supabase secrets set OPENAI_API_KEY=sk-...
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildAimeeSystemPrompt, SAFETY_TRAILER, type AimeeServerContext } from './_prompt.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
// Default to Grok — matches the other edge functions. If secrets aren't set
// for this function, at least we're calling the same provider consistently.
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
// Default to the SAME verified id the client uses (src/services/llmService.ts
// MODEL = 'grok-4-1-fast-reasoning'); 'grok-4.3' was an invalid placeholder
// that made every chat throw. Set the GROK_MODEL/OPENAI_MODEL secret to the
// live id at deploy.
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Rate limits per tier (messages per day)
const RATE_LIMITS: Record<string, number> = {
  free: 0,      // No AI access
  plus: 25,     // Limited
  pro: 300,     // Generous but finite — protects against runaway cost on
                // a leaked pro-tier token. Previously 999999 which was
                // effectively uncapped.
};

// Hard limits on incoming payload to prevent "giant context" cost abuse.
const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 40_000;   // ~10K tokens — well above normal chat

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Check subscription tier — beta-tester allowlist driven entirely
    // by the BETA_TESTER_EMAILS Supabase secret (CSV). Set with:
    //   supabase secrets set BETA_TESTER_EMAILS="email1,email2,..."
    // No hardcoded defaults — if the secret is unset, only paid users
    // get through. Add testers to the secret + redeploy isn't needed
    // (functions read the env on each request).
    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const isBetaTester =
      !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    const limit = RATE_LIMITS[tier] ?? 0;

    if (limit === 0) {
      return new Response(JSON.stringify({
        error: 'AI chat requires PepTalk+ or Pro subscription',
        upgrade: true,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check rate limit — uses ai_usage_log (service-role-writable only)
    // so users can't reset their counter by deleting their own chat history.
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-chat', limit);
    if (!rateLimit.allowed) {
      // Distinguish a real cap-hit from a transient infrastructure failure:
      // - cap-hit → 429 with the daily-limit copy + upgrade nudge
      // - failed-closed → 503 with "temporarily unavailable" so users
      //   retry once the DB recovers instead of thinking they hit the cap.
      if (rateLimit.failedClosed) {
        return new Response(JSON.stringify({
          error: 'Aimee is temporarily unavailable — please try again in a minute.',
          retryAfter: rateLimit.retryAfter,
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        error: `Daily message limit reached (${rateLimit.limit}/day)${tier === 'plus' ? '. Upgrade to Pro for more.' : '. Resets tomorrow.'}`,
        upgrade: tier === 'plus',
        retryAfter: rateLimit.retryAfter,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Parse + validate request body
    //
    // Accept the new `context` shape AND the legacy `systemPrompt` field for
    // one release cycle (already-deployed TestFlight builds send systemPrompt).
    // The legacy field is IGNORED for safety — we always build the system
    // prompt server-side. Old clients lose dynamic context but get a working
    // bot with the safety preamble intact.
    const { messages, context: clientContext, systemPrompt: legacyClientPrompt } = await req.json();

    if (legacyClientPrompt && !clientContext) {
      console.warn(
        '[aimee-chat] Legacy client sent systemPrompt — ignoring (build > 1.9.0 should send context instead)',
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request: messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: `Too many messages (limit ${MAX_MESSAGES}). Please start a new conversation.` }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalChars = messages.reduce(
      (acc: number, m: any) => acc + (typeof m?.content === 'string' ? m.content.length : 0),
      0,
    );
    if (totalChars > MAX_TOTAL_CHARS) {
      return new Response(JSON.stringify({ error: 'Message thread too large. Please start a new conversation.' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the system prompt SERVER-SIDE. Anything the client sends in
    // `clientContext` is treated as data — it's coerced into a typed
    // AimeeServerContext and only the whitelisted fields flow into the
    // prompt builder. Free-form text never reaches the system role.
    const safeContext: AimeeServerContext = {
      tier,
      hasConsent: clientContext?.hasConsent === true,
      simpleMode: clientContext?.simpleMode === true,
      activeProtocolSummary: typeof clientContext?.activeProtocolSummary === 'string'
        ? clientContext.activeProtocolSummary.slice(0, 500)
        : undefined,
      recentDosesSummary: typeof clientContext?.recentDosesSummary === 'string'
        ? clientContext.recentDosesSummary.slice(0, 500)
        : undefined,
      healthAlertsSummary: typeof clientContext?.healthAlertsSummary === 'string'
        ? clientContext.healthAlertsSummary.slice(0, 500)
        : undefined,
      healthProfileSummary: typeof clientContext?.healthProfileSummary === 'string'
        ? clientContext.healthProfileSummary.slice(0, 500)
        : undefined,
      biometricsSummary: typeof clientContext?.biometricsSummary === 'string'
        ? clientContext.biometricsSummary.slice(0, 300)
        : undefined,
      labResultsSummary: typeof clientContext?.labResultsSummary === 'string'
        ? clientContext.labResultsSummary.slice(0, 800)
        : undefined,
      currentRoute: typeof clientContext?.currentRoute === 'string'
        ? clientContext.currentRoute.slice(0, 100)
        : undefined,
    };
    const serverSystemPrompt = buildAimeeSystemPrompt(safeContext);

    // 5. Call OpenAI/Grok — 45s timeout prevents a hung upstream from
    // burning our entire edge-function budget and erroring with a 500
    // (which looks worse to the user than "AI unavailable, try again").
    //
    // Message order: [system, ...user/assistant history, SAFETY_TRAILER as user]
    // The trailer goes LAST so even an adversarial earlier message can't
    // shadow it — models weight recent context most.
    const openaiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: serverSystemPrompt },
          ...messages,
          { role: 'user', content: SAFETY_TRAILER },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('[aimee-chat] OpenAI error:', err);
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const completion = await openaiResponse.json();
    const content = completion.choices?.[0]?.message?.content ?? '';

    // 6. Save messages to chat history
    await supabase.from('chat_messages').insert([
      { user_id: user.id, role: 'user', content: messages[messages.length - 1].content },
      { user_id: user.id, role: 'assistant', content },
    ]);

    // 7. Return response
    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[aimee-chat] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Per-user, per-function, per-day call counter backed by `ai_usage_log`.
 * Service role writes only — user RLS only permits SELECT — so deleting
 * chat_messages can't reset the counter.
 *
 * Fail-open on DB error: we'd rather serve a paying user than strand them
 * when our rate-limit table is unreachable.
 */
async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; count: number; retryAfter?: number; failedClosed?: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // 2026-05-17 security fix: migrated from read-modify-write to the
    // atomic `bump_ai_usage` RPC. The previous pattern leaked one extra
    // call past the limit under concurrent same-user requests. Other
    // edge fns (aimee-chat-stream, aimee-voice, food-scan, lab-scan,
    // aimee-pantry-scan, aimee-pantry-meal, aimee-recipe, aimee-plan,
    // aimee-lab-interpret, aimee-pantry-parse, community-moderate-image)
    // all use the same RPC; this one was the last hold-out.
    const { data, error } = await supabase.rpc('bump_ai_usage', {
      p_user_id: userId,
      p_function_name: functionName,
      p_date: today,
    });
    if (error) throw error;

    const newCount = Array.isArray(data) && data[0]
      ? (data[0] as any).count ?? 0
      : 0;

    if (newCount > limit) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      const retryAfter = Math.max(1, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
      return { allowed: false, limit, count: newCount, retryAfter };
    }
    return { allowed: true, limit, count: newCount };
  } catch (err) {
    // Fail CLOSED. If we can't reach ai_usage_log we cannot enforce the
    // per-user cap, and the function fans out to the LLM provider —
    // unlimited spam quickly translates to real money. Better to return
    // a transient error to the caller and let them retry once the DB
    // recovers than to leave the cost door wide open.
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, count: 0, retryAfter: 60, failedClosed: true };
  }
}
