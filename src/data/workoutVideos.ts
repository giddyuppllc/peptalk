/**
 * Workout video manifest.
 *
 * Source of truth for which video files exist in the R2 bucket
 * (peptalktraining), how they map to exercises in src/data/exercises.ts,
 * and which broad category they belong to.
 *
 * The raw entries live in workoutVideos.json (so the file can grow to
 * hundreds of rows without polluting diffs). This file owns the types,
 * lookups, and tagger-state mutators.
 *
 * Categories are Jamie's: weight_loss, muscle_gain, toning, strength,
 * endurance, longevity, yoga, pilates, muscle_growth, recovery, form_tutorial.
 */

import rawManifest from './workoutVideos.json';

export type WorkoutVideoCategory =
  | 'weight_loss'
  | 'muscle_gain'
  | 'muscle_growth'
  | 'toning'
  | 'strength'
  | 'endurance'
  | 'longevity'
  | 'yoga'
  | 'pilates'
  | 'recovery'
  | 'form_tutorial';

export interface WorkoutVideo {
  /** Stable slug — derived from the R2 object key, used in URLs. */
  slug: string;
  /** R2 object key (path inside the bucket, including extension). The
   *  R2 copy is kept as a cold backup even after Stream migration —
   *  edge function only signs an R2 URL when streamUid is absent. */
  objectKey: string;
  /** Cloudflare Stream video UID. When present, the edge function
   *  returns a Stream HLS playback URL + signed JWT instead of an
   *  R2 signed URL. Set by scripts/migrate-r2-to-stream.mjs. */
  streamUid?: string;
  /** Human-readable title shown in the library. Once a video is on
   *  Stream, the edge function returns Stream's `meta.name` as the
   *  authoritative title — Jamie can rename in the Stream dashboard
   *  and changes flow into the app without a redeploy. This bundled
   *  value is the fallback. */
  title: string;
  /** Optional short blurb under the title in the player. */
  description?: string;
  /** Match into src/data/exercises.ts. null = not yet matched. */
  exerciseId: string | null;
  /** Broad category for filtering. null = uncategorized. */
  category: WorkoutVideoCategory | null;
  /** Duration in seconds, if known (Jamie can fill or we infer later). */
  durationSec?: number;
  /** Confidence 0–1 from any auto-matcher (vision API, etc.). <0.7 surfaces in tagger. */
  matchConfidence?: number;
  /** True until Jamie reviews and approves. Hidden from library when true. */
  needsReview?: boolean;
  /** First-pass AI tagging result. Non-destructive — the tagger UI uses
   *  this as a pre-selected default that Jamie confirms or overrides.
   *  Populated by scripts/ai-tag-videos.mjs. */
  aiSuggested?: {
    exerciseId: string | null;
    category: WorkoutVideoCategory | null;
    title: string;
    confidence: number;
    reasoning: string;
    model: string;
    taggedAt: string;
  };
}

export const WORKOUT_VIDEOS: WorkoutVideo[] = rawManifest as WorkoutVideo[];

export function getReviewedVideos(): WorkoutVideo[] {
  return WORKOUT_VIDEOS.filter((v) => !v.needsReview && v.exerciseId);
}

export function getUntaggedVideos(): WorkoutVideo[] {
  return WORKOUT_VIDEOS.filter((v) => v.needsReview);
}

export function getVideosByCategory(category: WorkoutVideoCategory): WorkoutVideo[] {
  return WORKOUT_VIDEOS.filter((v) => v.category === category && !v.needsReview);
}

export function getVideoBySlug(slug: string): WorkoutVideo | undefined {
  return WORKOUT_VIDEOS.find((v) => v.slug === slug);
}

export function getVideosByExerciseId(exerciseId: string): WorkoutVideo[] {
  return WORKOUT_VIDEOS.filter((v) => v.exerciseId === exerciseId && !v.needsReview);
}

export const CATEGORY_LABELS: Record<WorkoutVideoCategory, string> = {
  weight_loss: 'Weight Loss',
  muscle_gain: 'Muscle Gain',
  muscle_growth: 'Muscle Growth',
  toning: 'Toning',
  strength: 'Strength',
  endurance: 'Endurance',
  longevity: 'Longevity',
  yoga: 'Yoga',
  pilates: 'Pilates',
  recovery: 'Recovery',
  form_tutorial: 'Form Tutorial',
};

export const CATEGORY_ORDER: WorkoutVideoCategory[] = [
  'weight_loss',
  'muscle_growth',
  'muscle_gain',
  'toning',
  'strength',
  'endurance',
  'pilates',
  'yoga',
  'recovery',
  'longevity',
  'form_tutorial',
];
