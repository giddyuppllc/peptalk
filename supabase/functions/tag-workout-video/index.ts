/**
 * tag-workout-video — auto-tagger for the workout-video manifest.
 *
 * Admin-only. Takes a slug, pulls the .mp4 from R2, transcribes with
 * Whisper, then asks gpt-4o-mini to map the transcript onto one of
 * the 451 curated exercise IDs (and one of the WorkoutVideoCategory
 * values). Returns the prediction + confidence + raw transcript so the
 * local orchestrator script can decide whether to auto-apply or flag
 * for human review.
 *
 * Body:  { slug: string }
 * Reply: {
 *   ok: true,
 *   slug,
 *   exerciseId: string | null,
 *   category: string | null,
 *   confidence: number,     // 0..1, gpt-4o-mini's self-reported
 *   transcript: string,
 *   reason: string,
 * }
 *
 * Cost per call: ~$0.005 (Whisper for ~30s clip + ~500 tokens through
 * gpt-4o-mini). 293 videos → ~$1.50 total.
 *
 * Deploy:
 *   supabase functions deploy tag-workout-video
 *
 * Required secrets (all already set for sibling fns):
 *   OPENAI_TRANSCRIBE_API_KEY or OPENAI_WHISPER_API_KEY  (Whisper)
 *   OPENAI_VISION_API_KEY or OPENAI_WHISPER_API_KEY      (classifier)
 *   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET
 *   ADMIN_EMAILS
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signStreamToken, streamThumbnailUrl } from '../_shared/streamSign.ts';

// 2026-05-19 vision pivot: the Whisper path returned 0 useful predictions
// across 293 videos. These are silent exercise demos with no narration —
// iPhone HEVC mp4s either had no audio track or audio Whisper couldn't
// decode. Switched to a vision-based tagger that grabs a Cloudflare
// Stream thumbnail (every migrated video has one) and asks gpt-4o what
// exercise is shown in the frame.
const VISION_API_KEY =
  Deno.env.get('OPENAI_VISION_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const CLASSIFIER_URL = 'https://api.openai.com/v1/chat/completions';
// gpt-4o (full, not -mini) for accuracy — exercise recognition from a
// single frame is harder than food recognition. Still cheap enough at
// 293 videos (~$0.01 each = ~$3 total).
const VISION_MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResp = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    // Auth — internal-key fast path for orchestrator scripts, falls back
    // to admin user JWT for interactive calls. See migrate-video-to-stream
    // for the same pattern.
    const INTERNAL_MIGRATION_KEY = Deno.env.get('INTERNAL_MIGRATION_KEY') ?? '';
    const providedInternalKey = req.headers.get('x-internal-key') ?? '';
    const isInternal =
      !!INTERNAL_MIGRATION_KEY && providedInternalKey === INTERNAL_MIGRATION_KEY;

    if (!isInternal) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResp({ error: 'Missing auth' }, 401);
      const token = authHeader.replace('Bearer ', '');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return jsonResp({ error: 'Invalid auth' }, 401);
      const userEmail = (user.email ?? '').toLowerCase();
      const adminEmails = (Deno.env.get('ADMIN_EMAILS') ?? '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!adminEmails.includes(userEmail)) {
        return jsonResp({ error: 'Admin only.' }, 403);
      }
    }
    if (!VISION_API_KEY) return jsonResp({ error: 'OPENAI_VISION_API_KEY not set' }, 500);

    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim();
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return jsonResp({ error: 'Invalid slug' }, 400);
    }
    const exerciseListJson = body?.exerciseList; // passed by orchestrator
    const streamUid = String(body?.streamUid ?? '').trim();
    if (!streamUid) {
      return jsonResp({ error: 'streamUid required (vision mode)' }, 400);
    }

    // 1. Fetch a thumbnail frame from Cloudflare Stream. Signed URLs
    // are required because we set requireSignedURLs:true on copy. We
    // sample multiple offsets so a single black frame doesn't tank the
    // classification — pick the largest non-trivial JPEG.
    const sampleTimes = [2, 5, 9]; // seconds into the clip
    let bestThumb: Uint8Array | null = null;
    let bestUrl = '';
    for (const t of sampleTimes) {
      try {
        const token = await signStreamToken(streamUid, 300);
        const thumbUrl = streamThumbnailUrl(streamUid, token, t);
        const r = await fetch(thumbUrl);
        if (!r.ok) continue;
        const bytes = new Uint8Array(await r.arrayBuffer());
        // Reject obviously-empty thumbnails (< 4KB is almost always a
        // black or solid-color frame from a video start/end).
        if (bytes.byteLength < 4096) continue;
        if (!bestThumb || bytes.byteLength > bestThumb.byteLength) {
          bestThumb = bytes;
          bestUrl = thumbUrl;
        }
      } catch {
        /* try next offset */
      }
    }
    if (!bestThumb) {
      return jsonResp({
        ok: true, slug, exerciseId: null, category: null, confidence: 0,
        transcript: '', reason: 'no usable thumbnail from any time offset',
      });
    }

    // base64 for the OpenAI image_url payload. (data URL form — vision
    // models accept this without a publicly-accessible URL.)
    let bin = '';
    for (const b of bestThumb) bin += String.fromCharCode(b);
    const dataUrl = `data:image/jpeg;base64,${btoa(bin)}`;

    // 2. Classify with gpt-4o vision.
    const exerciseList = Array.isArray(exerciseListJson)
      ? exerciseListJson.slice(0, 600) // hard cap on prompt size
      : [];
    if (exerciseList.length === 0) {
      return jsonResp({
        ok: true, slug, exerciseId: null, category: null, confidence: 0,
        transcript: '', reason: 'no exerciseList provided in request',
      });
    }

    const classifierSystem = `You identify a fitness exercise from a single video frame and map it to a curated library. Return ONLY JSON:
{ "exerciseId": "<id from list or null>", "category": "<one of: cardio|strength|hiit|yoga|stretching|mobility|sport|warmup|recovery|other>", "confidence": 0.0-1.0, "reason": "<one short sentence about what you see>" }
Rules:
- Identify what exercise is being performed based on body position, equipment, and movement context visible in the frame.
- Match the closest entry in the library. Use the exact id from the list, not a paraphrase.
- If the frame is too ambiguous (e.g. just a person standing, blurry, off-screen), return exerciseId: null with confidence < 0.4.
- Confidence: 0.85+ = unmistakable (e.g. clear barbell back squat at depth); 0.5-0.85 = strongly implied (e.g. dumbbell in hand, mid-row position); below 0.5 = uncertain.`;

    const classifierUser = `EXERCISE LIBRARY (id, name, category):
${exerciseList
  .map(
    (e: { id: string; name: string; category?: string }) =>
      `${e.id} | ${e.name} | ${e.category ?? '?'}`,
  )
  .join('\n')}

Identify the exercise in the attached video frame for video ${slug}.`;

    const classifyRes = await fetch(CLASSIFIER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VISION_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: classifierSystem },
          {
            role: 'user',
            content: [
              { type: 'text', text: classifierUser },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
    });
    if (!classifyRes.ok) {
      const detail = await classifyRes.text().catch(() => '');
      return jsonResp({
        ok: true, slug, exerciseId: null, category: null, confidence: 0,
        transcript: '',
        reason: `classifier ${classifyRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const classifyJson = await classifyRes.json();
    const raw = classifyJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* null prediction */ }

    return jsonResp({
      ok: true,
      slug,
      exerciseId: typeof parsed.exerciseId === 'string' ? parsed.exerciseId : null,
      category: typeof parsed.category === 'string' ? parsed.category : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      transcript: '', // legacy field — kept so the orchestrator's old shape still parses
      thumbnailUrl: bestUrl,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    });
  } catch (err) {
    return jsonResp({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
