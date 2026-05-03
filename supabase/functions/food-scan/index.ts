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

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const VISION_MODEL = 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOD_SCAN_PROMPT = `You are a nutrition analysis AI. Analyze this photo of food and identify every item you can see.

For each food item, estimate:
- name (be specific: "grilled chicken breast" not just "chicken")
- estimated weight in grams
- calories
- protein (grams)
- carbs (grams)
- fat (grams)
- fiber (grams)

Also provide:
- total calories for the entire plate/bowl
- total macros (protein, carbs, fat)
- a one-line description of the meal

Return ONLY valid JSON, no markdown. Format:
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
      "fiber": 0
    }
  ],
  "totals": {
    "calories": 650,
    "protein": 58,
    "carbs": 72,
    "fat": 14,
    "fiber": 8
  }
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

    const effectiveTier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');

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

    // Rate limit — 20 vision calls/day. Grok Vision is the priciest call
    // in the app; even Pro users shouldn't be able to burn through it.
    const rateLimit = await checkRateLimit(supabase, user.id, 'food-scan', 20);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: `Daily food-scan limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Get image from request
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

    // 4. Call Grok vision
    const openaiResponse = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('[food-scan] Vision API error:', err);
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
): Promise<{ allowed: boolean; limit: number; count: number; retryAfter?: number }> {
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
      const retryAfter = Math.max(1, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
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
    console.warn(`[${functionName}] rate-limit check failed, allowing:`, err);
    return { allowed: true, limit, count: 0 };
  }
}
