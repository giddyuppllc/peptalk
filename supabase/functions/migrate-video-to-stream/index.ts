/**
 * migrate-video-to-stream — copies one R2 video into Cloudflare Stream.
 *
 * Admin-only. Takes a slug, looks it up in the get-workout-video manifest,
 * presigns a 7-day R2 GET URL, POSTs it to Cloudflare Stream's
 * `/stream/copy` endpoint. Stream pulls the video, transcodes to HLS,
 * returns a UID. We return the UID + readyToStream flag — the orchestrator
 * script saves the UID in manifest.draft.json.
 *
 * Body:  { slug: string, name?: string }
 * Reply: { ok, slug, streamUid, readyToStream, status, raw? }
 *
 * Async — Stream transcodes in the background (~1–5 min per video). The
 * UID is usable as soon as the copy is accepted; the player just waits
 * for readyToStream to flip true. Callers can re-poll if they want
 * to verify.
 *
 * Deploy:
 *   supabase functions deploy migrate-video-to-stream
 *
 * Required secrets (all set earlier):
 *   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   ADMIN_EMAILS
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  GetObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonResp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
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
    // Admin auth.
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

    const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? '';
    const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') ?? '';
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
      return jsonResp({ error: 'Cloudflare creds not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim();
    const name = String(body?.name ?? slug).trim();
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return jsonResp({ error: 'Invalid slug' }, 400);
    }

    // Look up the manifest entry to get the R2 objectKey.
    const { default: manifest } = await import('../get-workout-video/manifest.json' as any, {
      with: { type: 'json' },
    });
    const entry = (manifest as Array<{ slug: string; objectKey: string; streamUid?: string }>)
      .find((v) => v.slug === slug);
    if (!entry) return jsonResp({ error: 'Slug not in manifest' }, 404);
    if (entry.streamUid) {
      // Already migrated — return idempotently.
      return jsonResp({
        ok: true,
        slug,
        streamUid: entry.streamUid,
        readyToStream: true,
        status: 'already-migrated',
      });
    }

    // 1. 7-day R2 presigned URL so Stream's async copier has time to pull.
    const bucket = Deno.env.get('R2_BUCKET') ?? 'peptalktraining';
    const r2Url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: entry.objectKey }),
      { expiresIn: 7 * 24 * 3600 },
    );

    // 2. POST to Stream's copy endpoint.
    const copyRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: r2Url,
          meta: { name, sourceSlug: slug, sourceKey: entry.objectKey },
          requireSignedURLs: true,
        }),
      },
    );
    const copyBody = await copyRes.json().catch(() => ({}));
    if (!copyRes.ok) {
      return jsonResp({
        error: 'Cloudflare Stream copy failed',
        cfStatus: copyRes.status,
        cfErrors: copyBody?.errors,
      }, 502);
    }

    const result = copyBody?.result;
    const streamUid: string | undefined = result?.uid;
    if (!streamUid) {
      return jsonResp({
        error: 'Stream copy returned no UID',
        raw: copyBody,
      }, 502);
    }

    return jsonResp({
      ok: true,
      slug,
      streamUid,
      readyToStream: !!result?.readyToStream,
      status: result?.status?.state ?? 'queued',
    });
  } catch (err) {
    return jsonResp({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
