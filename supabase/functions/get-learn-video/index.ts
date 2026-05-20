/**
 * get-learn-video — Supabase Edge Function
 *
 * Returns a short-lived signed URL for a Learn / educational video in
 * the R2 `peptalktraining` bucket. Auth-only, no tier gate — these
 * videos are part of the free educational content (peptide safety,
 * reconstitution technique, etc.).
 *
 * Body:  { slug: string }   (matches an entry in manifest.json)
 * Reply: { url: string, expiresInSec: number }   on 200
 *        { error: string }                       on 401 / 404 / 500
 *
 * Deploy:
 *   supabase functions deploy get-learn-video
 *
 * Required secrets (already set for get-workout-video):
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET            peptalktraining
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  GetObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';
import manifest from './manifest.json' with { type: 'json' };

interface ManifestEntry {
  slug: string;
  objectKey: string;
  posterKey?: string;
  durationSec?: number;
  captionKey?: string;
  /** Cloudflare Stream UID after migration. */
  streamUid?: string;
}

// Slug → objectKey allowlist built once at cold start. Same defense-in-
// depth pattern as get-workout-video — refuse to sign any key not in the
// manifest, even for authenticated users.
const ALLOWED_KEYS = new Map<string, ManifestEntry>();
for (const v of manifest as ManifestEntry[]) {
  if (v.slug && v.objectKey) ALLOWED_KEYS.set(v.slug, v);
}

const SIGN_TTL_SEC = 6 * 60 * 60; // 6 hours

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200): Response =>
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: 'Invalid auth token' }, 401);

  let body: { slug?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const slug = body.slug;
  if (!slug || typeof slug !== 'string') {
    return json({ error: 'slug required' }, 400);
  }
  const entry = ALLOWED_KEYS.get(slug);
  if (!entry) {
    return json({ error: 'Unknown video slug' }, 404);
  }

  try {
    // Stream-first migration path. If the manifest entry has been
    // copied to Cloudflare Stream, return the HLS signed URL — the
    // client gets adaptive bitrate + faster startup. Otherwise fall
    // back to the legacy R2 GET URL.
    if (entry.streamUid) {
      const { signStreamToken, streamHlsUrl } = await import('../_shared/streamSign.ts');
      const token = await signStreamToken(entry.streamUid, SIGN_TTL_SEC);
      return json({
        url: streamHlsUrl(entry.streamUid, token),
        source: 'cloudflare-stream',
        durationSec: entry.durationSec,
        expiresInSec: SIGN_TTL_SEC,
      });
    }
    const bucket = Deno.env.get('R2_BUCKET') ?? 'peptalktraining';
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: entry.objectKey }),
      { expiresIn: SIGN_TTL_SEC },
    );
    let posterUrl: string | undefined;
    if (entry.posterKey) {
      try {
        posterUrl = await getSignedUrl(
          s3(),
          new GetObjectCommand({ Bucket: bucket, Key: entry.posterKey }),
          { expiresIn: SIGN_TTL_SEC },
        );
      } catch (err) {
        // Poster failure shouldn't kill video playback.
        console.warn('[get-learn-video] poster sign failed:', err);
      }
    }
    let captionUrl: string | undefined;
    if (entry.captionKey) {
      try {
        captionUrl = await getSignedUrl(
          s3(),
          new GetObjectCommand({ Bucket: bucket, Key: entry.captionKey }),
          { expiresIn: SIGN_TTL_SEC },
        );
      } catch (err) {
        console.warn('[get-learn-video] caption sign failed:', err);
      }
    }
    return json({
      url,
      posterUrl,
      captionUrl,
      source: 'r2',
      durationSec: entry.durationSec,
      expiresInSec: SIGN_TTL_SEC,
    });
  } catch (err) {
    console.error('[get-learn-video] sign failed:', err);
    return json({ error: 'Failed to sign URL' }, 500);
  }
});
