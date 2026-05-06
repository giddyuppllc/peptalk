/**
 * get-workout-video — Supabase Edge Function
 *
 * Returns a short-lived signed URL for a video in the R2
 * peptalktraining bucket. Tier-gated: Pro only.
 *
 * Body:  { slug: string }   (matches WorkoutVideo.slug from src/data/workoutVideos.ts)
 * Reply: { url: string, expiresInSec: number }   on 200
 *        { error: string }                       on 401 / 403 / 404 / 500
 *
 * Deploy:
 *   supabase functions deploy get-workout-video
 *
 * Required secrets (set once with `supabase secrets set ...`):
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET            peptalktraining
 *   ALLOW_TAGGER_FREE    optional "true" to let Jamie/admin emails resolve URLs
 *                        regardless of tier (so the tagger UI can preview videos)
 *   ADMIN_EMAILS         comma-separated list — used with ALLOW_TAGGER_FREE
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  GetObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';
import manifest from './manifest.json' with { type: 'json' };

// Slug → objectKey allowlist built once at cold start. We refuse to sign
// any key that isn't in this map, even for authenticated Pro users —
// otherwise a tampered client could ask us to sign arbitrary R2 paths
// (e.g. `../private/*`) and use Pro tier as a bucket-wide URL minter.
//
// Optional .vtt caption files live alongside the video — when the
// manifest entry has captionKey set (or the .mp4 was processed by
// transcribe-workout-video and its sibling .vtt landed in R2), we
// also sign a GET URL for the captions and return both.
interface ManifestEntry {
  slug: string;
  objectKey: string;
  captionKey?: string;
}
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

// Lazy S3 client — single instance per function instance (warm starts reuse).
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

  // 1. Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: 'Invalid auth token' }, 401);
  const userId = userData.user.id;
  const userEmail = (userData.user.email ?? '').toLowerCase();

  // 2. Tier check (server-side — defense in depth even though the app pre-checks)
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier, is_pro')
    .eq('id', userId)
    .single();
  const tier = profile?.subscription_tier ?? 'free';
  const isPro = tier === 'pro' || profile?.is_pro === true;

  // Tagger override — admin emails can preview videos for tagging without Pro.
  const taggerOverride =
    Deno.env.get('ALLOW_TAGGER_FREE') === 'true' &&
    (Deno.env.get('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(userEmail);

  if (!isPro && !taggerOverride) {
    return json({ error: 'Workout videos require PepTalk Pro' }, 403);
  }

  // 3. Parse body
  let body: { slug?: string; objectKey?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  // Resolve slug → objectKey via the server-side allowlist. We ignore any
  // objectKey the client passed and look it up ourselves; this prevents a
  // tampered client from asking us to sign arbitrary R2 paths.
  const slug = body.slug;
  if (!slug || typeof slug !== 'string') {
    return json({ error: 'slug required' }, 400);
  }
  const entry = ALLOWED_KEYS.get(slug);
  if (!entry) {
    return json({ error: 'Unknown video slug' }, 404);
  }

  // 4. Sign — main video URL + optional captions URL.
  try {
    const bucket = Deno.env.get('R2_BUCKET') ?? 'peptalktraining';
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: entry.objectKey }),
      { expiresIn: SIGN_TTL_SEC },
    );
    let captionUrl: string | undefined;
    if (entry.captionKey) {
      try {
        captionUrl = await getSignedUrl(
          s3(),
          new GetObjectCommand({ Bucket: bucket, Key: entry.captionKey }),
          { expiresIn: SIGN_TTL_SEC },
        );
      } catch (err) {
        // Captions failure shouldn't kill video playback.
        console.warn('[get-workout-video] caption sign failed:', err);
      }
    }
    return json({ url, captionUrl, expiresInSec: SIGN_TTL_SEC });
  } catch (err) {
    console.error('[get-workout-video] sign failed:', err);
    return json({ error: 'Failed to sign URL' }, 500);
  }
});
