/**
 * Aimee Pantry Meal — Supabase Edge Function
 *
 * Given the user's pantry inventory + macro targets + diet preferences,
 * suggests 3 meals they can make tonight using primarily what they
 * already have.
 *
 * Pro-tier gated. API key stays server-side.
 *
 * Deploy: supabase functions deploy aimee-pantry-meal
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface PantryItem {
  name: string;
  brand?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  storageLocation?: 'fridge' | 'freezer' | 'pantry';
  expiryDate?: string;
}

interface SuggestBody {
  pantryItems: PantryItem[];
  macroTargets?: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  dietType?: string;       // 'keto', 'vegetarian', 'mediterranean', etc.
  allergens?: string[];    // ['gluten', 'dairy']
  cuisinePreference?: string;
  count?: number;          // how many suggestions
  /** Peptides the user is actively on — informs nutrition guidance
   *  (e.g. GLP-1s push protein target higher, GH secretagogues suggest
   *   low-carb pre-sleep meals). */
  activeStackPeptides?: string[];
}

// Peptide-specific nutrition prompts injected into the Grok call when the
// user has an active protocol for the matching peptide. Kept inline in this
// edge function so it runs Deno-side; mirrors src/data/peptideNutrition.ts
// on the client.
const PEPTIDE_NUTRITION_PROMPTS: Record<string, string> = {
  semaglutide:
    'User is on semaglutide: 1.0–1.2 g/lb protein to preserve lean mass; small frequent meals; hydration + electrolytes emphasized.',
  tirzepatide:
    'User is on tirzepatide: 1.0–1.2 g/lb protein, small frequent meals, pre-hydrate to reduce nausea.',
  retatrutide:
    'User is on retatrutide: strict 1.0–1.2 g/lb protein, hydration critical, small protein-forward meals.',
  liraglutide:
    'User is on liraglutide: 0.9–1.1 g/lb protein, balanced meals.',
  cagrilintide:
    'User is on cagrilintide: pair protein with fiber-rich veggies, slow-digesting meals.',
  ipamorelin:
    'User is on ipamorelin: no high-glycemic carbs in the evening dose window.',
  'cjc-1295':
    'User is on CJC-1295: low-carb evening, protein-forward meals.',
  tesamorelin:
    'User is on tesamorelin: protein-forward, no simple sugars in the fast-window meals.',
  sermorelin:
    'User is on sermorelin: no sugar 2h before bedtime dose.',
  'bpc-157':
    'User is on BPC-157: collagen/glycine emphasis (bone broth, gelatin), vitamin C + zinc cofactors.',
  'tb-500':
    'User is on TB-500: collagen + vitamin C cofactors for tissue repair.',
  'mots-c':
    'User is on MOTS-c: time complex carbs around workouts.',
  'aod-9604':
    'User is on AOD-9604: protein + hydration priority.',
  aod9604:
    'User is on AOD-9604: protein + hydration priority.',
  'igf-1-lr3':
    'User is on IGF-1 LR3: post-workout dose with carbs + protein; 1.0–1.3 g/lb protein.',
};

