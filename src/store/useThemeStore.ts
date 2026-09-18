import { create } from 'zustand';
import { makeSafeMerge } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * v3 gendered variant override (Master Refactor Plan v3.1 §4.6).
 *
 * 'auto' = derived from useOnboardingStore.profile.gender.
 * 'female' / 'male' = user manually pinned a variant in Profile settings.
 *
 * Decoupled from `mode` (light/dark) so a user can still pick the
 * masculine palette without committing to dark mode if either evolves
 * separately later.
 */
export type V3Variant = 'auto' | 'female' | 'male';

interface ThemeStore {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Resolved theme based on mode + system preference */
  isDark: () => boolean;
  /** v3 gendered variant — 'auto' uses onboarding gender. */
  v3Variant: V3Variant;
  setV3Variant: (variant: V3Variant) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light' as ThemeMode,

      setMode: (mode: ThemeMode) => set({ mode }),

      isDark: () => {
        const { mode } = get();
        if (mode === 'system') {
          return Appearance.getColorScheme() !== 'light';
        }
        return mode === 'dark';
      },

      v3Variant: 'auto',
      setV3Variant: (variant) => set({ v3Variant: variant }),
    }),
    {
      name: 'peptalk-theme',
      // Explicit so the number is visible, and deliberately still 0.
      //
      // In zustand 5.0.14 a bump with no `migrate` DISCARDS the persisted
      // state and hydrates defaults — verified against middleware.js:392-420
      // and by running it. That is the useful meaning of a bump, so nothing
      // here overrides it: a store that needs to carry old data forward
      // supplies its own migrate, and the three that do already have one.
      version: 0,
      // Storage is untrusted input: on web it is localStorage, which the
      // user can edit, and a killed app leaves partial writes. See
      // src/lib/persistSafety.ts.
      merge: makeSafeMerge('peptalk-theme', reportPersistProblem),
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mode: state.mode,
        v3Variant: state.v3Variant,
      }),
    },
  ),
);
