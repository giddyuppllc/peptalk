/**
 * useSectionAccent — returns the active section's pastel + deeper shades
 * based on the current route and user gender.
 *
 * Non-tab routes (auth, onboarding, modals) fall back to the global gender
 * primary so nothing breaks when mounted outside a tab.
 *
 * Usage:
 *   const accent = useSectionAccent();
 *   <TouchableOpacity style={{ backgroundColor: accent.deep }} />
 *
 * Override by explicit section (useful for detail routes that sit outside
 * the tab tree but should inherit a tab's color — e.g. peptide/[id]):
 *   const accent = useSectionAccent('peptides');
 */

import { usePathname } from 'expo-router';
import { useMemo } from 'react';
import {
  AppSection,
  FEMALE_FALLBACK,
  MALE_FALLBACK,
  MALE_HOME,
  SECTION_PALETTE,
  SectionColors,
  resolveSectionFromPath,
} from '../config/sectionPalette';
import { getTestProfile } from '../constants/testProfiles';
import { useAuthStore } from '../store/useAuthStore';
import { useOnboardingStore } from '../store/useOnboardingStore';

export interface SectionAccent extends SectionColors {
  /** Which section resolved, or null for non-tab routes (fallback active). */
  section: AppSection | null;
}

export function useSectionAccent(override?: AppSection): SectionAccent {
  const pathname = usePathname();
  const userEmail = useAuthStore((s) => s.user?.email);
  const onboardingGender = useOnboardingStore((s) => s.profile.gender);

  return useMemo(() => {
    const testProfile = userEmail ? getTestProfile(userEmail) : null;
    const rawGender = testProfile?.gender ?? onboardingGender;
    const isMale = rawGender !== 'Female'; // male is the default fallback

    const section = override ?? resolveSectionFromPath(pathname);

    if (!section) {
      const fb = isMale ? MALE_FALLBACK : FEMALE_FALLBACK;
      return { ...fb, section: null };
    }

    if (section === 'home' && isMale) {
      return { ...MALE_HOME, section };
    }

    return { ...SECTION_PALETTE[section], section };
  }, [override, pathname, userEmail, onboardingGender]);
}
