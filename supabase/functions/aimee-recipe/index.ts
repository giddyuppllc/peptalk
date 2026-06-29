/**
 * Aimee Recipe — Supabase Edge Function
 *
 * Generates a set of recipes matching a meal type and the user's macro
 * targets. Pro-tier gated. API key stays server-side.
 *
 * Deploy: supabase functions deploy aimee-recipe
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RecipeBody {
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  macroTargets?: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
  constraints?: string[]; // e.g. 'vegetarian', 'gluten-free', 'no dairy'
  count?: number;         // how many recipes to generate (default 3)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    // Pro gate — beta-tester allowlist driven entirely by the
    // BETA_TESTER_EMAILS Supabase secret (CSV). No hardcoded defaults.
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
      .maybeSingle();
    const tier = await resolveEffectiveTier(supabase, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });
    if (tier !== 'pro') {
      return json({ error: 'Pro tier required', upgrade: true }, 403);
    }

    // Rate limit — 10 recipes/day per user (locked). ~$0.0015/call.
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-recipe', 10);
    if (!rateLimit.allowed) {
      return json({
        error: `Daily recipe limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body: RecipeBody = await req.json().catch(() => ({}));
    const mealType = body.mealType ?? 'lunch';
    const count = Math.min(Math.max(body.count ?? 3, 1), 6);
    const macros = body.macroTargets;
    // Cap constraints so a malicious payload can't inflate the prompt
    // (token-burn DoS). 25 covers every legitimate allergy + diet combo.
    const constraints = (body.constraints ?? []).slice(0, 25);

    const macroLine = macros
      ? `Target roughly 1/3 of daily macros per recipe: ~${Math.round(macros.calories / 3)}kcal, ~${Math.round(macros.proteinGrams / 3)}g protein, ~${Math.round(macros.carbsGrams / 3)}g carbs, ~${Math.round(macros.fatGrams / 3)}g fat.`
      : '';
    const constraintLine = constraints.length > 0
      ? `Respect these dietary constraints: ${constraints.join(', ')}.`
      : '';

    const systemPrompt = `You are a nutritionist AI that generates simple, healthy ${mealType} recipes.
${macroLine}
${constraintLine}
Return a JSON object shaped like:
{
  "recipes": [
    {
      "name": "Recipe name",
      "description": "1-sentence description",
      "calories": 450,
      "proteinGrams": 35,
      "carbsGrams": 45,
      "fatGrams": 12,
      "ingredients": ["2 eggs", "1 cup oats", ...],
      "steps": ["Step 1", "Step 2", ...],
      "prepMinutes": 10
    }
  ]
}
Generate exactly ${count} recipes. Keep ingredients realistic (items a normal grocery store carries). Steps should be 3-6 short sentences.
Return ONLY valid JSON, no other text.`;

    const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate ${count} ${mealType} recipes.` },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('[aimee-recipe] AI call failed:', aiRes.status, errText);
      return json({ error: 'AI service failed' }, 502);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? '{}';

    let parsed: { recipes: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[aimee-recipe] could not parse JSON:', content);
      return json({ error: 'AI returned malformed response' }, 502);
    }

    return json({ recipes: parsed.recipes ?? [] });
  } catch (err) {
    console.error('[aimee-recipe] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Check-and-increment a per-user, per-function, per-day call counter.
 * Returns { allowed: false } when the daily limit has been reached.
 * Uses ai_usage_log (20260425 migration) as the backing store.
 *
 * Race-safe enough for our volume: two concurrent calls from the same
 * user could each see count=limit-1 and both pass, but the upper bound
 * error is at most +concurrency, which is tolerable for cost control.
 */
async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; count: number; retryAfter?: number }> {
  // Atomic via bump_ai_usage RPC (2026-05-17 audit fix).
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
