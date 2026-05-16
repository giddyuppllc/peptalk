/**
 * useTheme — returns the resolved color palette based on gender.
 *
 * Pantone Cloud Dancer palette, split by temperature:
 *   - Both: Cloud Dancer (#F0EEE9) cream background
 *   - Women (warm): Peach Dust, Raindrops on Roses, Orchid Tint, Lemon Icing
 *   - Men (cool):   Ice Melt, Almost Aqua, Nimbus Cloud, Lemon Icing (shared)
 *
 * CTAs use derived deeper shades of each pastel for accessibility.
 */

import { useOnboardingStore } from '../store/useOnboardingStore';
import { useAuthStore } from '../store/useAuthStore';
import { getTestProfile } from '../constants/testProfiles';

export interface ThemeColors {
  isDark: false;
  gender: 'male' | 'female';

  // Backgrounds
  bg: string;
  card: string;
  cardBorder: string;
  tabBar: string;
  surface: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Glass
  glass: string;
  glassBorder: string;
  glassElevated: string;
  glassElevatedBorder: string;
  glassAccent: string;
  glassAccentBorder: string;

  // Status bar
  statusBar: 'dark';
  headerTint: string;

  // Input
  inputBg: string;
  inputBorder: string;
  placeholder: string;

  // Gradients
  splashGradient: readonly [string, string, string];

  // Interactive
  icon: string;
  tint: string;

  // Shadows
  shadow: string;
  shadowOpacity: number;

  // ── Gender accent colors ──────────────────────────────────────────────
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  surfaceTint: string;
  tabActive: string;
  ctaGradient: readonly [string, string];

