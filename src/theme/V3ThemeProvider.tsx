/**
 * V3ThemeProvider — provides the locked v3 design tokens to the tree.
 *
 * Picks the female palette by default. Male users (per
 * `useOnboardingStore.profile.gender === 'Male'`) get the dark variant.
 * Phase A defines both palettes but only the female render is built —
 * Phase C ships the male components.
 *
 * Wraps the app at root so every v3 component reads from one place.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useThemeStore } from '../store/useThemeStore';
import { v3Female, v3Male, type V3Variant } from './v3';

const V3ThemeContext = createContext<V3Variant>(v3Female);

interface ProviderProps {
  children: React.ReactNode;
  /** Optional override — useful for previews / Storybook / theme-flip
   *  toggle in Profile (Phase C). When set, ignores onboarding gender. */
  forceVariant?: 'female' | 'male';
}

export function V3ThemeProvider({ children, forceVariant }: ProviderProps) {
  // Read the gender once; the persisted store rehydrates on boot so
  // this is stable for the session.
  const gender = useOnboardingStore((s) => s.profile.gender);
  // §4.6 — Profile setting lets a user pin a variant regardless of sex.
  const v3Variant = useThemeStore((s) => s.v3Variant);

  const theme = useMemo<V3Variant>(() => {
    if (forceVariant === 'male') return v3Male;
    if (forceVariant === 'female') return v3Female;
    if (v3Variant === 'male') return v3Male;
    if (v3Variant === 'female') return v3Female;
    // 'auto' — onboarding sex wins.
    return gender === 'Male' ? v3Male : v3Female;
  }, [forceVariant, v3Variant, gender]);

  return <V3ThemeContext.Provider value={theme}>{children}</V3ThemeContext.Provider>;
}

export function useV3Theme(): V3Variant {
  return useContext(V3ThemeContext);
}
