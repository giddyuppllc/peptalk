/**
 * Video Service — Maps exercises to Cloudflare R2 hosted videos.
 *
 * Source of truth: src/data/workoutVideos.json. Each video row has an R2
 * `objectKey` (the path inside the bucket) and an `exerciseId` (set by an
 * admin when the video has been reviewed). For unreviewed rows, Grok's
 * `aiSuggested.exerciseId` is used as a fallback so videos still resolve
 * in the app while review is in flight.
 *
 * Why a fallback: Grok pre-tagged the full library in May 2026 with high
 * confidence (>0.9 on most rows) but no one ever ran the promotion step
 * that moves `aiSuggested.exerciseId` → top-level `exerciseId`. Without
 * the fallback, every video resolved to null and nothing played.
 *
 * Base URL: https://videos.peptalkapp.com (custom domain on R2 bucket
 * `peptalktraining`). Overridable via EXPO_PUBLIC_R2_VIDEO_URL.
 */

import workoutVideosData from '../data/workoutVideos.json';

const R2_BASE_URL = process.env.EXPO_PUBLIC_R2_VIDEO_URL
  ?? 'https://videos.peptalkapp.com';

interface WorkoutVideoRow {
  slug: string;
  objectKey: string;
  title: string;
  exerciseId: string | null;
  category: string | null;
  needsReview?: boolean;
  aiSuggested?: {
    exerciseId: string | null;
    category?: string | null;
    title?: string;
    confidence?: number;
  };
}

/**
 * Build the manifest once at module load. Reviewed mappings (top-level
 * `exerciseId`) win; AI suggestions fill in everything else. Last-write-
 * wins if two videos point at the same exercise — fine for now since
 * Jamie hasn't requested per-exercise multi-video carousels yet.
 */
const VIDEO_MANIFEST: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const row of workoutVideosData as WorkoutVideoRow[]) {
    const exerciseId = row.exerciseId ?? row.aiSuggested?.exerciseId ?? null;
    if (!exerciseId || !row.objectKey) continue;
    map[exerciseId] = row.objectKey;
  }
  return map;
})();

/**
 * Get the video URL for an exercise by ID.
 * Returns null if no video is mapped.
 */
export function getExerciseVideoUrl(exerciseId: string): string | null {
  const objectKey = VIDEO_MANIFEST[exerciseId];
  if (!objectKey) return null;
  // R2 object keys can contain slashes (folder-like paths). Encode each
  // path segment so spaces/specials don't break the URL, but keep the
  // slashes themselves so the bucket routing still works.
  const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${R2_BASE_URL}/${encoded}`;
}

/**
 * Get the thumbnail URL for an exercise video.
 * Convention: same path, .jpg extension, under `thumbnails/` prefix.
 */
export function getExerciseThumbnailUrl(exerciseId: string): string | null {
  const objectKey = VIDEO_MANIFEST[exerciseId];
  if (!objectKey) return null;
  const jpgKey = objectKey.replace(/\.(mp4|mov|m4v)$/i, '.jpg');
  const encoded = jpgKey.split('/').map(encodeURIComponent).join('/');
  return `${R2_BASE_URL}/thumbnails/${encoded}`;
}

/**
 * Check if an exercise has a video available.
 */
export function hasExerciseVideo(exerciseId: string): boolean {
  return exerciseId in VIDEO_MANIFEST;
}

/**
 * Get total count of available videos.
 */
export function getVideoCount(): number {
  return Object.keys(VIDEO_MANIFEST).length;
}
