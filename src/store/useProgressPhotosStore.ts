/**
 * Progress photos store — Master Refactor Plan v3.1 §5.2 + §13.5.
 *
 * Local-first photo log. URIs point to expo-image-picker copies stored
 * in the app's document directory; the store keeps metadata
 * (caption, weight at time, date) so the user can scrub a trend.
 *
 * Privacy: §13.5 says `progressPhotos` defaults false on community
 * sharing. This store stays local-only — uploading to the community
 * requires a per-photo opt-in flag (`sharedToCommunity`).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

export interface ProgressPhoto {
  id: string;
  /** Local file URI from expo-image-picker. */
  uri: string;
  /** YYYY-MM-DD. */
  date: string;
  caption?: string;
  /** Snapshot of weight at the time, if the user typed one. */
  weightLb?: number;
  /** Per-photo community share flag. Defaults false. */
  sharedToCommunity?: boolean;
  createdAt: string;
}

interface PhotosState {
  photos: ProgressPhoto[];
}

interface PhotosActions {
  addPhoto: (input: Omit<ProgressPhoto, 'id' | 'createdAt'>) => ProgressPhoto;
  removePhoto: (id: string) => void;
  updatePhoto: (id: string, patch: Partial<ProgressPhoto>) => void;
  toggleShare: (id: string) => void;
  clearAll: () => void;
}

function uid() {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const useProgressPhotosStore = create<PhotosState & PhotosActions>()(
  persist(
    (set, get) => ({
      photos: [],

      addPhoto: (input) => {
        const photo: ProgressPhoto = {
          ...input,
          id: uid(),
          createdAt: new Date().toISOString(),
          sharedToCommunity: input.sharedToCommunity ?? false,
        };
        set({ photos: [photo, ...get().photos] });
        return photo;
      },

      removePhoto: (id) =>
        set({ photos: get().photos.filter((p) => p.id !== id) }),

      updatePhoto: (id, patch) =>
        set({
          photos: get().photos.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        }),

      toggleShare: (id) =>
        set({
          photos: get().photos.map((p) =>
            p.id === id
              ? { ...p, sharedToCommunity: !p.sharedToCommunity }
              : p,
          ),
        }),

      clearAll: () => set({ photos: [] }),
    }),
    {
      name: 'peptalk-progress-photos-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
