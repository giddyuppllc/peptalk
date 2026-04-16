/**
 * Tutorial store — tracks first-run walkthrough + per-feature coach-marks.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

/** Measured screen position of a tour target element */
export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TourVariant = 'intro' | 'free_to_plus' | 'plus_to_pro';

interface TutorialState {
  /** Whether the user has completed or skipped the main first-run tour */
  hasSeenTour: boolean;
  /** Per-feature one-off coach-mark flags (e.g. `first_nutrition_visit`) */
  seenCoachMarks: Record<string, boolean>;
  /** Whether the tour overlay is currently showing */
  tourActive: boolean;
  /** Index of the active tour step */
  currentStep: number;
  /** Which tour variant is currently running */
  activeTour: TourVariant;
  /** Queue of upgrade-delta tours to run (fires after subscription changes) */
  queuedDeltaTour: TourVariant | null;
  /** Last tier the user was on — used to detect upgrades and queue delta tours */
  lastKnownTier: 'free' | 'plus' | 'pro' | null;
  /** Which upgrade-delta tours have already been seen (prevents repeats) */
  seenDeltaTours: Record<string, boolean>;
  /** Live registry of measured target positions, keyed by target id */
  targetRects: Record<string, TargetRect>;
}

interface TutorialActions {
  startTour: (variant?: TourVariant) => void;
  nextStep: () => void;
  goToStep: (step: number) => void;
  skipTour: () => void;
  completeTour: () => void;
  resetTour: () => void;
  markCoachMarkSeen: (key: string) => void;
  hasSeenCoachMark: (key: string) => boolean;
  // Target registry
  registerTarget: (id: string, rect: TargetRect) => void;
  unregisterTarget: (id: string) => void;
  // Upgrade delta tours
  setLastKnownTier: (tier: 'free' | 'plus' | 'pro') => void;
  queueDeltaTour: (variant: TourVariant) => void;
  clearQueuedDeltaTour: () => void;
}

export const useTutorialStore = create<TutorialState & TutorialActions>()(
  persist(
    (set, get) => ({
      hasSeenTour: false,
      seenCoachMarks: {},
      tourActive: false,
      currentStep: 0,
      activeTour: 'intro' as TourVariant,
      queuedDeltaTour: null,
      lastKnownTier: null,
      seenDeltaTours: {},
      targetRects: {},

      startTour: (variant = 'intro') => set({ tourActive: true, currentStep: 0, activeTour: variant }),

      nextStep: () => set({ currentStep: get().currentStep + 1 }),

      goToStep: (step) => set({ currentStep: step }),

      skipTour: () => {
        const variant = get().activeTour;
        set((state) => ({
          tourActive: false,
          currentStep: 0,
          hasSeenTour: variant === 'intro' ? true : state.hasSeenTour,
          seenDeltaTours:
            variant !== 'intro' ? { ...state.seenDeltaTours, [variant]: true } : state.seenDeltaTours,
          queuedDeltaTour: null,
        }));
      },

      completeTour: () => {
        const variant = get().activeTour;
        set((state) => ({
          tourActive: false,
          currentStep: 0,
          hasSeenTour: variant === 'intro' ? true : state.hasSeenTour,
          seenDeltaTours:
            variant !== 'intro' ? { ...state.seenDeltaTours, [variant]: true } : state.seenDeltaTours,
          queuedDeltaTour: null,
        }));
      },

      resetTour: () =>
        set({
          hasSeenTour: false,
          tourActive: false,
          currentStep: 0,
          seenCoachMarks: {},
          activeTour: 'intro',
          seenDeltaTours: {},
        }),

      markCoachMarkSeen: (key) =>
        set({ seenCoachMarks: { ...get().seenCoachMarks, [key]: true } }),

      hasSeenCoachMark: (key) => !!get().seenCoachMarks[key],

      registerTarget: (id, rect) =>
        set((state) => ({ targetRects: { ...state.targetRects, [id]: rect } })),

      unregisterTarget: (id) =>
        set((state) => {
          const next = { ...state.targetRects };
          delete next[id];
          return { targetRects: next };
        }),

      setLastKnownTier: (tier) => set({ lastKnownTier: tier }),

      queueDeltaTour: (variant) => set({ queuedDeltaTour: variant }),

      clearQueuedDeltaTour: () => set({ queuedDeltaTour: null }),
    }),
    {
      name: 'peptalk-tutorial',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        hasSeenTour: state.hasSeenTour,
        seenCoachMarks: state.seenCoachMarks,
        lastKnownTier: state.lastKnownTier,
        seenDeltaTours: state.seenDeltaTours,
      }),
    },
  ),
);

export default useTutorialStore;
