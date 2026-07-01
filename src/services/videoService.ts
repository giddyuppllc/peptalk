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
 * Run `node scripts/regen-video-service-maps.mjs` from the repo root
 * after the vision tagger lands new exerciseId mappings in
 * supabase/functions/get-workout-video/manifest.json. The script
 * walks the manifest, merges in manually-reviewed tags from
 * src/data/workoutVideos.json (which always win when both have a
 * tag for the same slug), sorts each exercise's takes by confidence,
 * and splices the new block into this file in place. Wave 76.40+.
 */
// Auto-regenerated 2026-05-20 by
// scripts/regen-video-service-maps.mjs (merge mode).
// 141 exercises × 292 takes —
// 251 from reviewed src/data/workoutVideos.json + 41 new
// from the vision tagger for slugs with no prior manual tag.
// 1 slugs still untagged (in UNTAGGED_VIDEO_SLUGS below).
const EXERCISE_VIDEO_SLUG_MAP: Record<string, string> = {
  'alternating-bench-lower-leg-lifts-with-glute-raise-297': 'img-3872',
  'alternating-knee-to-elbow-towel-slides': 'img-6232-2',
  'ball-glute-bridge-385': 'img-4654',
  'ball-straight-leg-bridge': 'img-4652',
  'band-shuffle': 'img-6231-1',
  'banded-donkey-kicks': 'img-6232',
  'banded-fire-hydrants': 'img-4315',
  'banded-glute-kicks': 'img-5778-2',
  'banded-standing-glute-kicks': 'img-6187',
  'barbell-chest-press': 'img-6215',
  'barbell-deadlift': 'img-3886',
  'barbell-goodmorning-367': 'img-3900',
  'barbell-hip-thrusts': 'img-3878',
  'barbell-narrow-stance-hip-thrust': 'img-3880',
  'barbell-rdl-379': 'img-5791',
  'barbell-reverse-lunge': 'img-4642',
  'barbell-squat': 'img-3904',
  'bench-glute-raises': 'img-3706',
  'bench-low-leg-lifts-with-glute-raise': 'img-3714',
  'bench-supported-y': 'img-6228-2',
  'bent-knee-raise-with-yoga-block-adduction': 'img-6816',
  'bent-knee-raises-with-block-between-feet': 'img-5784-1',
  'bent-over-cable-bar-row': 'img-3913',
  'bent-over-cable-rope-row': 'img-6195',
  'bodyweight-squat': 'img-4650',
  'box-step-ups': 'img-4643',
  'bulgarian-split-squat-glute-focused': 'img-3875',
  'cable-abduction-straight-leg': 'img-6221-1',
  'cable-bar-bent-over-row-331': 'img-6199',
  'cable-bar-bicep-curl': 'img-4621',
  'cable-donkey-kickback': 'img-6222',
  'cable-isometric-squat-with-rope-pull': 'img-6193',
  'cable-kickback': 'img-6221-2',
  'cable-low-to-high-woodchops': 'img-6229-2',
  'cable-oblique-rotations': 'img-4617',
  'cable-overhead-tricep-extensions': 'img-4623',
  'cable-rope-hammer-curls': 'img-6203',
  'cable-single-arm-tricep-pull-down': 'img-6197',
  'cable-single-arm-tricep-push-down': 'img-6198',
  'chest-press-machine': 'img-6214-1',
  'chest-supported-incline-row': 'img-4775',
  'crab-walk': 'img-6233-1',
  'deadbug-extensions-optional-424': 'img-6815',
  'decline-leg-press': 'img-4804',
  'decline-leg-single-leg-press-high-stance': 'img-4807',
  'deficit-reverse-dumbbell-lunges': 'img-4646',
  'dumbbell-box-step-up-glute-focused-368': 'img-3909',
  'dumbbell-bulgarian-rdl-into-body-weight-pistol-squat': 'img-3717',
  'dumbbell-fly': 'img-6217',
  'dumbbell-lateral-raise': 'img-6181-2',
  'dumbbell-overhead-tricep-extensions': 'img-3703',
  'dumbbell-pullover': 'img-3707',
  'dumbbell-rdl': 'img-6812-3',
  'dumbbell-skull-crusher': 'img-3709',
  'dumbbell-squat': 'img-4644',
  'dumbbell-squat-glute-focus-376': 'img-3912',
  'dumbbell-upright-row-412': 'img-3866',
  'elbows-to-knees-sit-up-291': 'img-3700',
  'elevated-hip-sl-raises-w-kb-hold-317': 'img-3881',
  'facepull': 'img-4625',
  'hack-squat-machine-389': 'img-4799',
  'hanging-knee-raises': 'img-6219-1',
  'hip-bridges-optional-423': 'img-6231',
  'hyperextensions': 'img-7287',
  'incline-dumbbell-bicep-curls': 'img-3694',
  'incline-push-up-348': 'img-3712',
  'jump-rope': 'img-6187-1',
  'kb-alternating-low-leg-raises': 'img-6814',
  'kettlebell-rdl': 'img-3884',
  'kettlebell-swings': 'img-3890',
  'kneeling-cable-overhead-tricep-extensions': 'img-4629',
  'kneeling-cable-rope-pull': 'img-4618',
  'leg-curl-machine-glute-emphasis': 'img-4787',
  'leg-lowers-296': 'img-5785',
  'leg-press': 'img-6209-2',
  'leg-press-narrow-high-stance-glute-focus': 'img-6225',
  'lower-leg-lifts-with-block-feet-holds': 'img-6816-2',
  'lying-crunch-with-adduction': 'img-6816-5',
  'machine-chest-press-349': 'img-6211',
  'machine-leg-extension-393': 'img-4788',
  'machine-leg-press-390': 'img-6209-1',
  'machine-seated-abduction': 'img-4797',
  'machine-single-leg-extension': 'img-6218-1',
  'machine-tricep-push-down': 'img-6212',
  'medicine-ball-burpees': 'img-3883',
  'medicine-ball-dead-bugs': 'img-5779',
  'mountain-climbers-301': 'img-5776-4',
  'narrow-grip-seated-cable-row': 'img-4613',
  'pallof-cable-press': 'img-6230',
  'pilates-lower-leg-lifts-309': 'img-5776-1',
  'plank-289': 'img-3681',
  'plank-with-kettlebell-unilateral-slide': 'img-6813',
  'prone-hamstring-machine': 'img-4784',
  'renegade-row': 'img-6810',
  'sb-alt-dead-bug-312': 'img-5779-1',
  'sb-crunch-320': 'img-5779-4',
  'sb-plank': 'img-4656',
  'seated-cable-lat-pull-down': 'img-4632',
  'seated-dumbbell-bicep-curls': 'img-3710',
  'seated-dumbbell-lateral-raises': 'img-3690',
  'seated-dumbbell-shoulder-press': 'img-3691',
  'seated-dumbbell-shoulder-press-with-adduction': 'img-6809',
  'seated-single-arm-dumbbell-arnold-press': 'img-3697',
  'seated-single-arm-dumbbell-curl-with-block-adduction': 'img-6809-4',
  'shoulder-floor-push-up': 'img-6233-3',
  'shoulder-press-machine': 'img-6211-1',
  'side-plank-292': 'img-5776-10',
  'single-arm-cable-over-head-lat-pulldown': 'img-4628',
  'single-arm-dumbbell-bent-over-row': 'img-3699',
  'single-arm-dumbbell-row-323': 'img-3859',
  'single-arm-kneeling-cable-row': 'img-6181-3',
  'single-arm-overhead-dumbbell-tricep-extentions': 'img-3701',
  'single-leg-leg-press-machine': 'img-6209',
  'smith-machine-body-weight-prone-grip-row-321': 'img-4670',
  'smith-machine-narrow-rdl': 'img-4663',
  'smith-machine-rdl': 'img-4664',
  'smith-machine-squat-387': 'img-4660',
  'smith-machine-stationary-lunge': 'img-4671',
  'stability-bird-dog-318': 'img-5787',
  'standing-calf-raise-machine': 'img-4782',
  'standing-dumbbell-alternating-bicep-curl': 'img-3857',
  'standing-dumbbell-alternating-hammer-curl': 'img-6183-2',
  'standing-dumbbell-curl-and-press': 'img-6183-3',
  'standing-dumbbell-frontal-raises': 'img-6179',
  'standing-dumbbell-windmill': 'img-6186-1',
  'standing-plate-alternating-frontal-and-lateral-raises': 'img-6812-1',
  'standing-plate-lateral-raises': 'img-6812-2',
  'standing-single-leg-dumbbell-rdl': 'img-3874',
  'star-jump-351': 'img-4651',
  'straight-arm-pulldown': 'img-4638',
  'superman': 'img-6233-2',
  'supported-hip-dead-bug': 'img-5786-1',
  'table-top-alternating-towel-arm-slides': 'img-5783-1',
  'table-top-knee-taps-305': 'img-5781-2',
  'table-top-knee-taps-with-block-adduction': 'img-5784',
  'toe-touches-299': 'img-5776-5',
  'towel-pike': 'img-5783-2',
  'tricep-dips-machine': 'img-4783',
  'tricep-rope-pulldown': 'img-4619',
  'wall-sit-with-parallel-isometric-arm-hold': 'img-6234',
  'weighted-crunches-298': 'img-5781-3',
};

