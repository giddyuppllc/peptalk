/**
 * useTheme — returns the resolved color palette based on gender.
 *
 * Pantone Cloud Dancer palette, split by temperature:
 *   - Both: Cloud Dancer (#EDE6D6) cream background
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
  /** Soft lavender accent — Orchid Tint (female) or Nimbus Cloud (male) */
  orchid: string;
  /** Secondary soft accent — Raindrops on Roses (female) or Almost Aqua (male) */
  blush: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pantone palette constants
// ═══════════════════════════════════════════════════════════════════════════

// Shared
const CLOUD_DANCER = '#EDE6D6';       // 11-4201 — main bg
const LEMON_ICING = '#F4E9A7';        // 11-0515 — shared warm highlight

// Female (warm)
const PEACH_DUST = '#F2C7A9';         // 12-1107 — female surface/pastel
const PEACH_DUST_DEEP = '#E89672';    // Derived darker for CTAs
const PEACH_DUST_DARKER = '#C76B45';  // Derived darker still, strong contrast
const RAINDROPS_ON_ROSES = '#F5DAD6'; // 11-1400 — female blush secondary
const ORCHID_TINT = '#D4CBD2';        // 13-3802 — female soft lavender accent
const CREAM_WARM = '#FAF5EF';         // Warmer Cloud Dancer for female surface band
const BORDER_WARM = '#EAE4DC';        // Soft beige border

// Male (cool)
const ICE_MELT = '#CADEE5';           // 13-4306 — male pastel blue
const ICE_MELT_DEEP = '#7FB3C2';      // Derived darker for CTAs
const ICE_MELT_DARKER = '#5C92A3';    // Derived darker still
const ALMOST_AQUA = '#BADDCB';        // 13-6006 — male mint secondary
const NIMBUS_CLOUD = '#D0D3D4';       // 13-4108 — male soft gray accent
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
  orchid: NIMBUS_CLOUD,         // Male uses pale gray as the "orchid slot"
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
