/**
 * Community prefs store — Master Refactor Plan v3.1 §13.5 + §11.4.
 *
 * Captures the user's public-tracking opt-in choices. Set at intake
 * (§11.4) with three preset shapes — All in, Picky, Nothing — and
 * fine-tunable later via Profile.
 *
 * Defaults to all-off so a returning user who upgrades to a build with
 * Community v2 isn't auto-opted-in.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

export interface CommunityPrefs {
  /** Master toggle. If false, none of the sub-categories matter. */
  publicTracking: boolean;
  /** Per-category granular opt-ins. Persisted independently so user
   *  can flip just one without re-running the intake selector. */
  shareCategories: {
    streak: boolean;
    adherence: boolean;
    bodyCompDeltas: boolean;
    milestones: boolean;
    progressPhotos: boolean;
  };
}

export type CommunityPreset = 'all_in' | 'picky' | 'nothing';

const PRESETS: Record<CommunityPreset, CommunityPrefs> = {
  all_in: {
    publicTracking: true,
    shareCategories: {
      streak: true,
      adherence: true,
      bodyCompDeltas: true,
      milestones: true,
      progressPhotos: false, // per §13.5 — default false; per-upload override
    },
  },
  picky: {
    publicTracking: true,
    shareCategories: {
      streak: true,
      adherence: false,
      bodyCompDeltas: false,
      milestones: true,
      progressPhotos: false,
    },
  },
  nothing: {
    publicTracking: false,
    shareCategories: {
      streak: false,
      adherence: false,
      bodyCompDeltas: false,
      milestones: false,
      progressPhotos: false,
    },
  },
};

interface CommunityPrefsState extends CommunityPrefs {
  /** Whether the user has answered the intake opt-in question yet. */
  intakeResolved: boolean;
}

interface CommunityPrefsActions {
  applyPreset: (preset: CommunityPreset) => void;
  setMaster: (on: boolean) => void;
  toggleCategory: (
    category: keyof CommunityPrefs['shareCategories'],
  ) => void;
  reset: () => void;
}

export const useCommunityPrefsStore = create<
  CommunityPrefsState & CommunityPrefsActions
>()(
  persist(
    (set, get) => ({
      ...PRESETS.nothing,
      intakeResolved: false,

      applyPreset: (preset) =>
        set({
          ...PRESETS[preset],
          intakeResolved: true,
        }),

      setMaster: (on) =>
        set({
          publicTracking: on,
          intakeResolved: true,
        }),

      toggleCategory: (category) => {
        const cur = get().shareCategories[category];
        set({
          shareCategories: {
            ...get().shareCategories,
            [category]: !cur,
          },
          intakeResolved: true,
        });
      },

      reset: () => set({ ...PRESETS.nothing, intakeResolved: false }),
    }),
    {
      name: 'peptalk-community-prefs-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
