/**
 * Aimee Voice — Whisper transcription only.
 *
 * The client posts a multipart audio blob (m4a / mp4 / wav, ≤25 MB); we
 * return { transcript }. The client then feeds the transcript into the
 * existing aimee-chat-stream pipeline so Aimee's tool registry
 * (log_meal, log_dose, schedule_workout, navigate_to_screen, etc.)
 * handles intent routing and confirm cards — no parallel intent shape
 * here.
 *
 * Tier + rate limit (audit fix):
 *   - Pro tier only. Plus/Free are rejected with 403.
 *   - 60 calls/day per user, enforced via the atomic `bump_ai_usage`
 *     RPC (same pattern as aimee-chat-stream). Without this, a Pro user
 *     or stolen token could hammer Whisper unbounded.
 *   - BETA_TESTER_EMAILS (csv) bypass the tier check but NOT the cap.
 *
 * Deploy: supabase functions deploy aimee-voice
 *
 * Required env:
 *   OPENAI_TRANSCRIBE_API_KEY (or OPENAI_API_KEY)  — real OpenAI key
 *                                                    for Whisper access
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY        — auth check
 *   BETA_TESTER_EMAILS                             — optional CSV
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';

// 2026-05-20 fix: don't fall back to OPENAI_API_KEY — on this project
// that env var holds the Grok/xAI key (OPENAI_BASE_URL points to
// api.x.ai). A Grok key calling api.openai.com/v1/audio/transcriptions
// returns 401, which is why voice messages never worked. Fall back to
// OPENAI_WHISPER_API_KEY instead — that's the real OpenAI key already
// in secrets for the Whisper + food-scan vision paths.
const WHISPER_API_KEY =
  Deno.env.get('OPENAI_TRANSCRIBE_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const VOICE_DAILY_LIMIT = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; retryAfter?: number; failedClosed?: boolean }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
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
      const retryAfter = Math.max(
        1,
        Math.round((tomorrow.getTime() - now.getTime()) / 1000),
      );
      return { allowed: false, limit, retryAfter };
    }
    return { allowed: true, limit };
  } catch (err) {
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, retryAfter: 60, failedClosed: true };
  }
}

/**
 * Best-effort refund of one unit consumed by checkRateLimit when the
 * billable Whisper call never produced a usable, billed result (network
 * failure, timeout, or upstream non-2xx). The atomic bump stays up front
 * so the per-day cap is still enforced under concurrency; this hands the
 * unit back on the rare failure path. A lost refund only ever returns a
 * credit the user was owed — never a money leak — so a light
 * read-then-write is acceptable here.
 */
async function refundRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('ai_usage_log')
      .select('count')
      .eq('user_id', userId)
      .eq('function_name', functionName)
      .eq('date', today)
      .single();
    if (error || !data) return;
    const next = Math.max(0, ((data as any).count ?? 0) - 1);
    await supabase
      .from('ai_usage_log')
      .update({ count: next })
      .eq('user_id', userId)
      .eq('function_name', functionName)
      .eq('date', today);
  } catch (err) {
    console.error(`[${functionName}] rate-limit refund failed (non-fatal):`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Missing auth' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid auth' }, 401);

    if (!WHISPER_API_KEY) {
      return jsonResp({ error: 'Whisper key not configured' }, 500);
    }

    // Tier check — Pro only, with beta-tester bypass.
    const userEmail = (user.email ?? '').toLowerCase();
    const betaSet = new Set(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const isBetaTester = !!userEmail && betaSet.has(userEmail);

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, is_pro')
      .eq('id', user.id)
      .single();
    // resolveEffectiveTier verifies a live subscription backs the mirror tier
    // and returns 'pro' for beta testers. Drop the legacy `profile.is_pro`
    // OR-term: it's the SAME stale mirror as subscription_tier (set by the IAP
    // webhooks) and would re-open the expired-sub hole.
    const tier = await resolveEffectiveTier(supabase, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    const isPro = tier === 'pro';

    if (!isPro) {
      return jsonResp(
        { error: 'Voice is a PepTalk Pro feature.', upgrade: true },
        403,
      );
    }

    const form = await req.formData().catch(() => null);
    const audio = form?.get('audio');
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return jsonResp({ error: 'audio field missing or not a file' }, 400);
    }
    const audioBlob = audio as Blob;
    if (audioBlob.size > 25 * 1024 * 1024) {
      return jsonResp({ error: 'Audio exceeds 25 MB Whisper cap' }, 413);
    }

    // Daily cap — 60 voice messages per Pro user. Consumed only now that
    // the request is valid and we're about to call the billable Whisper
    // endpoint (P2.26: the bump used to run before this validation).
    // Atomic via RPC so concurrent requests can't sneak past.
    const rate = await checkRateLimit(supabase, user.id, 'aimee-voice', VOICE_DAILY_LIMIT);
    if (!rate.allowed) {
      // P3.16: transient DB failure → 503 (retryable), not 429. Mirrors aimee-chat.
      if (rate.failedClosed) {
        return jsonResp(
          {
            error: 'Voice is temporarily unavailable — please try again in a minute.',
            retryAfter: rate.retryAfter,
          },
          503,
        );
      }
      return jsonResp(
        {
          error: `Daily voice limit reached (${rate.limit}/day). Resets tomorrow.`,
          retryAfter: rate.retryAfter,
        },
        429,
      );
    }

    const whisperForm = new FormData();
    const filename = (audio as any).name || 'voice.m4a';
    whisperForm.append('file', audioBlob, filename);
    whisperForm.append('model', WHISPER_MODEL);
    whisperForm.append('response_format', 'text');
    whisperForm.append('language', 'en');
    whisperForm.append('temperature', '0.0');

    const whisperCall = () => fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHISPER_API_KEY}` },
      body: whisperForm,
      signal: AbortSignal.timeout(60000),
    });
    let wRes: Response;
    try {
      wRes = await whisperCall();
    } catch (err) {
      // Network/timeout — no transcript delivered and we weren't billed; refund.
      await refundRateLimit(supabase, user.id, 'aimee-voice');
      console.error('[aimee-voice] whisper request failed', err);
      return jsonResp({ error: 'Voice transcription temporarily unavailable' }, 502);
    }
    if (!wRes.ok) {
      const detail = await wRes.text().catch(() => '');
      console.error('[aimee-voice] whisper err', wRes.status, detail);
      // Upstream returned non-2xx — refund the consumed voice credit.
      await refundRateLimit(supabase, user.id, 'aimee-voice');
      return jsonResp({ error: `Whisper ${wRes.status}` }, 502);
    }
    const transcript = (await wRes.text()).trim();
    return jsonResp({ transcript });
  } catch (err) {
    console.error('[aimee-voice] fatal', err);
    return jsonResp(
      { error: err instanceof Error ? err.message : 'voice pipeline error' },
      500,
    );
  }
});
