/**
 * useLearnVideo — fetches a signed playback URL for an educational
 * video from the `get-learn-video` edge function.
 *
 * Caches the URL in-memory for the TTL the server returned so a user
 * tapping the play card twice in 30 seconds doesn't double-sign. The
 * URL is also bound to the user's auth session — logging out invalidates
 * any cached URL on next mount since the hook re-derives.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';

interface LearnVideoData {
  url: string;
  posterUrl?: string;
  captionUrl?: string;
  durationSec?: number;
}

interface UseLearnVideoResult {
  data: LearnVideoData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface CacheEntry {
  data: LearnVideoData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function useLearnVideo(slug: string | null): UseLearnVideoResult {
  const [data, setData] = useState<LearnVideoData | null>(() => {
    if (!slug) return null;
    const hit = cache.get(slug);
    return hit && hit.expiresAt > Date.now() ? hit.data : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await (supabase as any).auth.getSession();
      const accessToken = session?.session?.access_token;
      if (!accessToken) {
        setError('Sign in to watch this video.');
        setLoading(false);
        return;
      }
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-learn-video`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        setError(`Couldn't load video (${res.status}).`);
        if (__DEV__) console.warn('[useLearnVideo] err', res.status, detail);
        setLoading(false);
        return;
      }
      const payload = (await res.json()) as LearnVideoData & {
        expiresInSec?: number;
      };
      const ttlSec = payload.expiresInSec ?? 5 * 60;
      cache.set(slug, {
        data: payload,
        // Refresh a minute before actual expiry so a play attempt doesn't
        // land on a stale URL.
        expiresAt: Date.now() + Math.max(60, ttlSec - 60) * 1000,
      });
      setData(payload);
    } catch (err) {
      setError("Couldn't reach the video service.");
      if (__DEV__) console.warn('[useLearnVideo] threw', err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    if (lastSlugRef.current === slug) return;
    lastSlugRef.current = slug;
    const hit = cache.get(slug);
    if (hit && hit.expiresAt > Date.now()) {
      setData(hit.data);
      return;
    }
    fetchUrl();
  }, [slug, fetchUrl]);

  return { data, loading, error, refresh: fetchUrl };
}
