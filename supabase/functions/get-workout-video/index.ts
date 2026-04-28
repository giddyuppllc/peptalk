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
  // Accept either slug (looked up against the manifest server-side eventually)
  // OR the raw objectKey if the client already knows it. For now we trust the
  // app's manifest and accept objectKey directly — sligthly chattier API but
  // means we don't have to ship the manifest twice (client + server).
  const objectKey = body.objectKey;
  if (!objectKey || typeof objectKey !== 'string') {
    return json({ error: 'objectKey required' }, 400);
  }

  // 4. Sign
  try {
    const command = new GetObjectCommand({
      Bucket: Deno.env.get('R2_BUCKET') ?? 'peptalktraining',
      Key: objectKey,
    });
    const url = await getSignedUrl(s3(), command, { expiresIn: SIGN_TTL_SEC });
    return json({ url, expiresInSec: SIGN_TTL_SEC });
  } catch (err) {
    console.error('[get-workout-video] sign failed:', err);
    return json({ error: 'Failed to sign URL' }, 500);
  }
});