const SYSTEM_PROMPT = `You suggest meals a user can cook tonight using primarily the ingredients they already have on hand.

Return ONLY valid JSON in this shape:
{
  "suggestions": [
    {
      "name": "Lemon chicken & rice bowl",
      "description": "One short sentence on what the meal is.",
      "cookingMethod": "stovetop | oven | grill | no-cook",
      "prepMinutes": 25,
      "ingredients": [
        { "name": "chicken breast", "qty": 6, "unit": "oz", "fromPantry": true },
        { "name": "lemon", "qty": 1, "unit": "each", "fromPantry": true },
        { "name": "olive oil", "qty": 1, "unit": "tbsp", "fromPantry": false }
      ],
      "estimatedMacros": { "calories": 520, "proteinGrams": 42, "carbsGrams": 55, "fatGrams": 14 },
      "notes": "Any optional tip — e.g. 'swap basmati for any rice you have'."
    }
  ]
}

Rules:
- "fromPantry: true" ONLY when the ingredient clearly matches one in the user's pantry list (case-insensitive name match). Otherwise false.
- Prefer suggestions that use MORE pantry items. At least 70% of core ingredients (by count) should come from the pantry.
- If the user supplied macroTargets, tailor estimatedMacros to hit roughly those numbers per serving.
- Respect dietType and allergens strictly — never suggest foods containing the listed allergens.
- If no pantry items are supplied, fall back to simple meals with common-household ingredients and mark fromPantry: false on all.
- Output JSON only. No prose, no code fences.`;

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

    // Rate limit — 10 pantry-meal suggestions/day per user (Pro only, locked).
    // ~$0.0016/call so a heavy user costs ~$0.50/mo on this fn.
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-pantry-meal', 10);
    if (!rateLimit.allowed) {
      return json({
        error: `Daily pantry-suggestion limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body = (await req.json()) as SuggestBody;
    const count = Math.min(Math.max(body.count ?? 3, 1), 5);

    // Cap user-supplied collections so a malicious / accidental large
    // payload can't burn LLM tokens. Numbers chosen to comfortably hold
    // the longest legitimate use (a heavy stack with a deep pantry)
    // while bounding total prompt size at ≤ ~2k chars of pantry data.
    const MAX_PANTRY_ITEMS = 80;
    const MAX_ALLERGENS = 20;
    const MAX_STACK_PEPTIDES = 12;
    const items = (body.pantryItems ?? []).slice(0, MAX_PANTRY_ITEMS);
    const allergensCapped = (body.allergens ?? []).slice(0, MAX_ALLERGENS);
    const stackCapped = (body.activeStackPeptides ?? []).slice(0, MAX_STACK_PEPTIDES);

    const pantrySummary = items.length === 0
      ? '(user has no pantry items — suggest simple common-household meals)'
      : items
          .map((i) => {
            const parts: string[] = [];
            if (i.quantity && i.unit) parts.push(`${i.quantity} ${i.unit}`);
            parts.push(i.name);
            if (i.brand) parts.push(`(${i.brand})`);
            if (i.storageLocation) parts.push(`[${i.storageLocation}]`);
            if (i.expiryDate) parts.push(`expires ${i.expiryDate}`);
            return `- ${parts.join(' ')}`;
          })
          .join('\n');

    // Compose peptide nutrition guidance from the lookup table
    const stackPrompts: string[] = [];
    for (const pid of stackCapped) {
      const promptText = PEPTIDE_NUTRITION_PROMPTS[pid.toLowerCase()];
      if (promptText) stackPrompts.push(promptText);
    }

    const userPrompt = [
      `Pantry items:\n${pantrySummary}`,
      body.macroTargets
        ? `\nMacro target per serving: ~${body.macroTargets.calories} cal, ${body.macroTargets.proteinGrams}g protein, ${body.macroTargets.carbsGrams}g carbs, ${body.macroTargets.fatGrams}g fat.`
        : '',
      body.mealType ? `\nMeal type: ${body.mealType}.` : '',
      body.dietType ? `\nDiet: ${body.dietType}.` : '',
      allergensCapped.length ? `\nAllergens to avoid: ${allergensCapped.join(', ')}.` : '',
      body.cuisinePreference ? `\nPreferred cuisine: ${body.cuisinePreference}.` : '',
      stackPrompts.length
        ? `\n\nPeptide context (factor these into the meal suggestions):\n${stackPrompts.map((p) => `- ${p}`).join('\n')}`
        : '',
      `\n\nSuggest ${count} meals.`,
    ].filter(Boolean).join('');

    const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.6,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: `AI call failed: ${errText}` }, 502);
    }

    const aiData = await aiRes.json();
    const content: string = aiData.choices?.[0]?.message?.content ?? '';
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

    let parsed: { suggestions: unknown[] } = { suggestions: [] };
    try {
      parsed = JSON.parse(cleaned);
    } catch (_err) {
      return json({ error: 'AI returned malformed JSON', raw: content }, 502);
    }

    return json({ suggestions: parsed.suggestions ?? [] });
  } catch (err) {
    return json({ error: String(err) }, 500);
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