// MULTI-TAKE COVERAGE — canonical first, then alt angles. Reviewed
// (manually-vetted) takes come before vision-tagger takes, then by
// confidence. UI consumes via getAllExerciseVideoSlugs(exerciseId).
const EXERCISE_VIDEO_SLUGS: Record<string, readonly string[]> = {
  'alternating-bench-lower-leg-lifts-with-glute-raise-297': ['img-3872'],
  'alternating-knee-to-elbow-towel-slides': ['img-6232-2'],
  'ball-glute-bridge-385': ['img-4654'],
  'ball-straight-leg-bridge': ['img-4652'],
  'band-shuffle': ['img-6231-1', 'img-6231-2', 'img-4647', 'img-6181-4'],
  'banded-donkey-kicks': ['img-6232', 'img-6232-1', 'img-5783', 'img-5776-6', 'img-9654'],
  'banded-fire-hydrants': ['img-4315'],
  'banded-glute-kicks': ['img-5778-2'],
  'banded-standing-glute-kicks': ['img-6187'],
  'barbell-chest-press': ['img-6215'],
  'barbell-deadlift': ['img-3886', 'img-4641', 'img-5788-1', 'img-3888', 'img-4639', 'img-3887'],
  'barbell-goodmorning-367': ['img-3900'],
  'barbell-hip-thrusts': ['img-3878', 'img-3877', 'img-3879', 'img-6227', 'img-5788'],
  'barbell-narrow-stance-hip-thrust': ['img-3880'],
  'barbell-rdl-379': ['img-5791', 'img-5790', 'img-6226'],
  'barbell-reverse-lunge': ['img-4642'],
  'barbell-squat': ['img-3904', 'img-4640', 'img-3901', 'img-3903', 'img-6213', 'img-3908'],
  'bench-glute-raises': ['img-3706'],
  'bench-low-leg-lifts-with-glute-raise': ['img-3714'],
  'bench-supported-y': ['img-6228-2', 'img-3708'],
  'bent-knee-raise-with-yoga-block-adduction': ['img-6816'],
  'bent-knee-raises-with-block-between-feet': ['img-5784-1'],
  'bent-over-cable-bar-row': ['img-3913', 'img-6188'],
  'bent-over-cable-rope-row': ['img-6195', 'img-6229'],
  'bodyweight-squat': ['img-4650', 'img-6182'],
  'box-step-ups': ['img-4643'],
  'bulgarian-split-squat-glute-focused': ['img-3875', 'img-4648', 'img-3716'],
  'cable-abduction-straight-leg': ['img-6221-1'],
  'cable-bar-bent-over-row-331': ['img-6199'],
  'cable-bar-bicep-curl': ['img-4621', 'img-6202', 'img-6196'],
  'cable-donkey-kickback': ['img-6222', 'img-6223', 'img-6218'],
  'cable-isometric-squat-with-rope-pull': ['img-6193', 'img-6194', 'img-4630'],
  'cable-kickback': ['img-6221-2'],
  'cable-low-to-high-woodchops': ['img-6229-2', 'img-6229-1', 'img-6191', 'img-6204', 'img-6190'],
  'cable-oblique-rotations': ['img-4617'],
  'cable-overhead-tricep-extensions': ['img-4623'],
  'cable-rope-hammer-curls': ['img-6203'],
  'cable-single-arm-tricep-pull-down': ['img-6197'],
  'cable-single-arm-tricep-push-down': ['img-6198'],
  'chest-press-machine': ['img-6214-1'],
  'chest-supported-incline-row': ['img-4775', 'img-6228', 'img-6228-3'],
  'crab-walk': ['img-6233-1'],
  'deadbug-extensions-optional-424': ['img-6815'],
  'decline-leg-press': ['img-4804', 'img-4806', 'img-4808'],
  'decline-leg-single-leg-press-high-stance': ['img-4807', 'img-4809', 'img-4813'],
  'deficit-reverse-dumbbell-lunges': ['img-4646'],
  'dumbbell-box-step-up-glute-focused-368': ['img-3909'],
  'dumbbell-bulgarian-rdl-into-body-weight-pistol-squat': ['img-3717'],
  'dumbbell-fly': ['img-6217'],
  'dumbbell-lateral-raise': ['img-6181-2', 'img-6183', 'img-6183-1', 'img-6184', 'img-6184-1'],
  'dumbbell-overhead-tricep-extensions': ['img-3703', 'img-3864', 'img-3865'],
  'dumbbell-pullover': ['img-3707', 'img-3867', 'img-3868', 'img-3869', 'img-6814-1', 'img-3870', 'img-6216'],
  'dumbbell-rdl': ['img-6812-3', 'img-6180', 'img-4645'],
  'dumbbell-skull-crusher': ['img-3709'],
  'dumbbell-squat': ['img-4644'],
  'dumbbell-squat-glute-focus-376': ['img-3912'],
  'dumbbell-upright-row-412': ['img-3866'],
  'elbows-to-knees-sit-up-291': ['img-3700'],
  'elevated-hip-sl-raises-w-kb-hold-317': ['img-3881'],
  'facepull': ['img-4625'],
  'hack-squat-machine-389': ['img-4799', 'img-4801', 'img-4800', 'img-4803'],
  'hanging-knee-raises': ['img-6219-1', 'img-6220'],
  'hip-bridges-optional-423': ['img-6231'],
  'hyperextensions': ['img-7287'],
  'incline-dumbbell-bicep-curls': ['img-3694'],
  'incline-push-up-348': ['img-3712'],
  'jump-rope': ['img-6187-1'],
  'kb-alternating-low-leg-raises': ['img-6814'],
  'kettlebell-rdl': ['img-3884'],
  'kettlebell-swings': ['img-3890', 'img-3889'],
  'kneeling-cable-overhead-tricep-extensions': ['img-4629'],
  'kneeling-cable-rope-pull': ['img-4618', 'img-6189'],
  'leg-curl-machine-glute-emphasis': ['img-4787'],
  'leg-lowers-296': ['img-5785', 'img-5776', 'img-5776-8', 'img-4669'],
  'leg-press': ['img-6209-2', 'img-4816', 'img-6214', 'img-4805'],
  'leg-press-narrow-high-stance-glute-focus': ['img-6225'],
  'lower-leg-lifts-with-block-feet-holds': ['img-6816-2', 'img-6816-3', 'img-4653'],
  'lying-crunch-with-adduction': ['img-6816-5', 'img-6816-1'],
  'machine-chest-press-349': ['img-6211', 'img-4779'],
  'machine-leg-extension-393': ['img-4788', 'img-4789', 'img-6210'],
  'machine-leg-press-390': ['img-6209-1'],
  'machine-seated-abduction': ['img-4797', 'img-4794', 'img-4793', 'img-4798'],
  'machine-single-leg-extension': ['img-6218-1', 'img-6219', 'img-6224'],
  'machine-tricep-push-down': ['img-6212'],
  'medicine-ball-burpees': ['img-3883'],
  'medicine-ball-dead-bugs': ['img-5779', 'img-5779-2', 'img-5779-3'],
  'mountain-climbers-301': ['img-5776-4', 'img-5782-1'],
  'narrow-grip-seated-cable-row': ['img-4613', 'img-4611', 'img-4610'],
  'pallof-cable-press': ['img-6230', 'img-4616', 'img-4622', 'img-4624', 'img-6201', 'img-6207', 'img-6206'],
  'pilates-lower-leg-lifts-309': ['img-5776-1', 'img-5776-2'],
  'plank-289': ['img-3681', 'img-5776-7', 'img-5778-3', 'img-6233-4', 'img-6233-6', 'img-5776-3'],
  'plank-with-kettlebell-unilateral-slide': ['img-6813'],
  'prone-hamstring-machine': ['img-4784', 'img-4785', 'img-4810', 'img-4812'],
  'renegade-row': ['img-6810', 'img-6185'],
  'sb-alt-dead-bug-312': ['img-5779-1', 'img-5786', 'img-6813-1', 'img-6816-4'],
  'sb-crunch-320': ['img-5779-4'],
  'sb-plank': ['img-4656', 'img-4655', 'img-5781'],
  'seated-cable-lat-pull-down': ['img-4632', 'img-4633', 'img-4777', 'img-4634'],
  'seated-dumbbell-bicep-curls': ['img-3710', 'img-3711', 'img-3693', 'img-3698', 'img-3704'],
  'seated-dumbbell-lateral-raises': ['img-3690', 'img-6234-2', 'img-6809-1', 'img-6809-3'],
  'seated-dumbbell-shoulder-press': ['img-3691', 'img-3692', 'img-6809-2'],
  'seated-dumbbell-shoulder-press-with-adduction': ['img-6809'],
  'seated-single-arm-dumbbell-arnold-press': ['img-3697'],
  'seated-single-arm-dumbbell-curl-with-block-adduction': ['img-6809-4', 'img-3705'],
  'shoulder-floor-push-up': ['img-6233-3'],
  'shoulder-press-machine': ['img-6211-1'],
  'side-plank-292': ['img-5776-10', 'img-5776-9', 'img-5778'],
  'single-arm-cable-over-head-lat-pulldown': ['img-4628'],
  'single-arm-dumbbell-bent-over-row': ['img-3699', 'img-3863', 'img-6186'],
  'single-arm-dumbbell-row-323': ['img-3859', 'img-3873', 'img-6228-1'],
  'single-arm-kneeling-cable-row': ['img-6181-3'],
  'single-arm-overhead-dumbbell-tricep-extentions': ['img-3701'],
  'single-leg-leg-press-machine': ['img-6209'],
  'smith-machine-body-weight-prone-grip-row-321': ['img-4670'],
  'smith-machine-narrow-rdl': ['img-4663', 'img-4666'],
  'smith-machine-rdl': ['img-4664', 'img-4668'],
  'smith-machine-squat-387': ['img-4660', 'img-4657', 'img-4658', 'img-4659'],
  'smith-machine-stationary-lunge': ['img-4671', 'img-4661'],
  'stability-bird-dog-318': ['img-5787'],
  'standing-calf-raise-machine': ['img-4782'],
  'standing-dumbbell-alternating-bicep-curl': ['img-3857', 'img-3907'],
  'standing-dumbbell-alternating-hammer-curl': ['img-6183-2'],
  'standing-dumbbell-curl-and-press': ['img-6183-3'],
  'standing-dumbbell-frontal-raises': ['img-6179'],
  'standing-dumbbell-windmill': ['img-6186-1'],
  'standing-plate-alternating-frontal-and-lateral-raises': ['img-6812-1'],
  'standing-plate-lateral-raises': ['img-6812-2', 'img-6812'],
  'standing-single-leg-dumbbell-rdl': ['img-3874', 'img-6181', 'img-6181-1', 'img-3882', 'img-5789', 'img-6221'],
  'star-jump-351': ['img-4651'],
  'straight-arm-pulldown': ['img-4638', 'img-6208'],
  'superman': ['img-6233-2', 'img-6233-5', 'img-6233'],
  'supported-hip-dead-bug': ['img-5786-1'],
  'table-top-alternating-towel-arm-slides': ['img-5783-1'],
  'table-top-knee-taps-305': ['img-5781-2', 'img-5778-1', 'img-5782'],
  'table-top-knee-taps-with-block-adduction': ['img-5784', 'img-5785-1'],
  'toe-touches-299': ['img-5776-5', 'img-5781-1'],
  'towel-pike': ['img-5783-2'],
  'tricep-dips-machine': ['img-4783'],
  'tricep-rope-pulldown': ['img-4619', 'img-6205', 'img-4609', 'img-6192'],
  'wall-sit-with-parallel-isometric-arm-hold': ['img-6234', 'img-6234-1'],
  'weighted-crunches-298': ['img-5781-3'],
};

// 1 videos still untagged — surfaced only via the in-app
// admin tagger so nothing in Stream sits orphaned.
const UNTAGGED_VIDEO_SLUGS: readonly string[] = [
  'img-4667',
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

  // One signed-URL fetch attempt. Returns the result on success/valid
  // rejection, or throws on a network-level failure so the caller can
  // retry once.
  const attempt = async () => {
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
  };

  try {
    return await attempt();
  } catch (err) {
    // Transient failure (network blip / edge cold-start). Retry once
    // before giving up so a single hiccup doesn't leave a broken player.
    if (__DEV__) console.warn('[videoService] fetch threw, retrying once:', err);
    try {
      return await attempt();
    } catch (err2) {
      if (__DEV__) console.warn('[videoService] retry failed:', err2);
      return null;
    }
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
