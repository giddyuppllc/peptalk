/**
 * Section palette — maps each tab section to its Pantone pastel + derived shades.
 *
 * Used by `useSectionAccent()` to give each tab its own color identity while
 * keeping the Cloud Dancer cream background and white cards unchanged.
 *
 * Home is the only section that differs by gender (Peach Dust for female,
 * Ice Melt for male). All other sections share the same palette across genders.
 */

export type AppSection = 'home' | 'nutrition' | 'aimee' | 'workouts' | 'peptides';

export interface SectionColors {
  /** Soft pastel base — Pantone-accurate */
  pastel: string;
  /** Derived deeper shade for CTAs / buttons / tab indicator */
  deep: string;
  /** Derived darker still — pressed state / strong contrast text */
  darker: string;
}

export const SECTION_PALETTE: Record<AppSection, SectionColors> = {
  home: {
    pastel: '#F0CFB1',
    deep: '#E89672',
    darker: '#C76B45',
  },
  nutrition: {
    pastel: '#A4D9D1',
    deep: '#6FA891',
    darker: '#4E836D',
  },
  aimee: {
    pastel: '#DBC6D8',
    deep: '#9B86A4',
    darker: '#75627D',
  },
  workouts: {
    pastel: '#F2D8D5',
    deep: '#D98C86',
    darker: '#B06A66',
  },
  peptides: {
    pastel: '#D8E3E7',
    deep: '#7ABED0',
    darker: '#5A9BB0',
  },
};

/** Male-specific override for Home only. */
export const MALE_HOME: SectionColors = {
  pastel: '#D8E3E7',
  deep: '#7FB3C2',
  darker: '#5C92A3',
};

/** Global fallback used for non-tab routes (auth, onboarding, modals). */
export const FEMALE_FALLBACK: SectionColors = SECTION_PALETTE.home;
export const MALE_FALLBACK: SectionColors = MALE_HOME;

/**
 * Resolve an `AppSection` from a pathname.
 * Returns null for non-tab routes — caller should use the global fallback.
 */
export function resolveSectionFromPath(pathname: string | null | undefined): AppSection | null {
  if (!pathname) return null;
  const p = pathname.toLowerCase();

  // Peptide detail pages inherit the Peptides section for lineage
  if (p.startsWith('/peptide/')) return 'peptides';

  // Tab routes
  if (p === '/' || p === '/index' || p.startsWith('/(tabs)') && (p.endsWith('/index') || p === '/(tabs)')) {
    return 'home';
  }
  if (p.includes('/nutrition')) return 'nutrition';
  if (p.includes('/peptalk') || p.includes('/aimee')) return 'aimee';
  if (p.includes('/workouts')) return 'workouts';
  if (p.includes('/my-stacks') || p.includes('/peptides') || p.includes('/stack-builder')) return 'peptides';

  return null;
}
