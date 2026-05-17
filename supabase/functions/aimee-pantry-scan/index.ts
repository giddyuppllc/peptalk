/**
 * Aimee Pantry Scan — Supabase Edge Function
 *
 * Takes a base64 photo of a fridge / pantry / counter and uses Grok
 * vision to identify every food item it sees. Returns a list the client
 * shows as a multi-select checklist; the user picks the correct items
 * and the client bulk-inserts them into usePantryStore.
 *
 * Why not reuse food-scan: food-scan is tuned for a single plate / bowl
 * and returns *macros for what's plated*. Here we want every distinct
 * grocery item the model can spot, with sensible default quantities and
 * storage locations — not plate macros.
 *
 * Plus / Pro tier gated, matches food-scan semantics.
 *
 * Deploy: supabase functions deploy aimee-pantry-scan
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const VISION_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const PANTRY_SCAN_PROMPT = `You are a kitchen-inventory assistant. The image shows a fridge, freezer, or pantry. Identify every distinct food or grocery item you can clearly see.

For each item return:
- name             specific, lowercase ("greek yogurt", "frozen broccoli", "ribeye steak")
- quantity         best-guess count or unit count (default 1 when unclear)
- unit             one of: "each" | "oz" | "g" | "lb" | "cup" | "tbsp" | "tsp" | "ml" | "l"
- category         one of: "produce" | "dairy" | "grain" | "protein" | "frozen" | "condiment" | "other"
- storageLocation  one of: "fridge" | "freezer" | "pantry" — infer from where the item appears in the image
- confidence       0.0–1.0; lower for partially-visible labels or guesses
- nutrition        per-serving macros (used by the custom-meal builder). Object with:
  {
    "perServing": { "calories": number, "proteinGrams": number, "carbsGrams": number, "fatGrams": number, "fiberGrams": number },
    "servingLabel": "1 large egg" | "100 g cooked" | "1 cup" — plain-English label for ONE unit of \`unit\`
  }
  If you cannot estimate macros confidently (e.g. unbranded mystery item), omit the field — the client falls back to a food-database lookup.

Skip non-food items (towels, magnets, drawer handles, the fridge itself).
Group identical items into a single entry with quantity ≥ 1.

Return ONLY valid JSON, no markdown:
{
  "items": [
    {
      "name": "greek yogurt",
      "quantity": 2,
      "unit": "each",
      "category": "dairy",
      "storageLocation": "fridge",
      "confidence": 0.92,
      "nutrition": {
        "perServing": { "calories": 100, "proteinGrams": 17, "carbsGrams": 6, "fatGrams": 0, "fiberGrams": 0 },
        "servingLabel": "1 5.3 oz container"
      }
    }
  ]
}`;

async function checkRateLimit(
  supabase: any,
  userId: string,
  endpoint: string,
  dailyLimit: number,
) {
  // Atomic via SECURITY DEFINER RPC. The previous read-modify-write
  // shape (count → check → insert) on `edge_function_calls` could leak
  // one extra call past the cap under concurrent same-user requests.
  // P0 fix from the 2026-05-17 security audit.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('bump_ai_usage', {
      p_user_id: userId,
      p_function_name: endpoint,
      p_date: today,
    });
    if (error) throw error;
    const newCount = Array.isArray(data) && data[0]
      ? (data[0] as any).count ?? 0
      : 0;
    if (newCount > dailyLimit) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      const retryAfter = Math.max(
        1,
        Math.round((tomorrow.getTime() - now.getTime()) / 1000),
      );
      return { allowed: false, limit: dailyLimit, retryAfter };
    }
    return { allowed: true, limit: dailyLimit };
  } catch (err) {
    console.error(`[${endpoint}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit: dailyLimit, retryAfter: 60 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } =
      await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tier check — same Plus / Pro gate as food-scan.
    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const isBetaTester =
      !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    const effectiveTier = isBetaTester
      ? 'pro'
      : (profile?.subscription_tier ?? 'free');

    if (effectiveTier !== 'pro' && effectiveTier !== 'plus') {
      return new Response(
        JSON.stringify({
          error: 'Pantry scanning requires PepTalk+ or Pro.',
          upgrade: true,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Tiered cap: Plus 5/day, Pro 20/day. Same per-tier shape as food-scan.
    const dailyLimit = effectiveTier === 'pro' ? 20 : 5;
    const rate = await checkRateLimit(supabase, user.id, 'aimee-pantry-scan', dailyLimit);
    if (!rate.allowed) {
      return new Response(
        JSON.stringify({
          error: `Daily pantry-scan limit reached (${rate.limit}/day).`,
          retryAfter: rate.retryAfter,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 2026-05-17 security fix: pre-parse size guard. The 6MB cap below
    // runs AFTER req.json() parses the body, so an attacker can stream
    // 100MB and OOM the worker before validation rejects it. Bail
    // immediately if Content-Length declares more than 10MB (gives
    // ~4MB headroom for the JSON wrapper around the base64 image).
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 10_000_000) {
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (imageBase64.length > 6_000_000) {
      return new Response(
        JSON.stringify({
          error: 'Image too large. Retake at lower quality.',
        }),
        {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const visionRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PANTRY_SCAN_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!visionRes.ok) {
      const detail = await visionRes.text().catch(() => '');
      console.error('[aimee-pantry-scan] vision err', visionRes.status, detail);
      return new Response(
        JSON.stringify({ error: 'Pantry scan temporarily unavailable' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const completion = await visionRes.json();
    const raw: string = completion?.choices?.[0]?.message?.content ?? '';
    let parsed: { items?: unknown[] } = {};
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Could not read the image. Try a clearer photo.',
          raw,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[aimee-pantry-scan] fatal', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'pantry scan error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
