/**
 * Video Service — Exercise demo videos hosted in Cloudflare R2.
 *
 * Two-stage flow:
 *
 *   1. EXERCISE_VIDEO_SLUG_MAP   exerciseId → server video slug (this file)
 *   2. get-workout-video edge fn  slug → short-lived signed URL (Supabase)
 *
 * The server-side manifest at
 *   supabase/functions/get-workout-video/manifest.json
 * is the source of truth for which slugs exist. This file mirrors the
 * exercise-id ↔ slug mapping so the client can pick the right slug at
 * render time without shipping the full server manifest in the bundle.
 *
 * Mapping was generated from src/data/workoutVideos.json by accepting
 * Grok's aiSuggested.exerciseId for any video where confidence ≥ 0.9.
 * Lower-confidence videos and a small "no AI suggestion" tail are
 * reviewed manually via app/admin/video-tagger.tsx; once Jamie confirms
 * a tag the JSON's exerciseId is set and the mapping wins.
 *
 * Coverage: 97 exercises mapped out of ~451 in the library. The rest
 * fall back to the "Video coming soon" placeholder in
 * components/ExerciseVideo. Expanding coverage = (a) Jamie's tagger
 * review of medium-confidence suggestions, (b) recording more videos.
 */

import { supabase } from './supabase';

/**
 * exerciseId → server video slug (from get-workout-video manifest).
 * Index 0 is the latest video for that exercise; we only carry one
 * mapping per exercise today.
 *
 * REGENERATION
 * ------------
 * scripts/build-video-manifest.ts (TODO) walks workoutVideos.json and
 * emits this block. For now it's checked in by hand whenever the
 * tagger output changes.
 */
const EXERCISE_VIDEO_SLUG_MAP: Record<string, string> = {
  'ball-straight-leg-bridge': 'img-4652',
  'banded-donkey-kicks': 'img-6232-1',
  'barbell-chest-press': 'img-6215',
  'barbell-deadlift': 'img-3886',
  'barbell-goodmorning-367': 'img-3900',
  'barbell-hip-thrusts': 'img-3877',
  'barbell-narrow-stance-hip-thrust': 'img-3880',
  'barbell-rdl-379': 'img-5791',
  'barbell-reverse-lunge': 'img-4642',
  'barbell-squat': 'img-3901',
  'bench-glute-raises': 'img-3706',
  'bench-supported-y': 'img-6228-2',
  'bent-knee-raises-with-block-between-feet': 'img-5784-1',
  'bent-over-cable-rope-row': 'img-6195',
  'bodyweight-squat': 'img-4650',
  'box-step-ups': 'img-4643',
  'bulgarian-split-squat-glute-focused': 'img-3875',
  'cable-abduction-straight-leg': 'img-6221-1',
  'cable-bar-bicep-curl': 'img-4621',
  'cable-donkey-kickback': 'img-6218',
  'cable-isometric-squat-with-rope-pull': 'img-6193',
  'cable-kickback': 'img-6221-2',
  'cable-low-to-high-woodchops': 'img-6229-2',
  'cable-single-arm-tricep-push-down': 'img-6198',
  'chest-press-machine': 'img-6214-1',
  'chest-supported-incline-row': 'img-4775',
  'deadbug-extensions-optional-424': 'img-6815',
  'decline-leg-press': 'img-4804',
  'decline-leg-single-leg-press-high-stance': 'img-4807',
  'dumbbell-bulgarian-rdl-into-body-weight-pistol-squat': 'img-3717',
  'dumbbell-fly': 'img-6217',
  'dumbbell-lateral-raise': 'img-6181-2',
  'dumbbell-overhead-tricep-extensions': 'img-3703',
  'dumbbell-pullover': 'img-3707',
  'dumbbell-rdl': 'img-6180',
  'dumbbell-skull-crusher': 'img-3709',
  'dumbbell-upright-row-412': 'img-3866',
  'elevated-hip-sl-raises-w-kb-hold-317': 'img-3881',
  'facepull': 'img-4625',
  'hack-squat-machine-389': 'img-4799',
  'hanging-knee-raises': 'img-6219-1',
  'hyperextensions': 'img-7287',
  'incline-dumbbell-bicep-curls': 'img-3694',
  'incline-push-up-348': 'img-3712',
  'jump-rope': 'img-6187-1',
  'kettlebell-rdl': 'img-3884',
  'kettlebell-swings': 'img-3890',
  'kneeling-cable-overhead-tricep-extensions': 'img-4629',
  'kneeling-cable-rope-pull': 'img-4618',
  'leg-curl-machine-glute-emphasis': 'img-4787',
  'leg-lowers-296': 'img-5776',
  'leg-press': 'img-4816',
  'leg-press-narrow-high-stance-glute-focus': 'img-6225',
  'lower-leg-lifts-with-block-feet-holds': 'img-6816-2',
  'lying-crunch-with-adduction': 'img-6816-5',
  'machine-chest-press-349': 'img-6211',
  'machine-leg-extension-393': 'img-4788',
  'machine-seated-abduction': 'img-4793',
  'machine-tricep-push-down': 'img-6212',
  'narrow-grip-seated-cable-row': 'img-4610',
  'pallof-cable-press': 'img-4616',
  'plank-289': 'img-3681',
  'prone-hamstring-machine': 'img-4784',
  'renegade-row': 'img-6810',
  'sb-alt-dead-bug-312': 'img-5779-1',
  'sb-plank': 'img-4655',
  'seated-cable-lat-pull-down': 'img-4632',
  'seated-dumbbell-bicep-curls': 'img-3693',
  'seated-dumbbell-lateral-raises': 'img-3690',
  'seated-dumbbell-shoulder-press': 'img-3691',
  'seated-dumbbell-shoulder-press-with-adduction': 'img-6809',
  'seated-single-arm-dumbbell-curl-with-block-adduction': 'img-6809-4',
  'shoulder-press-machine': 'img-6211-1',
  'side-plank-292': 'img-5776-10',
  'single-arm-dumbbell-bent-over-row': 'img-3699',
  'single-arm-dumbbell-row-323': 'img-3859',
  'single-arm-kneeling-cable-row': 'img-6181-3',
  'single-arm-overhead-dumbbell-tricep-extentions': 'img-3701',
  'single-leg-leg-press-machine': 'img-6209-1',
  'smith-machine-narrow-rdl': 'img-4663',
  'smith-machine-rdl': 'img-4664',
  'smith-machine-squat-387': 'img-4657',
  'smith-machine-stationary-lunge': 'img-4661',
  'stability-bird-dog-318': 'img-5787',
  'standing-calf-raise-machine': 'img-4782',
  'standing-dumbbell-alternating-bicep-curl': 'img-3857',
  'standing-dumbbell-frontal-raises': 'img-6179',
  'standing-dumbbell-windmill': 'img-6186-1',
  'standing-plate-lateral-raises': 'img-6812-2',
  'standing-single-leg-dumbbell-rdl': 'img-3874',
  'straight-arm-pulldown': 'img-4638',
  'superman': 'img-6233-2',
  'supported-hip-dead-bug': 'img-5786-1',
  'table-top-alternating-towel-arm-slides': 'img-5783-1',
  'tricep-dips-machine': 'img-4783',
  'tricep-rope-pulldown': 'img-4609',
  'wall-sit-with-parallel-isometric-arm-hold': 'img-6234-1',
};

