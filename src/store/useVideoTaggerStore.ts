/**
 * useVideoTaggerStore
 *
 * Edits to the workout-video manifest. Two layers, both persisted to
 * AsyncStorage:
 *
 *   - `remoteEdits`: overrides pulled from the Supabase
 *     `workout_video_overrides` table on app load (see
 *     src/services/workoutOverrides.ts). This is the shared, cross-device
 *     source of truth — Jamie's tags from any device land here. Cached to
 *     AsyncStorage so the merged manifest survives an offline cold start.
 *
 *   - `edits`: the local tagging session (what the tagger just changed on
 *     THIS device, not yet confirmed saved to the DB). Wins over remote so
 *     in-progress work is never hidden by a slightly-stale remote fetch.
 *
 * Merge precedence at read time:  static JSON  <  remoteEdits  <  edits
 *
 * The tagger pushes `edits` to the DB via save-workout-overrides; the read
 * path (library, player, tagger) merges everything through `applyEdits`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutVideo, WorkoutVideoCategory } from '../data/workoutVideos';

export type VideoEdit = Partial<Pick<WorkoutVideo, 'title' | 'description' | 'exerciseId' | 'category' | 'durationSec' | 'needsReview'>>;

interface State {
  /** Slug → edited fields from THIS device's current session. */
  edits: Record<string, VideoEdit>;
  /** Slug → overrides fetched from Supabase. Shared across devices. */
  remoteEdits: Record<string, VideoEdit>;
  /** Epoch ms of the last successful remote fetch (0 = never). */
  remoteFetchedAt: number;
  setEdit: (slug: string, edit: VideoEdit) => void;
  clearEdit: (slug: string) => void;
  resetAll: () => void;
  /** Replace the remote overrides snapshot (called after a DB fetch). */
  setRemoteEdits: (remote: Record<string, VideoEdit>) => void;
}

export const useVideoTaggerStore = create<State>()(
  persist(
    (set) => ({
      edits: {},
      remoteEdits: {},
      remoteFetchedAt: 0,
      setEdit: (slug, edit) =>
        set((s) => ({ edits: { ...s.edits, [slug]: { ...(s.edits[slug] ?? {}), ...edit } } })),
      clearEdit: (slug) =>
        set((s) => {
          const next = { ...s.edits };
          delete next[slug];
          return { edits: next };
        }),
      resetAll: () => set({ edits: {} }),
      setRemoteEdits: (remote) => set({ remoteEdits: remote, remoteFetchedAt: Date.now() }),
    }),
    {
      name: 'video-tagger-edits.v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Combined edits with the right precedence: remote overrides first, then
 * the local session on top. Use this when you have both layers and want a
 * single map to merge over the static manifest.
 */
export function combineEdits(
  remoteEdits: Record<string, VideoEdit>,
  localEdits: Record<string, VideoEdit>,
): Record<string, VideoEdit> {
  const out: Record<string, VideoEdit> = { ...remoteEdits };
  for (const [slug, edit] of Object.entries(localEdits)) {
    out[slug] = { ...(out[slug] ?? {}), ...edit };
  }
  return out;
}

/**
 * Apply stored edits over a base manifest — produces the effective list.
 *
 * Accepts either a single already-combined edits map, or call
 * `combineEdits(remote, local)` first. Kept backward-compatible: a single
 * map argument behaves exactly as before.
 */
export function applyEdits<T extends WorkoutVideo>(base: T[], edits: Record<string, VideoEdit>): T[] {
  return base.map((v) => ({ ...v, ...(edits[v.slug] ?? {}) }));
}

export function categoryOrUndefined(value: unknown): WorkoutVideoCategory | undefined {
  if (typeof value !== 'string') return undefined;
  return value as WorkoutVideoCategory;
}
