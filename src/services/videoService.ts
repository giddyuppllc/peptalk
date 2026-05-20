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
// Auto-regenerated 2026-05-20 from
// supabase/functions/get-workout-video/manifest.json (vision tagger).
// 116 exercises × 280 takes.
const EXERCISE_VIDEO_SLUG_MAP: Record<string, string> = {
  'alternating-bench-lower-leg-lifts-with-glute-raise-297': 'img-3706',
  'alternating-knee-to-elbow-towel-slides': 'img-6232-2',
  'alternating-shoulder-taps': 'img-6233-6',
  'ball-glute-bridge-385': 'img-4652',
  'band-pallof-press': 'img-6187',
  'band-shuffle': 'img-6231-2',
  'banded-donkey-kicks': 'img-9654',
  'banded-fire-hydrants': 'img-4315',
  'banded-glute-bridge': 'img-5785',
  'banded-glute-kicks': 'img-6221-2',
  'banded-kneeling-lateral-kicks': 'img-6223',
  'banded-side-step-squat': 'img-6231-1',
  'banded-standing-glute-kicks': 'img-6221-1',
  'barbell-bent-over-row': 'img-4668',
  'barbell-deadlift': 'img-3886',
  'barbell-hip-thrusts': 'img-3707',
  'barbell-rdl-379': 'img-6226',
  'barbell-reverse-lunge-392': 'img-4642',
  'barbell-squat': 'img-3901',
  'basic-crunch-290': 'img-5776-8',
  'bench-glute-raises': 'img-3704',
  'bench-supported-reverse-fly': 'img-3708',
  'bulgarian-split-squat-quad-focused-400': 'img-3716',
  'cable-abduction-bent-knee': 'img-6221',
  'cable-bar-bent-over-row-331': 'img-6199',
  'cable-bar-bicep-curl': 'img-6196',
  'cable-bar-rdl-363': 'img-6229-1',
  'cable-low-to-high-woodchops': 'img-4623',
  'cable-overhead-tricep-extensions': 'img-6188',
  'cable-rope-hammer-curls': 'img-4621',
  'cable-single-arm-tricep-pull-down': 'img-4619',
  'chest-press-machine': 'img-6214',
  'chin-up': 'img-4782',
  'crab-walk': 'img-6233-1',
  'decline-leg-press': 'img-4806',
  'deficit-reverse-dumbbell-lunges': 'img-4646',
  'dumbbell-bench-press': 'img-3868',
  'dumbbell-bench-press-343': 'img-3709',
  'dumbbell-box-step-up-glute-focused-368': 'img-3909',
  'dumbbell-chest-fly-345': 'img-3869',
  'dumbbell-incline-row-325': 'img-6228-1',
  'dumbbell-lateral-raise': 'img-6183-2',
  'dumbbell-rdl': 'img-3859',
  'dumbbell-reverse-deficit-lunge-395': 'img-6183',
  'dumbbell-single-leg-deadlift-382': 'img-3698',
  'dumbbell-skull-crusher': 'img-3870',
  'dumbbell-squat': 'img-4640',
  'dumbbell-squat-glute-focus-376': 'img-3912',
  'dumbbell-step-ups-399': 'img-4643',
  'dumbbell-walking-lunges-glute-focused-360': 'img-6181-1',
  'goblet-squat-heels-elevated': 'img-4645',
  'hanging-knee-raises': 'img-4813',
  'hip-bridges-optional-423': 'img-6814-1',
  'hyperextensions': 'img-4810',
  'incline-push-up-348': 'img-3712',
  'kb-pull-over-with-glute-bridge': 'img-5786-1',
  'kettlebell-rdl-371': 'img-3884',
  'kettlebell-swings': 'img-3883',
  'kneeling-cable-overhead-tricep-extensions': 'img-4629',
  'landmine-squat': 'img-6193',
  'landmine-squat-and-press': 'img-5790',
  'landmine-squat-and-press-370': 'img-3913',
  'leg-press': 'img-4804',
  'lower-leg-lifts-with-block-feet-holds': 'img-5776',
  'lying-crunch-with-adduction': 'img-5781-2',
  'machine-chest-press-349': 'img-4779',
  'machine-leg-extension-393': 'img-4788',
  'machine-leg-press-390': 'img-6209-1',
  'machine-seated-abduction': 'img-6809-4',
  'machine-single-arm-chest-press': 'img-6211-1',
  'machine-single-leg-extension': 'img-4775',
  'mb-pelvic-floor-heel-taps': 'img-5784-1',
  'medicine-ball-dead-bugs': 'img-5779',
  'mountain-climbers-301': 'img-5776-4',
  'pallof-cable-press': 'img-4617',
  'plank-289': 'img-5776-6',
  'plank-push-303': 'img-6813',
  'prone-bent-leg-hamstring-machine': 'img-4787',
  'prone-hamstring-machine': 'img-4784',
  'push-up': 'img-3681',
  'push-up-with-arm-row': 'img-6810',
  'reverse-deltoid-fly-machine-405': 'img-6212',
  'sb-alt-dead-bug-312': 'img-5776-5',
  'sb-crunch-320': 'img-5779-4',
  'sb-knee-tucks-319': 'img-4655',
  'seated-cable-lat-pull-down': 'img-4633',
  'seated-cable-rows-narrow-grip-328': 'img-4610',
  'seated-cable-single-arm-row': 'img-4609',
  'seated-dumbbell-shoulder-press': 'img-3690',
  'seated-single-arm-dumbbell-arnold-press': 'img-3692',
  'seated-single-arm-dumbbell-press-344': 'img-3697',
  'side-plank-292': 'img-5776-10',
  'single-arm-dumbbell-row-323': 'img-3699',
  'single-arm-overhead-dumbbell-tricep-extentions': 'img-3864',
  'single-leg-leg-press-machine': 'img-6209',
  'smith-machine-body-weight-prone-grip-row-321': 'img-4670',
  'smith-machine-body-weight-supinated-grip-row-322': 'img-4669',
  'smith-machine-rdl': 'img-4666',
  'smith-machine-shoulder-press': 'img-4803',
  'smith-machine-squat': 'img-4671',
  'smith-machine-squat-387': 'img-3900',
  'stability-bird-dog-318': 'img-5787',
  'standing-dumbbell-alternating-bicep-curl': 'img-3857',
  'standing-dumbbell-curl-and-press': 'img-3865',
  'standing-dumbbell-single-leg-rdl': 'img-3889',
  'standing-dumbbell-windmill': 'img-6186-1',
  'standing-plate-lateral-raises': 'img-6812',
  'standing-single-leg-dumbbell-rdl': 'img-3874',
  'star-jump-351': 'img-4651',
  'straight-arm-pulldown': 'img-4616',
  'superman': 'img-6233',
  'tricep-dips-bench': 'img-3714',
  'tricep-dips-machine-418': 'img-4783',
  'up-and-down-plank': 'img-5776-3',
  'wall-sit-with': 'img-6234-1',
  'weighted-crunches-298': 'img-5781-3',
};