interface SignedUrlCacheEntry {
  videoUrl: string;
  captionUrl?: string | null;
  expiresAt: number; // ms epoch
}

// Signed URLs from R2 live 6 hours. We cache for 5 hours to leave a
// safe buffer; a refetch is one round-trip so this is plenty of
// headroom. Cache is in-memory only — wipes on app reload.
const SIGNED_URL_TTL_MS = 5 * 60 * 60 * 1000;
const _signedUrlCache = new Map<string, SignedUrlCacheEntry>();

/**
 * Whether we have a server-side video registered for this exercise.
 * Cheap sync check — does NOT hit the network, does NOT verify the
 * R2 object actually exists. The ExerciseVideo component uses this
 * to decide between "render a player" and "render the placeholder".
 */
export function hasExerciseVideo(exerciseId: string): boolean {
  return exerciseId in EXERCISE_VIDEO_SLUG_MAP;
}

/**
 * Look up the server slug for an exercise. Returns null when the
 * exercise has no mapped video yet.
 */
export function getExerciseVideoSlug(exerciseId: string): string | null {
  return EXERCISE_VIDEO_SLUG_MAP[exerciseId] ?? null;
}

/**
 * Resolve a playable video URL for an exercise. Goes through the
 * get-workout-video edge function so the URL is signed (the bucket is
 * private and Pro-gated).
 *
 * Returns `{ videoUrl, captionUrl }` on success, null when no video
 * mapping exists, or null when the edge function rejected the request
 * (auth, tier, network). Callers should treat null as "no video — show
 * placeholder."
 */
export async function fetchExerciseVideoUrl(
  exerciseId: string,
): Promise<{ videoUrl: string; captionUrl: string | null } | null> {
  const slug = getExerciseVideoSlug(exerciseId);
  if (!slug) return null;

  // In-memory cache: respect TTL so we don't burn the edge fn for every
  // play-press inside the same session.
  const cached = _signedUrlCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return { videoUrl: cached.videoUrl, captionUrl: cached.captionUrl ?? null };
  }

  let session;
  try {
    const result = await supabase.auth.getSession();
    session = result.data?.session;
  } catch {
    return null;
  }
  if (!session?.access_token) return null;

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-workout-video`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      if (__DEV__) console.warn('[videoService] sign failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as {
      url?: string;
      captionUrl?: string | null;
    };
    if (!json.url) return null;
    const entry: SignedUrlCacheEntry = {
      videoUrl: json.url,
      captionUrl: json.captionUrl ?? null,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS,
    };
    _signedUrlCache.set(slug, entry);
    return { videoUrl: entry.videoUrl, captionUrl: entry.captionUrl ?? null };
  } catch (err) {
    if (__DEV__) console.warn('[videoService] fetch threw:', err);
    return null;
  }
}

/**
 * Sync helper for legacy callers that expect a URL straight away.
 * Returns null today; UI should use fetchExerciseVideoUrl instead.
 *
 * Kept as a thin shim so we don't have to rewrite every consumer in
 * the same wave — ExerciseVideo.tsx uses it for the synchronous "do I
 * have a video at all?" check via hasExerciseVideo, and only triggers
 * the async fetch when the user actually presses play.
 *
 * @deprecated Use {@link fetchExerciseVideoUrl} for playback.
 */
export function getExerciseVideoUrl(_exerciseId: string): string | null {
  return null;
}

/**
 * Thumbnails are not yet generated for the R2 videos — for now we
 * return null and let the component fall back to a poster placeholder.
 * Once we run a thumb-extract step on the R2 bucket (one frame ~ 1s
 * in), this can return a signed URL the same way fetchExerciseVideoUrl
 * does — same edge fn, same slug, sibling .jpg key.
 */
export function getExerciseThumbnailUrl(_exerciseId: string): string | null {
  return null;
}

/** Total mapped exercises in this client manifest. */
export function getVideoCount(): number {
  return Object.keys(EXERCISE_VIDEO_SLUG_MAP).length;
}
