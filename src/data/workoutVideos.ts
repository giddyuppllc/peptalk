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
import { EXERCISES } from './exercises';

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
  /** R2 object key (path inside the bucket, including extension). */
  objectKey: string;
  /** Human-readable title shown in the library. */
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

/**
 * ── Tolerant exercise-id matching ────────────────────────────────────────────
 *
 * 66 of the 264 tagged clips carried an `exerciseId` that matches no exercise
 * in the catalog, so those videos loaded, sat in the manifest, and reached no
 * screen. `getVideosByExerciseId` did an exact string compare, so a tag that
 * was one character off was identical to no tag at all.
 *
 * They are not random. 31 distinct bad ids, and 26 of them are the real id
 * with a trailing number (`plank-289` → `plank`, `side-plank-292` →
 * `side-plank`, `leg-lowers-296` → `leg-lowers`) or the same words in a
 * different order (`chest-press-machine` → `machine-chest-press`). That is a
 * tagging pipeline that saw a numbered list, not 26 separate mistakes.
 *
 * Fixed HERE rather than in workoutVideos.json, deliberately: the standing
 * rule is not to overwrite stored data records. The manifest stays
 * byte-identical, the resolution happens at read time, and the same tolerance
 * covers future tags with the same shape instead of needing another sweep.
 *
 * The matching is strict about ambiguity. A token-order match is only accepted
 * when exactly ONE real exercise has that token set — two pairs in the catalog
 * collide (`bent-over-cable-bar-row`/`cable-bar-bent-over-row` and
 * `overhead-tricep-barbell-extensions`/`barbell-overhead-tricep-extensions`,
 * which look like the same movement entered twice), and showing a clip on the
 * wrong exercise is worse than showing it on none.
 */
const tokenKey = (id: string) =>
  id.toLowerCase().replace(/-\d+$/, '').split('-').filter(Boolean).sort().join('-');

/**
 * Built once on first use. A static import is fine here — exercises.ts pulls in
 * only types and a JSON file, and nothing in that direction imports back, so
 * there is no cycle to dodge. An earlier version used require() to "stay cheap
 * to import", which bought nothing (the catalog is imported almost everywhere
 * anyway) and cost the type safety of a real import.
 */
let idIndex: { real: Set<string>; byTokens: Map<string, string[]> } | null = null;
function getIdIndex() {
  if (idIndex) return idIndex;
  const real = new Set(EXERCISES.map((e) => e.id));
  const byTokens = new Map<string, string[]>();
  for (const e of EXERCISES) {
    const k = tokenKey(e.id);
    byTokens.set(k, [...(byTokens.get(k) ?? []), e.id]);
  }
  idIndex = { real, byTokens };
  return idIndex;
}

/**
 * The catalog id a tag refers to, or null when nothing matches unambiguously.
 * Exported so `verify:videos` can report what is still unreachable.
 */
export function resolveExerciseId(tag: string | null): string | null {
  if (!tag) return null;
  const { real, byTokens } = getIdIndex();
  if (real.has(tag)) return tag;

  const stripped = tag.replace(/-\d+$/, '');
  if (stripped !== tag && real.has(stripped)) return stripped;

  const candidates = byTokens.get(tokenKey(tag)) ?? [];
  return candidates.length === 1 ? candidates[0] : null;
}

export function getVideosByExerciseId(exerciseId: string): WorkoutVideo[] {
  return WORKOUT_VIDEOS.filter(
    (v) => !v.needsReview && resolveExerciseId(v.exerciseId) === exerciseId,
  );
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
