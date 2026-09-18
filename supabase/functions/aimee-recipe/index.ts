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
import { reportError } from '../_shared/sentry.ts';
import { checkAiAllowance, recordAiSpend } from '../_shared/aiAllowance.ts';
import { applyFeatureConsent } from '../_shared/aiFeatureConsent.ts';

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
  /**
   * Allergens from the user's health profile. Separate from `constraints`
   * (which is what the user typed on the recipe form) so the health-data
   * consent filter in _shared/aiFeatureConsent.ts can drop exactly these.
   * Folded into the constraint list below as strict "no X" entries.
   */
  allergens?: string[];
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

    // Monthly allowance, shared with aimee-chat-stream. This was a per-day
    // count (10 recipes/day). "i dont want a daily cap" (2026-08-26): the
    // per-tier monthly allowance and the system-wide breaker in _cost.ts
    // are the limit, and the spend is recorded below so the breaker sees it.
    const allowance = await checkAiAllowance(supabase, user.id, tier);
    if (!allowance.allowed) return json(allowance.body, allowance.status);

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    // Health-data consent (profile.aiDataConsent), enforced here as well as on
    // the client so a stale or tampered build cannot bypass it. This feature
    // still works without health data, so the fields are stripped, not refused.
    const body: RecipeBody = applyFeatureConsent('aimee-recipe', await req.json().catch(() => ({}))).body;
    const mealType = body.mealType ?? 'lunch';
    const count = Math.min(Math.max(body.count ?? 3, 1), 6);
    const macros = body.macroTargets;
    // Cap constraints so a malicious payload can't inflate the prompt
    // (token-burn DoS). 25 covers every legitimate allergy + diet combo.
    const constraints = [
      ...(body.constraints ?? []),
      // Allergens get pushed as strict "no X" entries so the AI avoids them.
      // Duplicate entries are fine — constraints are a free-form list. Absent
      // when the user has not consented to sharing health data.
      ...(body.allergens ?? [])
        .map((a) => (typeof a === 'string' ? a.trim() : ''))
        .filter(Boolean)
        .map((a) => `strictly no ${a}`),
    ].slice(0, 25);

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
    await recordAiSpend(supabase, user.id, allowance.cost, aiData);
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
    reportError('aimee-recipe', err);
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
