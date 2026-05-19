/**
 * get-workout-video — Supabase Edge Function
 *
 * Returns a short-lived playback URL for a workout video. Tier-gated: Pro only.
 *
 * Two backends, branched on the manifest entry:
 *   - Cloudflare Stream  (preferred — entry has streamUid)
 *     Returns an HLS .m3u8 URL + RS256-signed JWT in the ?token= param.
 *     Also returns Stream's current `meta.name` so Jamie's renames in
 *     the Cloudflare dashboard flow live into the app on next play.
 *   - Cloudflare R2      (legacy / fallback — entry only has objectKey)
 *     Returns an S3-style presigned MP4 URL.
 *
 * Body:  { slug: string }   (matches WorkoutVideo.slug from src/data/workoutVideos.ts)
 * Reply: { url, captionUrl?, title?, expiresInSec }            on 200
 *        { error: string }                                     on 401 / 403 / 404 / 500
 *
 * Deploy:
 *   supabase functions deploy get-workout-video
 *
 * Required secrets:
 *   R2_ACCESS_KEY_ID                         — R2 legacy path
 *   R2_SECRET_ACCESS_KEY                     — R2 legacy path
 *   R2_ENDPOINT                              — R2 legacy path
 *   R2_BUCKET                                — R2 legacy path (default peptalktraining)
 *   CLOUDFLARE_ACCOUNT_ID                    — Stream path (account id for the API + customer-<id>.cloudflarestream.com)
 *   CLOUDFLARE_STREAM_SIGNING_KEY_ID         — Stream signing key id (kid claim)
 *   CLOUDFLARE_STREAM_SIGNING_KEY_PEM        — Stream signing key PEM (PKCS8 RSA private key)
 *   CLOUDFLARE_API_TOKEN                     — Stream path (read meta.name); Stream:Read scope is enough
 *   ALLOW_TAGGER_FREE                        — optional "true" to let admin emails preview without Pro
 *   ADMIN_EMAILS                             — comma-separated list (admin override)
 *   BETA_TESTER_EMAILS                       — comma-separated list (beta bypass)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  GetObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';
import manifest from './manifest.json' with { type: 'json' };
import { signStreamToken } from './_stream-jwt.ts';

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
  /** Cloudflare Stream UID. Present means we prefer the Stream playback
   *  path; absent means fall back to R2 signing. */
  streamUid?: string;
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

  // Beta-tester bypass — same pattern as food-scan / aimee-pantry-scan.
  // Test users on free tier get video access so they can validate the
  // player + content without paying. Set BETA_TESTER_EMAILS in secrets
  // as a comma-separated list.
  const isBetaTester =
    !!userEmail &&
    (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(userEmail);

  if (!isPro && !taggerOverride && !isBetaTester) {
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

  // 4. Sign — Stream path when streamUid is present, R2 fallback otherwise.
  //    Stream failures (bad PEM, CF API hiccup) also fall through to R2,
  //    so a misconfigured secret can't take down videos that have R2
  //    backups available.
  try {
    if (entry.streamUid) {
      try {
        const streamResult = await signStreamPlayback(entry);
        return json({
          ...streamResult,
          expiresInSec: SIGN_TTL_SEC,
        });
      } catch (err) {
        console.warn(
          `[get-workout-video] stream sign failed for ${entry.slug} (${entry.streamUid}); falling back to R2:`,
          err,
        );
        // fall through to R2 path below
      }
    }
    // R2 path — legacy storage, kept as the cold backup. Used either
    // for unmigrated videos or when Stream signing errors out.
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

interface StreamPlaybackResult {
  url: string;
  /** Stream's stored display name. Authoritative — Jamie can rename via
   *  the Cloudflare dashboard and the app reflects it on next play. */
  title?: string;
  /** Stream auto-generates thumbnails; we expose one so the player can
   *  show a poster while loading. */
  posterUrl?: string;
}

/**
 * 60-second cache for Stream `meta.name` lookups. Without this, every
 * video play would re-hit Cloudflare's API to read the title — which
 * (a) adds ~50-200ms to playback resolution, and (b) burns through the
 * API's per-token rate budget for a value that changes maybe once a
 * week (when Jamie renames something in the dashboard).
 */
const META_NAME_CACHE_TTL_MS = 60 * 1000;
const metaNameCache = new Map<string, { name: string | undefined; expiresAt: number }>();
const META_FETCH_TIMEOUT_MS = 5_000;

/**
 * Build a signed Stream HLS URL + return the current display name + a
 * signed poster URL. The name lookup is best-effort — if the API call
 * fails we still return the playback URL (Jamie's renames are a
 * nice-to-have over the bundled title, not load-bearing).
 */
async function signStreamPlayback(entry: ManifestEntry): Promise<StreamPlaybackResult> {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ?? '';
  const keyId = Deno.env.get('CLOUDFLARE_STREAM_SIGNING_KEY_ID') ?? '';
  const keyPem = Deno.env.get('CLOUDFLARE_STREAM_SIGNING_KEY_PEM') ?? '';
  if (!accountId || !keyId || !keyPem) {
    throw new Error('stream_secrets_missing');
  }
  const videoUid = entry.streamUid!;

  const token = await signStreamToken({
    videoUid,
    keyId,
    privateKeyPem: keyPem,
    ttlSec: SIGN_TTL_SEC,
  });

  const playbackBase = `https://customer-${accountId}.cloudflarestream.com/${videoUid}`;
  const encodedToken = encodeURIComponent(token);
  const url = `${playbackBase}/manifest/video.m3u8?token=${encodedToken}`;
  // Thumbnails are also gated when the video has requireSignedURLs=true
  // (which the migration script sets on every video). The token has to
  // be in the URL or Stream returns 401.
  const posterUrl = `${playbackBase}/thumbnails/thumbnail.jpg?time=2s&token=${encodedToken}`;

  const title = await fetchStreamName(accountId, videoUid);
  return { url, title, posterUrl };
}

async function fetchStreamName(accountId: string, videoUid: string): Promise<string | undefined> {
  const now = Date.now();
  const cached = metaNameCache.get(videoUid);
  if (cached && cached.expiresAt > now) return cached.name;

  const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!apiToken) return undefined;

  let name: string | undefined;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${videoUid}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
      },
    );
    if (res.ok) {
      const body = (await res.json()) as { result?: { meta?: { name?: string } } };
      const rawName = body.result?.meta?.name?.trim();
      if (rawName) name = rawName;
    } else {
      console.warn(`[get-workout-video] stream meta fetch ${res.status} for ${videoUid}`);
    }
  } catch (err) {
    // Network error / timeout / abort — log and proceed with cached
    // miss. Caller falls back to bundled title.
    console.warn('[get-workout-video] stream meta fetch failed:', err);
  }
  // Cache even a miss so a 404/transient error doesn't get hit again
  // for every playback in the next minute.
  metaNameCache.set(videoUid, { name, expiresAt: now + META_NAME_CACHE_TTL_MS });
  return name;
}