// MULTI-TAKE COVERAGE — canonical first, then alt angles sorted by
// AI confidence. UI consumes via getAllExerciseVideoSlugs(exerciseId).
const EXERCISE_VIDEO_SLUGS: Record<string, readonly string[]> = {
  'alternating-bench-lower-leg-lifts-with-glute-raise-297': ['img-3706', 'img-3872'],
  'alternating-knee-to-elbow-towel-slides': ['img-6232-2'],
  'alternating-shoulder-taps': ['img-6233-6'],
  'ball-glute-bridge-385': ['img-4652', 'img-4653', 'img-4654', 'img-5781', 'img-6816'],
  'band-pallof-press': ['img-6187', 'img-6187-1', 'img-6229-2'],
  'band-shuffle': ['img-6231-2'],
  'banded-donkey-kicks': ['img-9654'],
  'banded-fire-hydrants': ['img-4315', 'img-6232', 'img-6232-1'],
  'banded-glute-bridge': ['img-5785', 'img-6231', 'img-5779-1'],
  'banded-glute-kicks': ['img-6221-2'],
  'banded-kneeling-lateral-kicks': ['img-6223'],
  'banded-side-step-squat': ['img-6231-1'],
  'banded-standing-glute-kicks': ['img-6221-1'],
  'barbell-bent-over-row': ['img-4668'],
  'barbell-deadlift': ['img-3886', 'img-3887', 'img-3888'],
  'barbell-hip-thrusts': ['img-3707', 'img-3877', 'img-3878', 'img-3879', 'img-3880', 'img-4663', 'img-4664', 'img-5788', 'img-5791', 'img-4641', 'img-5788-1'],
  'barbell-rdl-379': ['img-6226'],
  'barbell-reverse-lunge-392': ['img-4642'],
  'barbell-squat': ['img-3901', 'img-3908', 'img-4639', 'img-4657'],
  'basic-crunch-290': ['img-5776-8'],
  'bench-glute-raises': ['img-3704', 'img-3705', 'img-3881', 'img-4800'],
  'bench-supported-reverse-fly': ['img-3708', 'img-6228', 'img-6228-2'],
  'bulgarian-split-squat-quad-focused-400': ['img-3716', 'img-3882'],
  'cable-abduction-bent-knee': ['img-6221'],
  'cable-bar-bent-over-row-331': ['img-6199'],
  'cable-bar-bicep-curl': ['img-6196'],
  'cable-bar-rdl-363': ['img-6229-1', 'img-6812-3'],
  'cable-low-to-high-woodchops': ['img-4623', 'img-4624', 'img-4625', 'img-4630', 'img-4632', 'img-6191', 'img-6192', 'img-6194', 'img-6195', 'img-6201', 'img-6202', 'img-6204', 'img-6206', 'img-6207', 'img-6229', 'img-6230', 'img-4638', 'img-6190', 'img-6198', 'img-6203'],
  'cable-overhead-tricep-extensions': ['img-6188'],
  'cable-rope-hammer-curls': ['img-4621'],
  'cable-single-arm-tricep-pull-down': ['img-4619', 'img-4622', 'img-6197'],
  'chest-press-machine': ['img-6214'],
  'chin-up': ['img-4782'],
  'crab-walk': ['img-6233-1'],
  'decline-leg-press': ['img-4806', 'img-4808', 'img-4809'],
  'deficit-reverse-dumbbell-lunges': ['img-4646'],
  'dumbbell-bench-press': ['img-3868', 'img-6216'],
  'dumbbell-bench-press-343': ['img-3709', 'img-3867', 'img-6215'],
  'dumbbell-box-step-up-glute-focused-368': ['img-3909', 'img-4799'],
  'dumbbell-chest-fly-345': ['img-3869', 'img-6217'],
  'dumbbell-incline-row-325': ['img-6228-1', 'img-6228-3'],
  'dumbbell-lateral-raise': ['img-6183-2'],
  'dumbbell-rdl': ['img-3859', 'img-3863', 'img-3890', 'img-6186'],
  'dumbbell-reverse-deficit-lunge-395': ['img-6183'],
  'dumbbell-single-leg-deadlift-382': ['img-3698', 'img-3717', 'img-3873', 'img-3875', 'img-4648', 'img-6181', 'img-6181-3'],
  'dumbbell-skull-crusher': ['img-3870'],
  'dumbbell-squat': ['img-4640'],
  'dumbbell-squat-glute-focus-376': ['img-3912', 'img-4644'],
  'dumbbell-step-ups-399': ['img-4643'],
  'dumbbell-walking-lunges-glute-focused-360': ['img-6181-1'],
  'goblet-squat-heels-elevated': ['img-4645'],
  'hanging-knee-raises': ['img-4813', 'img-5776-2', 'img-6218', 'img-6219-1', 'img-6220', 'img-7287', 'img-5776-1'],
  'hip-bridges-optional-423': ['img-6814-1'],
  'hyperextensions': ['img-4810', 'img-4812'],
  'incline-push-up-348': ['img-3712'],
  'kb-pull-over-with-glute-bridge': ['img-5786-1'],
  'kettlebell-rdl-371': ['img-3884'],
  'kettlebell-swings': ['img-3883'],
  'kneeling-cable-overhead-tricep-extensions': ['img-4629', 'img-6189'],
  'landmine-squat': ['img-6193'],
  'landmine-squat-and-press': ['img-5790'],
  'landmine-squat-and-press-370': ['img-3913'],
  'leg-press': ['img-4804', 'img-4805', 'img-4807', 'img-6209-2'],
  'lower-leg-lifts-with-block-feet-holds': ['img-5776', 'img-5784', 'img-6816-2', 'img-6816-3'],
  'lying-crunch-with-adduction': ['img-5781-2', 'img-6816-1'],
  'machine-chest-press-349': ['img-4779'],
  'machine-leg-extension-393': ['img-4788', 'img-4789', 'img-6210'],
  'machine-leg-press-390': ['img-6209-1'],
  'machine-seated-abduction': ['img-6809-4'],
  'machine-single-arm-chest-press': ['img-6211-1'],
  'machine-single-leg-extension': ['img-4775', 'img-4793', 'img-4794', 'img-4797', 'img-4798', 'img-4816', 'img-6218-1', 'img-6219', 'img-6224'],
  'mb-pelvic-floor-heel-taps': ['img-5784-1'],
  'medicine-ball-dead-bugs': ['img-5779', 'img-5779-3', 'img-5781-1', 'img-6814'],
  'mountain-climbers-301': ['img-5776-4', 'img-5778-2', 'img-5782-1', 'img-5783', 'img-5785-1', 'img-6233-3'],
  'pallof-cable-press': ['img-4617', 'img-4618', 'img-4628'],
  'plank-289': ['img-5776-6', 'img-5776-7', 'img-5778-3'],
  'plank-push-303': ['img-6813'],
  'prone-bent-leg-hamstring-machine': ['img-4787'],
  'prone-hamstring-machine': ['img-4784', 'img-4785'],
  'push-up': ['img-3681', 'img-6233-4'],
  'push-up-with-arm-row': ['img-6810'],
  'reverse-deltoid-fly-machine-405': ['img-6212'],
  'sb-alt-dead-bug-312': ['img-5776-5', 'img-5786', 'img-6815', 'img-6816-4'],
  'sb-crunch-320': ['img-5779-4'],
  'sb-knee-tucks-319': ['img-4655', 'img-4656', 'img-5779-2'],
  'seated-cable-lat-pull-down': ['img-4633', 'img-4634', 'img-4777', 'img-6214-1'],
  'seated-cable-rows-narrow-grip-328': ['img-4610', 'img-4613'],
  'seated-cable-single-arm-row': ['img-4609', 'img-4611'],
  'seated-dumbbell-shoulder-press': ['img-3690', 'img-3691', 'img-3693', 'img-3694', 'img-3700', 'img-3703', 'img-3710', 'img-3711', 'img-6234', 'img-6809', 'img-6809-1', 'img-6809-2', 'img-6809-3'],
  'seated-single-arm-dumbbell-arnold-press': ['img-3692'],
  'seated-single-arm-dumbbell-press-344': ['img-3697', 'img-3701'],
  'side-plank-292': ['img-5776-10', 'img-5776-9', 'img-5778', 'img-5789'],
  'single-arm-dumbbell-row-323': ['img-3699', 'img-6185'],
  'single-arm-overhead-dumbbell-tricep-extentions': ['img-3864'],
  'single-leg-leg-press-machine': ['img-6209'],
  'smith-machine-body-weight-prone-grip-row-321': ['img-4670'],
  'smith-machine-body-weight-supinated-grip-row-322': ['img-4669', 'img-6227'],
  'smith-machine-rdl': ['img-4666'],
  'smith-machine-shoulder-press': ['img-4803', 'img-6211', 'img-6234-2'],
  'smith-machine-squat': ['img-4671'],
  'smith-machine-squat-387': ['img-3900', 'img-3903', 'img-3904', 'img-4658', 'img-4659', 'img-4660', 'img-4661', 'img-4801', 'img-6213', 'img-6225'],
  'stability-bird-dog-318': ['img-5787'],
  'standing-dumbbell-alternating-bicep-curl': ['img-3857', 'img-3866', 'img-6179', 'img-6181-2', 'img-6183-1', 'img-6184-1'],
  'standing-dumbbell-curl-and-press': ['img-3865', 'img-6180', 'img-6183-3', 'img-6184', 'img-6812-2', 'img-3907', 'img-6205'],
  'standing-dumbbell-single-leg-rdl': ['img-3889'],
  'standing-dumbbell-windmill': ['img-6186-1'],
  'standing-plate-lateral-raises': ['img-6812'],
  'standing-single-leg-dumbbell-rdl': ['img-3874'],
  'star-jump-351': ['img-4651'],
  'straight-arm-pulldown': ['img-4616'],
  'superman': ['img-6233', 'img-6233-2'],
  'tricep-dips-bench': ['img-3714'],
  'tricep-dips-machine-418': ['img-4783'],
  'up-and-down-plank': ['img-5776-3', 'img-5783-2'],
  'wall-sit-with': ['img-6234-1'],
  'weighted-crunches-298': ['img-5781-3', 'img-6816-5'],
};

