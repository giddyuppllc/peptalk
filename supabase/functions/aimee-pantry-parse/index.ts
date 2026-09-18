/**
 * Aimee Pantry Parse — Supabase Edge Function
 *
 * Takes a free-form natural language description of pantry items
 * ("2 lbs chicken breast in the freezer, expires next Tuesday")
 * and returns a structured array of pantry items ready to be
 * inserted into the client's usePantryStore.
 *
 * Plus-tier gated (voice / AI input is a Plus feature).
 *
 * Deploy: supabase functions deploy aimee-pantry-parse
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';
import { withErrorReporting } from '../_shared/sentry.ts';
import { checkAiAllowance, recordAiSpend } from '../_shared/aiAllowance.ts';

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

interface ParseBody {
  /** User's free-form pantry description. */
  text: string;
}

const SYSTEM_PROMPT = `You extract pantry/grocery items from a user's plain-English description.

Return ONLY valid JSON in this shape:
{
  "items": [
    {
      "name": "chicken breast",
      "brand": null,
      "quantity": 2,
      "unit": "lb",
      "category": "protein",
      "storageLocation": "freezer",
      "expiryDate": "2026-04-28",
      "notes": null,
      "nutrition": {
        "perServing": { "calories": 165, "proteinGrams": 31, "carbsGrams": 0, "fatGrams": 3.6, "fiberGrams": 0 },
        "servingLabel": "100 g cooked"
      }
    }
  ]
}

Rules:
- storageLocation MUST be one of: "fridge", "freezer", "pantry". Default to "pantry" if unclear, "fridge" for raw dairy/produce/meats, "freezer" for anything described as frozen.
- category SHOULD be one of: "produce", "dairy", "grain", "protein", "condiment", "frozen", "snack", "beverage", "other". Null if unknown.
- unit uses short forms: "lb", "oz", "g", "kg", "cup", "tbsp", "tsp", "ml", "L", "each". Default to "each" when the user doesn't specify.
- Parse relative dates ("next Tuesday", "in 3 days", "end of month") into YYYY-MM-DD using today's date as the reference.
- If expiry isn't mentioned, leave expiryDate null.
- If the user mentions multiple items in one sentence, return each as a separate entry.
- Never invent details — if the user didn't say a brand, leave brand null.
- "nutrition" carries per-serving macros for the custom-meal builder. Include it only when you can estimate confidently from typical generic values for the item. Omit the field for unbranded mystery items — the client falls back to a food-database lookup. \`servingLabel\` is a plain-English description of one unit of \`unit\` (e.g. "1 large egg", "100 g", "1 cup").
- Output JSON only. No prose, no code fences.`;

// Wrapped: this handler had no top-level catch, so an unexpected throw
// surfaced as an opaque runtime error with nothing recorded anywhere.
Deno.serve(withErrorReporting('aimee-pantry-parse', async (req) => {
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

    // Plus-tier gate — beta-tester allowlist driven entirely by the
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
    if (tier === 'free') {
      return json({ error: 'Plus or Pro tier required', upgrade: true }, 403);
    }

    // Monthly allowance, shared with aimee-chat-stream. This was a per-day
    // count (Plus 25/day, Pro 50/day). "i dont want a daily cap" (2026-08-26): the
    // per-tier monthly allowance and the system-wide breaker in _cost.ts
    // are the limit, and the spend is recorded below so the breaker sees it.
    const allowance = await checkAiAllowance(supabase, user.id, tier);
    if (!allowance.allowed) return json(allowance.body, allowance.status);

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body = (await req.json()) as ParseBody;
    const text = (body.text ?? '').trim();
    if (!text) return json({ error: 'Empty input' }, 400);
    // Hard cap to bound vendor token cost — a 50 MB payload would burn
    // dollars on a single parse call. 4K is generous for a pantry list.
    if (text.length > 4000) {
      return json({
        error: 'Pantry description too long. Keep it under 4000 characters.',
      }, 413);
    }

    const today = new Date().toISOString().slice(0, 10);

    const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nToday is ${today}.` },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('[aimee-pantry-parse] AI call failed:', aiRes.status, errText);
      return json({ error: 'The assistant is temporarily unavailable. Please try again.' }, 502);
    }

    const aiData = await aiRes.json();
    await recordAiSpend(supabase, user.id, allowance.cost, aiData);
    const content: string = aiData.choices?.[0]?.message?.content ?? '';
    // Strip code fences if the model slipped them in
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

    let parsed: { items: unknown[] } = { items: [] };
    try {
      parsed = JSON.parse(cleaned);
    } catch (_err) {
      return json({ error: 'AI returned malformed JSON', raw: content }, 502);
    }

    return json({ items: parsed.items ?? [] });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
