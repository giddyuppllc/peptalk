/**
 * Food Scan — Supabase Edge Function
 *
 * Takes a base64 image of a food plate/bowl, sends to Grok vision,
 * returns identified foods with estimated macros.
 *
 * Pro tier only. Auth validated, rate limited.
 *
 * Deploy: supabase functions deploy food-scan
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';

// 2026-05-17 vision routing fix: Grok-4.3 (the current default OPENAI_MODEL
// on this project) does not accept image inputs. Routing vision endpoints
// to OpenAI gpt-4o-mini instead — same API shape, accurate food
// recognition, and much cheaper than Grok vision would be even if it
// were available. Reuses the OpenAI key already set for Whisper.
const VISION_API_KEY =
  Deno.env.get('OPENAI_VISION_API_KEY') ??
  Deno.env.get('OPENAI_TRANSCRIBE_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const VISION_BASE_URL =
  Deno.env.get('OPENAI_VISION_BASE_URL') ?? 'https://api.openai.com/v1';
// gpt-4o-mini keeps per-scan cost low (see routing note above). The improved
// FOOD_SCAN_PROMPT below (packaged-food / label reading + conservatism +
// confidence) is the main free accuracy lever. For MAXIMUM accuracy on
// packaged foods, set OPENAI_VISION_MODEL=gpt-4o — materially better at
// reading brands/labels, but ~15-20x the per-scan cost.
const VISION_MODEL =
  Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOD_SCAN_PROMPT = `You are a careful nutrition analysis AI. Identify every food item in the photo and estimate its nutrition. Accuracy matters more than confidence — a wrong guess logged silently is worse than an honest "unsure".

READ THE PACKAGING FIRST. If an item is a packaged or branded product (wrapper, label, box, jar, bar, stick, pouch), read the brand + product name off the packaging and use that product's STANDARD published nutrition facts for the serving shown — do NOT estimate macros from appearance for packaged foods. Examples: a "Chomps" or similar meat stick is a beef/turkey snack stick (~90–110 cal, high protein, ~0 carbs) — never a creamer; "Skippy" is peanut butter; a protein bar's macros come from its label. Use shape, size, packaging, and context to avoid confusing visually similar items (a meat stick vs a creamer pod, yogurt vs sauce, etc.).

For whole/home-cooked foods, estimate from a standard single serving and be CONSERVATIVE with portion size when uncertain (err smaller, not larger).

For EACH item provide:
- name (specific but honest: if you can read a brand, include it, e.g. "Chomps Original Beef Stick"; if genuinely unsure, use a generic name like "meat snack stick" rather than inventing a specific product)
- estimatedGrams (whole number)
- calories, protein, carbs, fat, fiber (grams)
- confidence: a number 0–1 for how sure you are of the IDENTITY (1 = certain, 0.4 = a rough guess). Set it honestly low when unsure.

Also provide a one-line meal description and plate totals (sum of items).

Return ONLY valid JSON, no markdown, no commentary. Format:
{
  "description": "Grilled chicken bowl with rice and vegetables",
  "items": [
    {
      "name": "Grilled Chicken Breast",
      "estimatedGrams": 170,
      "calories": 280,
      "protein": 53,
      "carbs": 0,
      "fat": 6,
      "fiber": 0,
      "confidence": 0.9
    }
  ],
  "totals": { "calories": 650, "protein": 58, "carbs": 72, "fat": 14, "fiber": 8 }
}`;

Deno.serve(async (req) => {
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

    // 2. Check tier — beta-tester allowlist driven entirely by the
    // BETA_TESTER_EMAILS Supabase secret (CSV). No hardcoded defaults.
    // Note: food scanner is a Plus feature (moved from Pro in Wave 16).
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

    const effectiveTier = await resolveEffectiveTier(supabase, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });

    // Food Scanner moved into Plus in Wave 16 — both Plus and Pro are
    // permitted. Free users still get the upgrade prompt.
    if (effectiveTier !== 'pro' && effectiveTier !== 'plus') {
      return new Response(JSON.stringify({
        error: 'Food scanning requires PepTalk+ or Pro subscription',
        upgrade: true,
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Get image from request — validate the input BEFORE consuming any
    //    quota so a rejected request never costs the user a daily scan
    //    (P2.26: the bump used to run here, ahead of validation).
    // 2026-05-17 security fix: pre-parse size guard so an attacker
    // can't stream a 100MB body and OOM the worker before the 6MB
    // base64 check below fires. Content-Length is advisory but Supabase
    // edge runtime trusts it.
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 10_000_000) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageBase64 } = await req.json();

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hard server-side cap — a 48MP phone camera at quality 1.0 can produce
    // ~10-15MB base64. We don't need more than ~5MB for vision recognition,
    // and larger images scale vision-model cost linearly. Reject giant uploads
    // rather than pass them upstream.
    if (imageBase64.length > 6_000_000) {
      return new Response(JSON.stringify({
        error: 'Image too large. Please retake at lower quality.',
      }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Vision service must be configured — a server-side misconfig, not
    //    the user's request, so it must not consume quota (and it runs
    //    before the bump below regardless).
    if (!VISION_API_KEY) {
      console.error('[food-scan] No VISION_API_KEY set');
      return new Response(JSON.stringify({ error: 'Vision service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Consume quota — request is valid and we're about to make the
    //    billable vision call. The bump stays atomic (bump_ai_usage) so
    //    concurrent requests can't sneak past the cap; a failed upstream
    //    call is refunded below so the user keeps their scan.
    const dailyLimit = effectiveTier === 'pro' ? 20 : 5;
    const rateLimit = await checkRateLimit(supabase, user.id, 'food-scan', dailyLimit);
    if (!rateLimit.allowed) {
      // P3.16: a transient DB failure in the rate-limit check → 503
      // (retryable), not 429 (which reads as "you hit your cap").
      // Mirrors the aimee-chat pattern.
      if (rateLimit.failedClosed) {
        return new Response(JSON.stringify({
          error: 'Food scanning is temporarily unavailable — please try again in a minute.',
          retryAfter: rateLimit.retryAfter,
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        error: `Daily food-scan limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const visionCall = () => fetch(`${VISION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VISION_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: FOOD_SCAN_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60000),
    });

    let openaiResponse: Response;
    try {
      openaiResponse = await visionCall();
    } catch (err) {
      // Network/timeout — the vision call never delivered a result and we
      // weren't billed, so refund the scan we just consumed.
      await refundRateLimit(supabase, user.id, 'food-scan');
      console.error('[food-scan] Vision API request failed:', err);
      return new Response(JSON.stringify({ error: 'Food analysis temporarily unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('[food-scan] Vision API error:', err);
      // Upstream returned non-2xx — refund the consumed scan.
      await refundRateLimit(supabase, user.id, 'food-scan');
      return new Response(JSON.stringify({ error: 'Food analysis temporarily unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const completion = await openaiResponse.json();
    const rawContent = completion.choices?.[0]?.message?.content ?? '';

    // 5. Parse JSON response
    let result;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({
        error: 'Could not analyze this image. Try taking a clearer photo.',
        raw: rawContent,
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Return analyzed food data
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[food-scan] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; count: number; retryAfter?: number; failedClosed?: boolean }> {
  // Atomic increment via `bump_ai_usage` RPC. The previous
  // read-modify-write pattern on ai_usage_log could leak one extra call
  // per concurrent same-user request (two reads see count=4, two upserts
  // both write count=5; one increment lost). Caller still pays vendor
  // cost. P0 fix from the 2026-05-17 security audit.
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
      const retryAfter = Math.max(1, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
      return { allowed: false, limit, count: newCount, retryAfter };
    }
    return { allowed: true, limit, count: newCount };
  } catch (err) {
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, count: 0, retryAfter: 60, failedClosed: true };
  }
}

/**
 * Best-effort refund of one unit consumed by checkRateLimit when the
 * billable upstream call never produced a usable, billed result (network
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
