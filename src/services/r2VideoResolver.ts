/**
 * R2 video resolver.
 *
 * Resolves a workout-video slug → a short-lived signed URL the <Video>
 * component can play. The signing happens server-side in the Supabase
 * Edge Function `get-workout-video` so the R2 secret never ships in the
 * app bundle.
 *
 * Tier-gated: only Pro users get URLs. Free / Plus users see a
 * locked-state in the library and never reach the resolver.
 *
 * URLs are cached per-slug for the session so repeated views of the
 * same video don't hit the function on every play.
 */

import { supabase } from './supabase';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { getVideoBySlug } from '../data/workoutVideos';

interface CachedUrl {
  url: string;
  /** Optional WebVTT captions URL — present when the video has been
   *  transcribed via transcribe-workout-video and the manifest entry
   *  has captionKey set. */
  captionUrl?: string;
  /** Epoch ms when this signed URL stops being valid. */
  expiresAt: number;
}

const cache = new Map<string, CachedUrl>();

/** Buffer before expiry — refresh if the URL has < 5 minutes left. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type VideoResolveResult =
  | { ok: true; url: string; captionUrl?: string }
  | { ok: false; reason: 'not_pro' | 'not_signed_in' | 'not_found' | 'network' };

export async function resolveVideoUrl(slug: string): Promise<VideoResolveResult> {
  // 1. Local tier check — avoid the network round-trip when we already know
  //    the user can't access. Server still re-checks (defense in depth).
  const tier = useSubscriptionStore.getState().tier;
  if (tier !== 'pro') return { ok: false, reason: 'not_pro' };

  // 2. Cache hit?
  const cached = cache.get(slug);
  if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return { ok: true, url: cached.url, captionUrl: cached.captionUrl };
  }

  // 3. Auth — must be signed in to call the function.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: 'not_signed_in' };

  // 4. Look up the object key from the manifest — we don't ship the manifest
  //    server-side, so the client tells the function which object to sign.
  const video = getVideoBySlug(slug);
  if (!video) return { ok: false, reason: 'not_found' };

  // 5. Call the Edge Function.
  try {
    const { data, error } = await supabase.functions.invoke('get-workout-video', {
      body: { slug, objectKey: video.objectKey },
    });
    if (error) {
      // Distinguish 403 (tier) from 404 (not found) where possible.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 403) return { ok: false, reason: 'not_pro' };
      if (status === 404) return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'network' };
    }
    if (!data?.url || typeof data.url !== 'string') {
      return { ok: false, reason: 'not_found' };
    }
    const ttlMs = (data.expiresInSec ?? 6 * 60 * 60) * 1000;
    const captionUrl = typeof data.captionUrl === 'string' ? data.captionUrl : undefined;
    cache.set(slug, { url: data.url, captionUrl, expiresAt: Date.now() + ttlMs });
    return { ok: true, url: data.url, captionUrl };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Drop all cached URLs (e.g. on sign-out, on tier downgrade). */
export function clearVideoCache(): void {
  cache.clear();
}
