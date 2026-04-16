/**
 * useTheme — returns the resolved color palette based on gender.
 *
 * Jamie's vision: WHITE CLEAN LOOK with accent color pops.
 * - Women: warm peachy/blush/golden tones (Mango palette)
 * - Men: cool sky blue/amber/slate tones
 * - Both share the same white/neutral base
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
}

// ── Jamie's palettes ────────────────────────────────────────────────────────

const femaleAccents = {
  primary: '#F8A97A',       // Peachy Glow
  primaryLight: '#FCCBA8',
  primaryDark: '#E8885A',
  secondary: '#F2B6B1',     // Blush Petal
  accent: '#F4E285',        // Golden Dew
  surfaceTint: '#FDF8F5',   // Warm cream
  tabActive: '#F8A97A',
  ctaGradient: ['#F8A97A', '#F2B6B1'] as const,
};

const maleAccents = {
  primary: '#6B2D3E',       // Deep Burgundy / Wine
  primaryLight: '#8A4A5A',
  primaryDark: '#4E1F2D',
  secondary: '#3D5A3E',     // Dark Olive / Forest Green
  accent: '#4A4A4F',        // Charcoal / Graphite
  surfaceTint: '#F0EAE0',   // Cloud Dancer (Pantone 2026)
  tabActive: '#6B2D3E',
  ctaGradient: ['#6B2D3E', '#3D5A3E'] as const,
};

// ── Build theme by gender ───────────────────────────────────────────────────

function buildTheme(gender: 'male' | 'female'): ThemeColors {
  const a = gender === 'female' ? femaleAccents : maleAccents;
  return {
    isDark: false,
    gender,
    bg: gender === 'female' ? '#FFFFFF' : '#F0EAE0',
    card: gender === 'female' ? '#FFFFFF' : '#F7F3ED',
    cardBorder: gender === 'female' ? '#F0EBE6' : '#E0D8CE',
    tabBar: gender === 'female' ? '#FFFFFF' : '#F0EAE0',
    surface: a.surfaceTint,

    text: '#2D2D2D',
    textSecondary: '#6B7280',  // 5.0:1 on white (AA)
    textMuted: '#9CA3AF',      // 3.3:1 on white (AA Large)

    glass: gender === 'female' ? 'rgba(255,255,255,0.85)' : 'rgba(240,234,224,0.88)',
    glassBorder: gender === 'female' ? 'rgba(248,169,122,0.15)' : 'rgba(107,45,62,0.15)',
    glassElevated: gender === 'female' ? 'rgba(255,255,255,0.95)' : 'rgba(247,243,237,0.95)',
    glassElevatedBorder: gender === 'female' ? 'rgba(248,169,122,0.20)' : 'rgba(107,45,62,0.20)',
    glassAccent: gender === 'female' ? 'rgba(248,169,122,0.12)' : 'rgba(107,45,62,0.12)',
    glassAccentBorder: gender === 'female' ? 'rgba(248,169,122,0.25)' : 'rgba(107,45,62,0.25)',

    statusBar: 'dark',
    headerTint: '#2D2D2D',

    inputBg: a.surfaceTint,
    inputBorder: gender === 'female' ? '#F0EBE6' : '#E0D8CE',
    placeholder: '#9CA3AF',  // 3.3:1 minimum contrast

    splashGradient: ['#FFFFFF', a.surfaceTint, '#FFFFFF'],

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
