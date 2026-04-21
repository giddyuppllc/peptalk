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
      "notes": null
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

    // Plus-tier gate (voice input is a Plus feature)
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .maybeSingle();
    const tier = profile?.subscription_tier ?? 'free';
    if (tier === 'free') {
      return json({ error: 'Plus or Pro tier required', upgrade: true }, 403);
    }

    // Rate limit — Plus 30/day, Pro 100/day. Voice parsing is cheap but spammable.
    const limit = tier === 'pro' ? 100 : 30;
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-pantry-parse', limit);
    if (!rateLimit.allowed) {
      return json({
        error: `Daily voice-entry limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body = (await req.json()) as ParseBody;
    const text = (body.text ?? '').trim();
    if (!text) return json({ error: 'Empty input' }, 400);

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
      return json({ error: `AI call failed: ${errText}` }, 502);
    }

    const aiData = await aiRes.json();
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
    console.warn(`[${functionName}] rate-limit check failed, allowing:`, err);
    return { allowed: true, limit, count: 0 };
  }
}
