/**
 * useVideoTaggerStore
 *
 * Local-only edits to the workout-video manifest, persisted to AsyncStorage.
 * The tagger writes here; Edward exports a merged JSON from the admin
 * screen and pastes it back into src/data/workoutVideos.json on the next
 * release.
 *
 * Why client-side: the manifest is a build-time asset for now. Once
 * volume justifies it, migrate this to a Supabase `workout_video_overrides`
 * table and merge at runtime so changes go live without a build.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutVideo, WorkoutVideoCategory } from '../data/workoutVideos';

export type VideoEdit = Partial<Pick<WorkoutVideo, 'title' | 'description' | 'exerciseId' | 'category' | 'durationSec' | 'needsReview'>>;

interface State {
  /** Slug → edited fields. Merged with the static manifest at read time. */
  edits: Record<string, VideoEdit>;
  setEdit: (slug: string, edit: VideoEdit) => void;
  clearEdit: (slug: string) => void;
  resetAll: () => void;
}

export const useVideoTaggerStore = create<State>()(
  persist(
    (set) => ({
      edits: {},
      setEdit: (slug, edit) =>
        set((s) => ({ edits: { ...s.edits, [slug]: { ...(s.edits[slug] ?? {}), ...edit } } })),
      clearEdit: (slug) =>
        set((s) => {
          const next = { ...s.edits };
          delete next[slug];
          return { edits: next };
        }),
      resetAll: () => set({ edits: {} }),
    }),
    {
      name: 'video-tagger-edits.v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** Apply all stored edits over a base manifest — produces the effective list. */
export function applyEdits<T extends WorkoutVideo>(base: T[], edits: Record<string, VideoEdit>): T[] {
  return base.map((v) => ({ ...v, ...(edits[v.slug] ?? {}) }));
}

export function categoryOrUndefined(value: unknown): WorkoutVideoCategory | undefined {
  if (typeof value !== 'string') return undefined;
  return value as WorkoutVideoCategory;
}
