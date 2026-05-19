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
import {
  S3Client,
  GetObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';

const WHISPER_KEY =
  Deno.env.get('OPENAI_TRANSCRIBE_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const CLASSIFIER_KEY =
  Deno.env.get('OPENAI_VISION_API_KEY') ??
  Deno.env.get('OPENAI_WHISPER_API_KEY') ??
  '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CLASSIFIER_URL = 'https://api.openai.com/v1/chat/completions';
const WHISPER_MODEL = 'whisper-1';
const CLASSIFIER_MODEL = 'gpt-4o-mini';

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

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: 'auto',
    endpoint: Deno.env.get('R2_ENDPOINT'),
    credentials: {
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
    },
  });
  return _s3;
}

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
    if (!WHISPER_KEY) return jsonResp({ error: 'OPENAI_WHISPER_API_KEY not set' }, 500);

    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim();
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return jsonResp({ error: 'Invalid slug' }, 400);
    }
    const exerciseListJson = body?.exerciseList; // optional override (passed by orchestrator)
    // 2026-05-18 fix: same cross-function sandbox issue as
    // migrate-video-to-stream — have the orchestrator pass objectKey
    // alongside the slug instead of importing the sibling manifest
    // (which resolves to a path outside this function's container).
    const objectKey = String(body?.objectKey ?? '').trim();
    if (!objectKey || objectKey.length > 500) {
      return jsonResp({ error: 'objectKey required' }, 400);
    }
    const entry = { slug, objectKey };

    // 1. Sign + fetch the video bytes.
    const bucket = Deno.env.get('R2_BUCKET') ?? 'peptalktraining';
    const getUrl = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: entry.objectKey }),
      { expiresIn: 600 },
    );
    const videoRes = await fetch(getUrl);
    if (!videoRes.ok || !videoRes.body) {
      return jsonResp({ error: `R2 fetch failed (${videoRes.status})` }, 502);
    }
    const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
    if (videoBytes.byteLength > 25_000_000) {
      // Whisper caps at 25MB. The orchestrator can fall back to vision
      // or manual tagging for these. Return a structured "skip".
      return jsonResp({
        ok: true,
        slug,
        exerciseId: null,
        category: null,
        confidence: 0,
        transcript: '',
        reason: `video too large for whisper (${videoBytes.byteLength} bytes)`,
      });
    }

    // 2. Whisper transcription.
    const form = new FormData();
    form.append('file', new Blob([videoBytes], { type: 'video/mp4' }), 'video.mp4');
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'text');
    form.append('temperature', '0');
    // Bias Whisper toward exercise vocabulary so partial words snap to
    // the right term (e.g. "curl" vs "girl"). Short prompts keep token
    // cost minimal.
    form.append(
      'prompt',
      'workout cable curl squat bench press dumbbell row deadlift lateral raise tricep extension chest fly hip thrust glute kickback shoulder lunge plank',
    );
    const whisperRes = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHISPER_KEY}` },
      body: form,
    });
    if (!whisperRes.ok) {
      const detail = await whisperRes.text().catch(() => '');
      return jsonResp({
        ok: true,
        slug,
        exerciseId: null,
        category: null,
        confidence: 0,
        transcript: '',
        reason: `whisper ${whisperRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const transcript = (await whisperRes.text()).trim();

    // Fast-path: empty or near-empty transcript → no narration cues.
    if (transcript.length < 8) {
      return jsonResp({
        ok: true,
        slug,
        exerciseId: null,
        category: null,
        confidence: 0,
        transcript,
        reason: 'transcript too short — no narration to classify',
      });
    }

    // 3. Classify with gpt-4o-mini.
    // The orchestrator passes the exercise list (id + name + category)
    // so we don't have to bundle the entire src/data/exercises.ts here.
    const exerciseList = Array.isArray(exerciseListJson)
      ? exerciseListJson.slice(0, 600) // hard cap on prompt size
      : [];
    if (exerciseList.length === 0) {
      return jsonResp({
        ok: true,
        slug,
        exerciseId: null,
        category: null,
        confidence: 0,
        transcript,
        reason: 'no exerciseList provided in request',
      });
    }

    const classifierSystem = `You map a workout-video transcript to a single exercise in a curated library. Return ONLY JSON:
{ "exerciseId": "<id from list or null>", "category": "<one of: cardio|strength|hiit|yoga|stretching|mobility|sport|warmup|recovery|other>", "confidence": 0.0-1.0, "reason": "<one short sentence>" }
Rules:
- If the transcript clearly names an exercise (e.g. "we're doing cable curls"), match its closest entry in the list. Use the exact id from the list, not a paraphrase.
- If the transcript is ambiguous or unrelated to exercise, return exerciseId: null and a confidence under 0.4.
- Confidence reflects how sure you are the user named THIS exercise. 0.85+ = explicit name; 0.5-0.85 = strongly implied; below 0.5 = uncertain.`;

    const classifierUser = `EXERCISE LIBRARY (id, name, category):
${exerciseList
  .map(
    (e: { id: string; name: string; category?: string }) =>
      `${e.id} | ${e.name} | ${e.category ?? '?'}`,
  )
  .join('\n')}

TRANSCRIPT FROM VIDEO ${slug}:
${transcript.slice(0, 4000)}`;

    const classifyRes = await fetch(CLASSIFIER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLASSIFIER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: 'system', content: classifierSystem },
          { role: 'user', content: classifierUser },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
    });
    if (!classifyRes.ok) {
      const detail = await classifyRes.text().catch(() => '');
      return jsonResp({
        ok: true,
        slug,
        exerciseId: null,
        category: null,
        confidence: 0,
        transcript,
        reason: `classifier ${classifyRes.status}: ${detail.slice(0, 200)}`,
      });
    }
    const classifyJson = await classifyRes.json();
    const raw = classifyJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* fallthrough → null prediction */ }

    return jsonResp({
      ok: true,
      slug,
      exerciseId: typeof parsed.exerciseId === 'string' ? parsed.exerciseId : null,
      category: typeof parsed.category === 'string' ? parsed.category : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      transcript,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    });
  } catch (err) {
    return jsonResp({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