// 13 videos still untagged — surfaced only via the in-app
// admin tagger so nothing in Stream sits orphaned.
const UNTAGGED_VIDEO_SLUGS: readonly string[] = [
  'img-4647', 'img-4650', 'img-4667', 'img-5778-1', 'img-5782',
  'img-5783-1', 'img-6181-4', 'img-6182', 'img-6208', 'img-6222',
  'img-6233-5', 'img-6812-1', 'img-6813-1',
];

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
 * Look up ALL slugs for an exercise — canonical first, then alternate
 * takes Jamie filmed for the same movement. Returns [] when the
 * exercise has no mapped video.
 *
 * UI use: render a horizontal carousel / "alternate views" tab so users
 * can swipe through different angles. Without this, only one of (e.g.)
 * the 6 plank videos shows.
 */
export function getAllExerciseVideoSlugs(exerciseId: string): readonly string[] {
  return EXERCISE_VIDEO_SLUGS[exerciseId] ?? [];
}

/**
 * Untagged R2 video pool — videos uploaded but never assigned to an
 * exercise (AI couldn't confidently tag them). Admin tagger reads from
 * here; not surfaced through any exercise-facing screen.
 */
export function getUntaggedVideoSlugs(): readonly string[] {
  return UNTAGGED_VIDEO_SLUGS;
}

/**
 * Stats helper for the admin tagger header.
 */
export function getVideoCoverageStats() {
  const exercises = Object.keys(EXERCISE_VIDEO_SLUGS).length;
  const takes = Object.values(EXERCISE_VIDEO_SLUGS).reduce((n, arr) => n + arr.length, 0);
  return {
    totalVideos: takes + UNTAGGED_VIDEO_SLUGS.length,
    taggedVideos: takes,
    exercisesCovered: exercises,
    untaggedVideos: UNTAGGED_VIDEO_SLUGS.length,
  };
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
