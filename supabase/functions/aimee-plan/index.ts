/**
 * Aimee Plan — Supabase Edge Function
 *
 * Generates a multi-day meal plan tailored to the user's macro targets +
 * dietary preferences. Pro-tier only.
 *
 * Deploy: supabase functions deploy aimee-plan
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PlanBody {
  days?: number; // 3, 5, or 7
  macroTargets?: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
  dietType?: string;    // e.g. 'balanced', 'keto', 'vegetarian', 'mediterranean'
  allergens?: string[]; // e.g. ['peanuts', 'dairy']
  goals?: string[];     // e.g. ['muscle gain', 'fat loss']
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
    const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    if (tier !== 'pro') {
      return json({ error: 'Pro tier required', upgrade: true }, 403);
    }

    // Rate limit — 10 meal plans/day per user (each plan is ~5-7 days × 4 meals).
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-plan', 10);
    if (!rateLimit.allowed) {
      return json({
        error: `Daily meal-plan limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body: PlanBody = await req.json().catch(() => ({}));
    const days = [3, 5, 7].includes(body.days ?? 0) ? body.days! : 5;
    const macros = body.macroTargets;
    const dietType = body.dietType ?? 'balanced';
    // Cap user-supplied arrays so a malicious payload can't burn LLM
    // tokens by inflating the system prompt with thousands of entries.
    const allergens = (body.allergens ?? []).slice(0, 20);
    const goals = (body.goals ?? []).slice(0, 8);

    const macroLine = macros
      ? `Daily macro target: ${macros.calories}kcal, ${macros.proteinGrams}g protein, ${macros.carbsGrams}g carbs, ${macros.fatGrams}g fat.`
      : '';
    const allergenLine = allergens.length > 0 ? `Avoid: ${allergens.join(', ')}.` : '';
    const goalLine = goals.length > 0 ? `User goals: ${goals.join(', ')}.` : '';

    const systemPrompt = `You are a nutritionist AI that generates ${days}-day meal plans.

Diet style: ${dietType}.
${macroLine}
${allergenLine}
${goalLine}

Each day must include: breakfast, lunch, dinner, and 2 snacks. Daily totals should meet the macro target within ±10%.

Return ONLY valid JSON shaped exactly like:
{
  "plan": [
    {
      "day": 1,
      "meals": [
        { "type": "breakfast", "name": "Name", "description": "1 sentence", "calories": 450, "proteinGrams": 30, "carbsGrams": 45, "fatGrams": 15 },
        { "type": "snack", ... },
        { "type": "lunch", ... },
        { "type": "snack", ... },
        { "type": "dinner", ... }
      ]
    }
  ]
}

Generate exactly ${days} days. Keep meals realistic and varied. Snacks should be light (<200 cal).`;

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
          { role: 'user', content: `Generate my ${days}-day meal plan.` },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('[aimee-plan] AI call failed:', aiRes.status, errText);
      return json({ error: 'AI service failed' }, 502);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? '{}';

    let parsed: { plan: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[aimee-plan] malformed JSON:', content);
      return json({ error: 'AI returned malformed response' }, 502);
    }

    return json({ plan: parsed.plan ?? [] });
  } catch (err) {
    console.error('[aimee-plan] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
    // Fail CLOSED. If we can't reach ai_usage_log we cannot enforce the
    // per-user cap, and the function fans out to the LLM/vision provider —
    // unlimited spam quickly translates to real money. Better to return
    // a 503 to the caller and let them retry once the DB recovers than
    // to leave the cost door wide open.
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, count: 0, retryAfter: 60, failedClosed: true };
  }
}