  // ── New Pantone pastel tokens ─────────────────────────────────────────
  /** Soft warm highlight — Lemon Icing on both genders */
  accentSoft: string;
  /** Soft lavender accent — Orchid Tint (shared across genders) */
  orchid: string;
  /** Deeper lavender — used as the mid-stop on greeting gradients */
  orchidDeep: string;
  /** Secondary soft accent — Raindrops on Roses (female) or Almost Aqua (male) */
  blush: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pantone palette constants
// ═══════════════════════════════════════════════════════════════════════════

// Shared
const CLOUD_DANCER = '#F0EEE9';       // 11-4201 TCX — main bg
const LEMON_ICING = '#F4ECC2';        // 11-0515 TCX — shared warm highlight

// Female (warm)
const PEACH_DUST = '#F0CFB1';         // 13-1407 TCX — female surface/pastel
const PEACH_DUST_DEEP = '#E89672';    // Derived darker for CTAs
const PEACH_DUST_DARKER = '#C76B45';  // Derived darker still, strong contrast
const RAINDROPS_ON_ROSES = '#F2D8D5'; // 12-2904 TCX — female blush secondary
// "orchid" tokens kept by name for back-compat across the app — values
// swapped 2026-05-16 from lavender to teal per Jamie. Every component that
// uses `t.orchid` / `t.orchidDeep` (the home hero gradient is the big one)
// now renders teal. Rename the constants when we do a full theme audit.
const ORCHID_TINT = '#B5DDD8';        // Soft sea-glass teal (was lavender #DBC6D8)
const ORCHID_DEEP = '#5BA9A7';        // Deeper teal for ombré mid-stops (was #9B86A4)
const CREAM_WARM = '#FAF5EF';         // Warmer Cloud Dancer for female surface band
const BORDER_WARM = '#EAE4DC';        // Soft beige border

// Male (cool)
const ICE_MELT = '#D8E3E7';           // 13-4302 TCX — male pastel blue
const ICE_MELT_DEEP = '#7FB3C2';      // Derived darker for CTAs
const ICE_MELT_DARKER = '#5C92A3';    // Derived darker still
const ALMOST_AQUA = '#A4D9D1';        // 12-5409 TCX — male mint secondary
const NIMBUS_CLOUD = '#D5D6D2';       // 14-4504 TCX — male soft gray accent
const CREAM_COOL = '#F3F5F2';         // Cooler Cloud Dancer for male surface band
const BORDER_COOL = '#E0E4E1';        // Soft gray border

// ── Palettes ────────────────────────────────────────────────────────────────

const femaleAccents = {
  primary: PEACH_DUST_DEEP,     // Derived deeper peach for CTAs + tabs
  primaryLight: PEACH_DUST,     // True Peach Dust for pastel accents
  primaryDark: PEACH_DUST_DARKER,
  secondary: RAINDROPS_ON_ROSES,
  accent: LEMON_ICING,
  surfaceTint: CREAM_WARM,
  tabActive: PEACH_DUST_DEEP,
  ctaGradient: [PEACH_DUST_DEEP, PEACH_DUST] as const,
  accentSoft: LEMON_ICING,
  orchid: ORCHID_TINT,
  orchidDeep: ORCHID_DEEP,
  blush: RAINDROPS_ON_ROSES,
};

const maleAccents = {
  primary: ICE_MELT_DEEP,       // Derived deeper Ice Melt for CTAs
  primaryLight: ICE_MELT,
  primaryDark: ICE_MELT_DARKER,
  secondary: ALMOST_AQUA,
  accent: LEMON_ICING,          // Shared warm highlight
  surfaceTint: CREAM_COOL,
  tabActive: ICE_MELT_DEEP,
  ctaGradient: [ICE_MELT_DEEP, ICE_MELT] as const,
  accentSoft: LEMON_ICING,
  // Orchid is now shared — the "Good afternoon" greeting on home renders
  // a lavender ombré on every profile, not gendered. (Per Edward 2026-05-09.)
  orchid: ORCHID_TINT,
  orchidDeep: ORCHID_DEEP,
  blush: ALMOST_AQUA,           // Male uses mint as the "blush slot"
};

// ── Build theme by gender ───────────────────────────────────────────────────

function buildTheme(gender: 'male' | 'female'): ThemeColors {
  const a = gender === 'female' ? femaleAccents : maleAccents;
  const cardBorder = gender === 'female' ? BORDER_WARM : BORDER_COOL;
  const primaryRgbaGlass =
    gender === 'female'
      ? 'rgba(232, 150, 114, 0.15)' // PEACH_DUST_DEEP
      : 'rgba(127, 179, 194, 0.15)'; // ICE_MELT_DEEP
  const primaryRgbaGlassElevated =
    gender === 'female' ? 'rgba(232, 150, 114, 0.20)' : 'rgba(127, 179, 194, 0.20)';
  const primaryRgbaGlassAccent =
    gender === 'female' ? 'rgba(232, 150, 114, 0.12)' : 'rgba(127, 179, 194, 0.12)';
  const primaryRgbaGlassAccentBorder =
    gender === 'female' ? 'rgba(232, 150, 114, 0.25)' : 'rgba(127, 179, 194, 0.25)';

  return {
    isDark: false,
    gender,
    bg: CLOUD_DANCER,
    card: '#FFFFFF',
    cardBorder,
    tabBar: CLOUD_DANCER,
    surface: a.surfaceTint,

    text: '#2D2D2D',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',

    glass: 'rgba(255,255,255,0.85)',
    glassBorder: primaryRgbaGlass,
    glassElevated: 'rgba(255,255,255,0.95)',
    glassElevatedBorder: primaryRgbaGlassElevated,
    glassAccent: primaryRgbaGlassAccent,
    glassAccentBorder: primaryRgbaGlassAccentBorder,

    statusBar: 'dark',
    headerTint: '#2D2D2D',

    inputBg: a.surfaceTint,
    inputBorder: cardBorder,
    placeholder: '#9CA3AF',

    splashGradient: [CLOUD_DANCER, a.blush, CLOUD_DANCER],

    icon: '#6B7280',
    tint: a.primary,

    shadow: '#000',
    shadowOpacity: 0.06,

    ...a,
  };
}

// ── Cached themes ───────────────────────────────────────────────────────────

const maleTheme = buildTheme('male');
const femaleTheme = buildTheme('female');

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeColors {
  const userEmail = useAuthStore((s) => s.user?.email);
  const onboardingGender = useOnboardingStore((s) => s.profile.gender);
  const testProfile = userEmail ? getTestProfile(userEmail) : null;
  const rawGender = testProfile?.gender ?? onboardingGender;
  const gender: 'male' | 'female' = rawGender === 'Female' ? 'female' : 'male';

  return gender === 'female' ? femaleTheme : maleTheme;
}

/** Non-hook version */
export function getThemeColors(gender: 'male' | 'female' = 'male'): ThemeColors {
  return gender === 'female' ? femaleTheme : maleTheme;
}
