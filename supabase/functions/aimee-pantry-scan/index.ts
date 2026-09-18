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
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';
import { reportError } from '../_shared/sentry.ts';
import { checkAiAllowance, recordAiSpend } from '../_shared/aiAllowance.ts';

// 2026-05-20 vision routing fix: Grok-4.x does not accept image inputs
// (food-scan caught this 2026-05-17, this fn was missed). Route to
// OpenAI gpt-4o-mini same as food-scan — same API shape, accurate
// recognition, way cheaper than Grok vision would be even if it
// existed. Reuses the OpenAI key already set for Whisper.
const VISION_API_KEY =
  Deno.env.get('OPENAI_VISION_API_KEY') ??
  Deno.env.get('OPENAI_TRANSCRIBE_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const VISION_BASE_URL =
  Deno.env.get('OPENAI_VISION_BASE_URL') ?? 'https://api.openai.com/v1';
const VISION_MODEL =
  Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';

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
    const effectiveTier = await resolveEffectiveTier(supabase, user.id, {
      profileTier: profile?.subscription_tier,
      isBetaTester,
    });

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

    if (!VISION_API_KEY) {
      return new Response(JSON.stringify({ error: 'Vision service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Monthly allowance, shared with aimee-chat-stream. This was a per-day
    // count (Plus 5/day, Pro 20/day). "i dont want a daily cap" (2026-08-26): the
    // per-tier monthly allowance and the system-wide breaker in _cost.ts
    // are the limit, and the spend is recorded below so the breaker sees it.
    // Read-only, so a refused or failed call consumes nothing and there is
    // no longer anything to refund.
    const allowance = await checkAiAllowance(supabase, user.id, effectiveTier);
    if (!allowance.allowed) {
      return new Response(JSON.stringify(allowance.body), {
        status: allowance.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const visionCall = () => fetch(`${VISION_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VISION_API_KEY}`,
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

    let visionRes: Response;
    try {
      visionRes = await visionCall();
    } catch (err) {
      // Network/timeout — no result delivered.
      console.error('[aimee-pantry-scan] vision request failed', err);
      return new Response(
        JSON.stringify({ error: 'Pantry scan temporarily unavailable' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

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
    await recordAiSpend(supabase, user.id, allowance.cost, completion);
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
