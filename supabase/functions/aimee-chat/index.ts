/**
 * Aimee Chat — Supabase Edge Function
 *
 * Proxies chat requests to OpenAI/Grok with:
 * - Auth validation (user must be logged in)
 * - Tier gate (Plus and Pro) and the monthly AI allowance shared with
 *   aimee-chat-stream (_shared/aiAllowance.ts)
 * - API key stays server-side (never exposed to client)
 *
 * Deploy: supabase functions deploy aimee-chat
 * Set secret: supabase secrets set OPENAI_API_KEY=sk-...
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildAimeeSystemPrompt, SAFETY_TRAILER, type AimeeServerContext } from './_prompt.ts';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';
import { reportError } from '../_shared/sentry.ts';
import { checkAiAllowance, recordAiSpend } from '../_shared/aiAllowance.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
// Default to Grok — matches the other edge functions. If secrets aren't set
// for this function, at least we're calling the same provider consistently.
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
// Default to the SAME verified id the client uses (src/services/llmService.ts
// MODEL = 'grok-4-1-fast-reasoning'); 'grok-4.3' was an invalid placeholder
// that made every chat throw. Set the GROK_MODEL/OPENAI_MODEL secret to the
// live id at deploy.
// Model ids on x.ai churn, in both directions: an earlier note here recorded
// 'grok-4.3' as an invalid placeholder, and as of 2026-09-12 it is
// 'grok-4-1-fast-reasoning' that no longer exists while 'grok-4.3' does.
//
// The stale id did not fail loudly. x.ai answered 200 and silently served
// grok-4.3 instead, so the model we thought we had configured had not been
// running for some time and nothing surfaced it. Treat a working chat as no
// evidence the configured id is real — check it against GET /v1/models.
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Tiers this fallback serves. Free is refused here, as before; the free
// taster lives in aimee-chat-stream.
//
// There is no per-day message count any more ("i dont want a daily cap",
// 2026-08-26). The per-tier MONTHLY allowance and the system-wide runaway
// breaker in aimee-chat-stream/_cost.ts are the limit, applied through
// _shared/aiAllowance.ts, and this function now records its spend there.
const AI_TIERS = new Set(['plus', 'pro']);

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

    // Verify a live subscription backs a paid mirror tier (defends against a
    // webhook-misfire lapse). See _shared/effectiveTier.
    const tier = await resolveEffectiveTier(supabase, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    if (!AI_TIERS.has(tier)) {
      return new Response(JSON.stringify({
        error: 'AI chat requires PepTalk+ or Pro subscription',
        upgrade: true,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Monthly allowance — the same gate aimee-chat-stream applies, against
    // the server-resolved tier. Read-only: nothing is consumed until the
    // provider call below succeeds and its spend is recorded.
    const allowance = await checkAiAllowance(supabase, user.id, tier);
    if (!allowance.allowed) {
      return new Response(JSON.stringify(allowance.body), {
        status: allowance.status,
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
      // Nutrition / fitness / body-comp / goal context. Previously these
      // were declared on AimeeServerContext and rendered by the prompt
      // builder, but were NEVER copied here — so a "what are my macros?"
      // question reached the model with zero body data and it fell back to
      // the one rich source it had (the peptide library), answering with
      // peptide stacks. (Jamie, build 59.) Whitelisting them lets the
      // USER CONTEXT block actually populate for nutrition/fitness answers.
      workoutSummary: typeof clientContext?.workoutSummary === 'string'
        ? clientContext.workoutSummary.slice(0, 300)
        : undefined,
      nutritionSummary: typeof clientContext?.nutritionSummary === 'string'
        ? clientContext.nutritionSummary.slice(0, 300)
        : undefined,
      bodyTrendSummary: typeof clientContext?.bodyTrendSummary === 'string'
        ? clientContext.bodyTrendSummary.slice(0, 200)
        : undefined,
      selfStatedGoal: typeof clientContext?.selfStatedGoal === 'string'
        ? clientContext.selfStatedGoal.slice(0, 200)
        : undefined,
      workoutDaysPerWeek: typeof clientContext?.workoutDaysPerWeek === 'number'
        ? clientContext.workoutDaysPerWeek
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
      console.error('[aimee-chat] OpenAI error:', openaiResponse.status, err.slice(0, 500));
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const completion = await openaiResponse.json();
    await recordAiSpend(supabase, user.id, allowance.cost, completion);
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
    reportError('aimee-chat', error);
    console.error('[aimee-chat] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
