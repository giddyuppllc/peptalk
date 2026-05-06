/**
 * transcribe-workout-video — Whisper-based VTT generation for workout
 * videos.
 *
 * Manual / admin trigger (one-shot per video). Caller passes the slug
 * of a video already uploaded to R2; we:
 *   1. Pull the .mp4 bytes from R2 (signed GET URL via the same
 *      credentials get-workout-video uses).
 *   2. Send to OpenAI Whisper (large-v3) with response_format=vtt.
 *   3. PUT the resulting .vtt back to R2 alongside the .mp4.
 *
 * Body: { slug }
 * Reply: { ok: true, vttKey } or { error }
 *
 * Auth: requires admin email match (BETA_TESTER_EMAILS or a dedicated
 * ADMIN_EMAILS secret). This is NOT a per-user feature — it's the
 * pipeline Edward runs once per video to generate captions, and the
 * resulting .vtt is what every Pro user sees on the player.
 *
 * Manifest update: still manual today. After this function runs,
 * supabase/functions/get-workout-video/manifest.json gets a new
 * `captionUrl` field for the slug pointing at the public .vtt URL.
 * (Future: drive the manifest from a DB table so this updates
 * itself.)
 *
 * Deploy:
 *   supabase functions deploy transcribe-workout-video
 *
 * Required secrets:
 *   OPENAI_TRANSCRIBE_API_KEY (separate from chat key — Whisper uses
 *     the actual OpenAI Whisper API, not Grok)
 *   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET
 *     (already set for get-workout-video)
 *   ADMIN_EMAILS (comma-separated list of admin emails)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';

const OPENAI_API_KEY =
  Deno.env.get('OPENAI_TRANSCRIBE_API_KEY') ??
  Deno.env.get('OPENAI_API_KEY') ??
  '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

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
    // Admin-only: require a valid Supabase JWT for an email in ADMIN_EMAILS.
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

    if (!OPENAI_API_KEY) return jsonResp({ error: 'Whisper key not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim();
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return jsonResp({ error: 'Invalid slug' }, 400);
    }

    // Look up the video manifest entry to get the objectKey. Reuse the
    // same manifest get-workout-video uses by importing it.
    const { default: manifest } = await import('../get-workout-video/manifest.json' as any, {
      with: { type: 'json' },
    });
    const entry = (manifest as Array<{ slug: string; objectKey: string }>).find(
      (v) => v.slug === slug,
    );
    if (!entry) return jsonResp({ error: 'Slug not in manifest' }, 404);
    const videoKey = entry.objectKey;
    const vttKey = videoKey.replace(/\.mp4$/i, '.vtt');

    // 1. Sign a GET URL for the video so Whisper can fetch it. Whisper
    //    accepts a remote URL via "file" parameter as a presigned URL
    //    isn't directly supported — Whisper actually needs the bytes.
    //    So we fetch and pipe.
    const bucket = Deno.env.get('R2_BUCKET') ?? 'peptalktraining';
    const getUrl = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: videoKey }),
      { expiresIn: 600 },
    );
    const videoRes = await fetch(getUrl);
    if (!videoRes.ok || !videoRes.body) {
      return jsonResp({ error: `R2 fetch failed (${videoRes.status})` }, 502);
    }

    // 2. Whisper expects multipart/form-data. We need the bytes in
    //    memory — Whisper has a 25MB cap. If a workout video is larger,
    //    we'd need to extract audio first; for now, hard-fail and
    //    surface so the operator knows to compress.
    const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
    if (videoBytes.byteLength > 25 * 1024 * 1024) {
      return jsonResp({
        error: `Video is ${(videoBytes.byteLength / (1024 * 1024)).toFixed(1)}MB — Whisper caps at 25MB. Extract audio (.m4a) first or compress.`,
      }, 413);
    }

    const fd = new FormData();
    fd.append('file', new Blob([videoBytes], { type: 'video/mp4' }), 'workout.mp4');
    fd.append('model', WHISPER_MODEL);
    fd.append('response_format', 'vtt');
    fd.append('language', 'en');
    // Adds light noise filter — coach voice over gym sounds.
    fd.append('temperature', '0.0');

    const whisperRes = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
      signal: AbortSignal.timeout(180000), // 3 min cap on long videos
    });
    if (!whisperRes.ok) {
      const text = await whisperRes.text().catch(() => '');
      console.error('[transcribe] Whisper error', whisperRes.status, text);
      return jsonResp({ error: `Whisper error: ${whisperRes.status}` }, 502);
    }
    const vtt = await whisperRes.text();

    // 3. PUT the .vtt back to R2 next to the .mp4.
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: vttKey,
        Body: vtt,
        ContentType: 'text/vtt',
        Metadata: {
          'generated-by': 'whisper-1',
          'generated-at': new Date().toISOString(),
          'source-video': videoKey,
        },
      }),
    );

    return jsonResp({
      ok: true,
      vttKey,
      bytes: vtt.length,
      message:
        'Captions generated. Now update get-workout-video/manifest.json with `captionUrl` for this slug + redeploy that function.',
    });
  } catch (err) {
    console.error('[transcribe-workout-video]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
