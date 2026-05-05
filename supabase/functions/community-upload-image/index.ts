/**
 * community-upload-image — Supabase Edge Function
 *
 * Returns a short-lived signed PUT URL for uploading an image to the R2
 * community-images bucket, plus a deterministic public-read URL the
 * client can persist on the post / comment row after the upload
 * completes.
 *
 * Body:
 *   {
 *     contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic',
 *     size: number,         // bytes — caller's reported file size, capped server-side
 *     kind?: 'post' | 'comment' | 'avatar',
 *   }
 *
 * Reply (200):
 *   {
 *     uploadUrl: string,    // PUT this URL with the raw bytes + Content-Type header
 *     publicUrl: string,    // store on the post row once upload completes
 *     key: string,          // R2 object key, useful for moderation / deletion
 *     expiresInSec: number,
 *   }
 *
 * Reply (4xx/5xx): { error: string }
 *
 * Deploy:
 *   supabase functions deploy community-upload-image
 *
 * Required secrets:
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT             e.g. https://<accountid>.r2.cloudflarestorage.com
 *   R2_COMMUNITY_BUCKET     e.g. peptalk-community
 *   R2_PUBLIC_BASE          e.g. https://images.peptalkapp.com  — the
 *                           public-read CDN/edge URL the bucket is
 *                           served from. The function MUST NOT make the
 *                           uploaded objects directly readable from R2;
 *                           the public-read mapping is configured on
 *                           the CDN side, scoped only to this bucket.
 *
 * Notes:
 *   - 5MB size cap (chosen empirically — average iPhone HEIC is 1-3MB,
 *     re-encoded JPEG is ~500KB-1.5MB; 5MB is the comfortable ceiling).
 *   - 5-minute TTL on the PUT URL — long enough to upload over a poor
 *     mobile connection, short enough that a leaked URL can't be
 *     re-used the next day.
 *   - Image moderation is NOT done here — this function only mints
 *     URLs. Posts that reference unmoderated images go through the
 *     existing community moderation flow before they're shown widely.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  PutObjectCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.658.1';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const ALLOWED_KINDS = new Set(['post', 'comment', 'avatar']);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const SIGN_TTL_SEC = 5 * 60; // 5 minutes

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

// Lazy S3 client (warm-start reuse).
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

  // 1. Auth — anyone signed in can upload (community is free-tier).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing auth token' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return json({ error: 'Invalid auth token' }, 401);
  const userId = userData.user.id;

  // 2. Block users currently in moderation timeout. The community
  //    moderate path can flag a user_status row that prevents new posts
  //    — that should also prevent fresh image uploads (which would
  //    otherwise sit in storage as orphans).
  const { data: status } = await supabase
    .from('community_user_status')
    .select('is_blocked, banned_until')
    .eq('user_id', userId)
    .maybeSingle();
  if (status?.is_blocked) {
    return json({ error: 'Account blocked from uploads' }, 403);
  }
  if (status?.banned_until && new Date(status.banned_until) > new Date()) {
    return json({ error: 'Upload privileges temporarily suspended' }, 403);
  }

  // 3. Body
  let body: { contentType?: string; size?: number; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const contentType = (body.contentType ?? '').toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: 'Unsupported image type' }, 400);
  }
  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return json({ error: 'Size required' }, 400);
  }
  if (size > MAX_SIZE_BYTES) {
    return json({ error: `Image too large (max ${MAX_SIZE_BYTES} bytes)` }, 413);
  }
  const kind = body.kind && ALLOWED_KINDS.has(body.kind) ? body.kind : 'post';

  // 4. Mint a deterministic key under the user's namespace. UUID + date
  //    keeps keys collision-free even if two devices upload at the
  //    same second; the date prefix makes lifecycle/cleanup queries easy.
  const ext = TYPE_TO_EXT[contentType];
  const datePrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const objectKey = `${kind}/${userId}/${datePrefix}/${crypto.randomUUID()}.${ext}`;

  // 5. Sign a PUT URL. ContentLength + ContentType are *unsigned* here
  //    so the client can attach the real values; R2 enforces the
  //    Content-Type header matches the signed presign metadata only when
  //    we use SignableHeaders. For simplicity we trust the size cap in
  //    this function + a hard cap at the CDN edge.
  const bucket = Deno.env.get('R2_COMMUNITY_BUCKET') ?? 'peptalk-community';
  const publicBase = Deno.env.get('R2_PUBLIC_BASE') ?? '';
  if (!publicBase) {
    console.error('[community-upload-image] R2_PUBLIC_BASE not configured');
    return json({ error: 'Upload service misconfigured' }, 500);
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: size,
      Metadata: {
        'user-id': userId,
        kind,
      },
    });
    const uploadUrl = await getSignedUrl(s3(), command, {
      expiresIn: SIGN_TTL_SEC,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    const publicUrl = `${publicBase.replace(/\/$/, '')}/${objectKey}`;
    return json({
      uploadUrl,
      publicUrl,
      key: objectKey,
      expiresInSec: SIGN_TTL_SEC,
    });
  } catch (err) {
    console.error('[community-upload-image] sign failed:', err);
    return json({ error: 'Failed to sign upload URL' }, 500);
  }
});
