/**
 * Lab Scan — Supabase Edge Function
 *
 * Takes a base64 image (photo of a printed lab report or PDF page) and
 * sends it to Grok Vision with a structured extraction prompt. Returns
 * an array of { markerId, value, unit, date } entries that the client
 * upserts into useLabResultsStore.
 *
 * Pro tier only (vision is the priciest call). Beta-tester allowlist
 * mirrors the other AI edge functions.
 *
 * Deploy: supabase functions deploy lab-scan
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

// Marker ids the client knows about. The model is told to emit ONLY these
// — anything it can't map confidently goes into a freeform `notes` array
// the client can review. Keep this in lockstep with src/store/useLabResultsStore.ts
// LAB_MARKERS.
const KNOWN_MARKER_IDS = [
  'hdl', 'ldl', 'total_chol', 'tg', 'apo_b', 'lp_a',
  'glucose', 'hba1c', 'insulin', 'homa_ir',
  't_total', 't_free', 'shbg', 'estradiol', 'dhea_s', 'cortisol',
  'tsh', 'free_t4', 'free_t3', 'igf_1',
  'hs_crp', 'homocyst',
  'alt', 'ast', 'alk_phos',
  'creatinine', 'egfr',
  'hgb', 'hct',
  'vit_d', 'b12', 'ferritin',
];

const LAB_SCAN_PROMPT = `You are extracting lab test results from a photo or PDF of a clinical lab report.

Return ONLY a valid JSON object in this exact shape:
{
  "drawDate": "YYYY-MM-DD",
  "results": [
    { "markerId": "hdl", "value": 58, "unit": "mg/dL" },
    { "markerId": "ldl", "value": 142, "unit": "mg/dL" }
  ],
  "unmappedNotes": [
    "Some marker we couldn't map: e.g. 'Albumin: 4.2 g/dL'"
  ]
}

CRITICAL RULES:
- Use ONLY these markerId values:
  ${KNOWN_MARKER_IDS.join(', ')}
- If you see a lab value that doesn't match one of the IDs above (e.g. albumin, BUN, sodium), put it in unmappedNotes as a plain string. Do NOT guess a markerId.
- Map common synonyms: "HDL Cholesterol" → hdl, "LDL Direct" → ldl, "TSH 3rd gen" → tsh, "Hemoglobin A1c" → hba1c, "Glucose, Fasting" → glucose, "25-Hydroxy Vitamin D" → vit_d, "Testosterone, Total" → t_total, "Testosterone, Free" → t_free.
- For drawDate, use the SPECIMEN COLLECTED date or DATE OF SERVICE — not the report date or the printed-on date.
- All numeric values must be NUMBERS, not strings. "5.4" not "5.4".
- Skip any value flagged as "below detection limit" or "INVALID" — don't make up numbers.
- Output JSON only — no prose, no markdown fences, no commentary.`;

// Beta-tester allowlist driven entirely by the BETA_TESTER_EMAILS
// Supabase secret (CSV). No hardcoded defaults — set with:
//   supabase secrets set BETA_TESTER_EMAILS="email1,email2,..."
const BETA_TESTER_EMAILS = new Set<string>(
  (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResp({ error: 'Missing auth token' }, 401);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResp({ error: 'Invalid auth token' }, 401);
    }

    // 2. Pro tier — beta tester allowlist mirrors the other AI fns.
    const isBetaTester = !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    const effectiveTier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    if (effectiveTier !== 'pro' && effectiveTier !== 'plus') {
      return jsonResp({
        error: 'Lab scanning requires PepTalk+ or Pro',
        upgrade: true,
      }, 403);
    }

    // 3. Tiered rate limit — Plus 5/day, Pro 20/day. Lab uploads are
    //    infrequent; the cap protects against accidental upload loops.
    const dailyLimit = effectiveTier === 'pro' ? 20 : 5;
    const rateLimit = await checkRateLimit(supabase, user.id, 'lab-scan', dailyLimit);
    if (!rateLimit.allowed) {
      return jsonResp({
        error: `Daily lab-scan limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    // 4. Parse + size guard
    // 2026-05-17 security fix: reject oversize bodies before parsing
    // so an attacker can't OOM the worker by streaming 100MB.
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > 10_000_000) {
      return jsonResp({ error: 'Request too large' }, 413);
    }
    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return jsonResp({ error: 'No image provided' }, 400);
    }
    if (imageBase64.length > 6_000_000) {
      return jsonResp({ error: 'Image too large. Compress and retry.' }, 413);
    }

    if (!OPENAI_API_KEY) {
      return jsonResp({ error: 'AI service not configured' }, 500);
    }

    // 5. Vision call
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
              { type: 'text', text: LAB_SCAN_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
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
      const err = await visionRes.text();
      console.error('[lab-scan] Vision API error:', err);
      return jsonResp({ error: 'Lab analysis temporarily unavailable' }, 502);
    }

    const completion = await visionRes.json();
    const rawContent = completion.choices?.[0]?.message?.content ?? '';

    // 6. Parse JSON — strip code fences just in case
    let parsed: any;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return jsonResp({
        error: 'Could not parse lab values from this image. Try a clearer photo or enter manually.',
        raw: rawContent.slice(0, 500),
      }, 422);
    }

    // 7. Validate shape — only return entries with a known markerId and a
    //    finite numeric value. Drop anything dubious so the client never
    //    upserts garbage.
    const knownSet = new Set(KNOWN_MARKER_IDS);
    const validResults = (Array.isArray(parsed.results) ? parsed.results : [])
      .filter((r: any) =>
        r &&
        typeof r.markerId === 'string' &&
        knownSet.has(r.markerId) &&
        typeof r.value === 'number' &&
        Number.isFinite(r.value) &&
        typeof r.unit === 'string',
      );

    return jsonResp({
      drawDate: typeof parsed.drawDate === 'string' ? parsed.drawDate : null,
      results: validResults,
      unmappedNotes: Array.isArray(parsed.unmappedNotes)
        ? parsed.unmappedNotes.filter((n: any) => typeof n === 'string').slice(0, 20)
        : [],
    });
  } catch (err) {
    console.error('[lab-scan] Error:', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
});

function jsonResp(body: unknown, status = 200): Response {
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
  // Atomic increment via bump_ai_usage RPC. P0 fix from 2026-05-17
  // security audit — the previous read-modify-write leaked one call
  // per concurrent same-user request.
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
