/**
 * Community image upload — client-side helper for the
 * community-upload-image edge function + R2 PUT round-trip.
 *
 * Flow (caller-perspective):
 *   1. Call uploadCommunityImage(file) with an Expo ImagePicker asset
 *      or a {uri, mimeType, size} object.
 *   2. Service hits /functions/v1/community-upload-image to mint a
 *      signed PUT URL.
 *   3. Service fetch()s the asset bytes via fetch(uri).blob() and PUTs
 *      them to R2.
 *   4. Service returns { publicUrl, key } — caller stores publicUrl on
 *      the post / comment row.
 *
 * Why an explicit two-step (sign → PUT) instead of streaming through the
 * edge function:
 *   - Keeps the edge function tiny + cheap (no body-passthrough).
 *   - Lets us cap the upload size at R2's edge (no 6MB Supabase
 *     functions request-body limit to worry about).
 *   - Direct-to-R2 PUT is faster on poor mobile connections than
 *     two-hop edge → R2.
 *
 * Errors propagate as plain Error objects with user-displayable
 * messages.
 */

import { Platform } from 'react-native';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

export type UploadKind = 'post' | 'comment' | 'avatar';

export interface UploadAsset {
  /** Local file URI (file:// or content://) — works with both
   *  expo-image-picker and react-native-image-picker outputs. */
  uri: string;
  /** MIME type from the picker. iOS HEIC and Android JPEG are typical. */
  mimeType?: string;
  /** Reported file size in bytes; if omitted we derive from a fetch(). */
  size?: number;
}

export interface UploadResult {
  publicUrl: string;
  key: string;
}

const FN_NAME = 'community-upload-image';

async function getAuthedSupabase() {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('You must be signed in to upload images');
  }
  return supabase;
}

/**
 * Best-effort MIME detection. iOS picker often returns 'image' or '';
 * Android tends to give the right value. Falls back to extension.
 */
function inferMime(asset: UploadAsset): string {
  if (asset.mimeType && ALLOWED_TYPES.has(asset.mimeType.toLowerCase())) {
    return asset.mimeType.toLowerCase();
  }
  const lower = (asset.uri ?? '').toLowerCase();
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  // JPEG is the safest default — Expo re-encodes to JPEG by default on iOS.
  return 'image/jpeg';
}

/**
 * Resolve the raw byte size of a local URI by HEAD/GET-ing it through
 * fetch(). React Native's fetch supports file:// URIs on both platforms;
 * `blob.size` is reliable.
 */
async function resolveSize(asset: UploadAsset): Promise<{ size: number; blob: Blob }> {
  const res = await fetch(asset.uri);
  if (!res.ok && Platform.OS !== 'ios') {
    // Some Android emulators 404 on file://; let the caller handle.
    throw new Error(`Could not read selected image (${res.status})`);
  }
  const blob = await res.blob();
  return { size: blob.size, blob };
}

/**
 * Mint a signed URL + upload bytes. Returns the publicly-accessible URL
 * caller should persist on the post.
 */
export async function uploadCommunityImage(
  asset: UploadAsset,
  kind: UploadKind = 'post',
): Promise<UploadResult> {
  if (!asset?.uri) {
    throw new Error('No image selected');
  }

  const contentType = inferMime(asset);
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error('Unsupported image type — please pick a JPG, PNG, WEBP, or HEIC.');
  }

  // 1. Read bytes (and derive size if needed).
  const { size, blob } = await resolveSize(asset);
  if (size <= 0) throw new Error('Image is empty');
  if (size > 5 * 1024 * 1024) {
    throw new Error('Image is too large (max 5MB). Try resizing or picking a smaller photo.');
  }

  // 2. Mint signed URL.
  const supabase = await getAuthedSupabase();
  const { data, error } = await supabase.functions.invoke(FN_NAME, {
    body: { contentType, size, kind },
  });
  if (error) {
    throw new Error(error.message || 'Upload failed (could not get signed URL)');
  }
  const signed = data as {
    uploadUrl?: string;
    publicUrl?: string;
    key?: string;
    error?: string;
  };
  if (signed?.error) throw new Error(signed.error);
  if (!signed?.uploadUrl || !signed?.publicUrl || !signed?.key) {
    throw new Error('Upload failed (invalid signing response)');
  }

  // 3. PUT bytes directly to R2.
  const putRes = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
    },
    body: blob,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(
      `Upload failed (R2 ${putRes.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
    );
  }

  return { publicUrl: signed.publicUrl, key: signed.key };
}

/**
 * Convenience helper for picking + uploading in one call. Skipped when
 * expo-image-picker isn't installed (some build variants).
 */
export async function pickAndUploadCommunityImage(
  kind: UploadKind = 'post',
): Promise<UploadResult | null> {
  let ImagePicker: any = null;
  try {
    ImagePicker = require('expo-image-picker');
  } catch {
    throw new Error('Image picker is not available in this build.');
  }

  // Android uses the system Photo Picker (no permission needed), so a
  // non-granted result must NOT block the picker there. iOS still
  // requires the library permission.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && Platform.OS !== 'android') {
    throw new Error('Photo library permission denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'Images',
    allowsEditing: kind === 'avatar',
    aspect: kind === 'avatar' ? [1, 1] : undefined,
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  return uploadCommunityImage(
    {
      uri: asset.uri,
      mimeType: asset.mimeType ?? asset.type,
      size: asset.fileSize,
    },
    kind,
  );
}
