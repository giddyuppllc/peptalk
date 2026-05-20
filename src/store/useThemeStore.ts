import { create } from 'zustand';
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mode: state.mode,
        v3Variant: state.v3Variant,
      }),
    },
  ),
);
