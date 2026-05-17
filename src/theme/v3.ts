/**
 * v3 Design System Tokens — locked per Master Refactor Plan v3.1 (§3).
 *
 * Two complete palettes (female default + male dark variant) plus shared
 * typography, spacing, radius, shadow, and motion tokens.
 *
 * Female default = SBB Peptides aesthetic. Male variant = charcoal /
 * cognac / oxblood (Casino Royale, no gold). Same structural component
 * primitives consume either palette — Phase C ships the male render.
 *
 * No orange anywhere. No gold on male side. No pure black.
 */

// ── Female palette (SBB Peptides match) ─────────────────────────────
const FEMALE_COLORS = {
  bgBase1: '#EFE6F0',                          // top of pastel gradient
  bgBase2: '#DDEEE4',                          // bottom of pastel gradient
  bgOrbRose: 'rgba(229,146,141,0.35)',         // top-left radial orb
  bgOrbBlue: 'rgba(184,212,232,0.45)',         // top-right radial orb
  bgOrbMint: 'rgba(199,231,212,0.55)',         // bottom radial orb

  cardBg: 'rgba(255,255,255,0.72)',            // glass fill + backdrop-blur 20
  cardBorder: 'rgba(255,255,255,0.9)',
  cardTopHighlight: 'rgba(255,255,255,0.95)',  // inset top hairline

  textPrimary: '#2A1A4F',                      // deep plum-navy
  textSecondary: '#6B5985',

  accentRose: '#E5928D',                       // primary, protein ring, FAB gradient
  accentMint: '#C7E7D4',                       // secondary, exercise ring
  accentLavender: '#D4C8E8',                   // syringe plunger, secondary
  accentBabyBlue: '#B8D4E8',                   // today pill, sleep accent

  reportRibbonStart: '#E5928D',                // rose
  reportRibbonEnd: '#D4C8E8',                  // lavender

  fabGradientStart: '#E5928D',
  fabGradientEnd: '#D4C8E8',

  // Semantic — shared meaning across both palettes. Severity ramps,
  // delta direction (gain vs loss), and interaction tints all draw
  // from here so consumers never hardcode hex.
  divider: 'rgba(42,26,79,0.10)',              // matches plum-navy text
  semanticDanger: '#D43A3A',                   // hard warnings only
  semanticCaution: '#D9B65A',                  // soft amber, mid severity
  semanticPositive: '#6FA891',                 // loss, success, calm
  semanticNeutral: '#9AA3B5',                  // no-op / undocumented
  semanticWarn: '#D08850',                     // friction / unwanted gain
  severity1: '#6FA891',                        // mild → severe ramp
  severity2: '#9FB16E',
  severity3: '#D9B65A',
  severity4: '#D08850',
  severity5: '#D43A3A',
} as const;

// ── Male palette (charcoal / cognac / oxblood) ──────────────────────
const MALE_COLORS = {
  bgBase1: '#1B1C1F',                          // top of charcoal gradient
  bgBase2: '#131416',                          // bottom of charcoal gradient
  bgPaneling: 'rgba(255,255,255,0.012)',       // 38px stripes overlay
  bgGlowCognac: 'rgba(92,58,33,0.22)',         // top-right radial glow
  bgGlowOxblood: 'rgba(139,26,36,0.15)',       // bottom-left radial glow

  cardBg: 'rgba(38,40,44,0.78)',               // dark glass + backdrop-blur 20
  cardBorder: 'rgba(241,236,228,0.08)',
  cardTopHairlineStart: 'rgba(201,136,90,0.40)',
  cardTopHairlineEnd: 'rgba(201,136,90,0.00)',

  textPrimary: '#F1ECE4',                      // bone
  textSecondary: 'rgba(241,236,228,0.65)',

  accentCognac: '#C9885A',                     // primary focal (numerals, serif, ring outer)
  accentCognacDeep: '#5C3A21',                 // carbs bar, syringe plunger cap
  accentOxblood: '#8B1A24',                    // today pill, FAB, ring middle
  accentOxbloodDeep: '#5C0E15',                // gradient pair for oxblood
  accentTungsten: '#3E4147',                   // fat bar
  accentTungstenLight: '#7A7E86',              // ring inner (stand-equivalent)

  reportRibbonStart: '#8B1A24',                // oxblood
  reportRibbonEnd: '#5C0E15',

  fabGradientStart: '#8B1A24',
  fabGradientEnd: '#C9885A',

  // Semantic — same meaning as the female palette, slightly desaturated
  // for the dark backdrop. Severity / delta direction / interaction
  // tints draw from these tokens.
  divider: 'rgba(241,236,228,0.10)',           // matches bone text
  semanticDanger: '#D43A3A',                   // hard warnings only
  semanticCaution: '#C9A35A',                  // muted amber on dark
  semanticPositive: '#7AAA94',                 // loss, success, calm
  semanticNeutral: '#8A93A6',                  // no-op / undocumented
  semanticWarn: '#B97A48',                     // friction / unwanted gain
  severity1: '#7AAA94',                        // mild → severe ramp
  severity2: '#9AA875',
  severity3: '#C9A35A',
  severity4: '#B97A48',
  severity5: '#D43A3A',
} as const;

// ── Shared tokens ───────────────────────────────────────────────────
const TYPOGRAPHY = {
  headlineFemale: 'Playfair-Bold',
  headlineMale: 'Newsreader-SemiBold',
  numeralsFemale: 'Playfair-Bold',
  numeralsMale: 'Newsreader-SemiBold',
  body: 'DMSans-Regular',
  bodyMedium: 'DMSans-Medium',
  bodyBold: 'DMSans-Bold',
  label: 'DMSans-SemiBold',
} as const;

const SPACING = {
  phonePaddingTop: 60,
  phonePaddingSides: 20,
  phonePaddingBottom: 30,
  cardPadding: 18,
  cardGap: 14,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const RADIUS = {
  card: 24,
  chip: 12,
  pill: 14,
  fab: 28, // half of 56
  full: 9999,
} as const;

const SHADOWS = {
  cardLight: {
    shadowColor: '#2A1A4F',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardDark: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

const MOTION = {
  cardPress: { mass: 1, stiffness: 300, damping: 22 },
  cardMountDelay: 60,    // stagger ms
  cardMountDuration: 320,
  orbPulseDurationFemale: 4000,
  orbPulseDurationMale: 5000,
  fabRippleDuration: 240,
} as const;

const BLUR = 20;

// ── Public theme ────────────────────────────────────────────────────
export interface V3Variant {
  variant: 'female' | 'male';
  colors:
    | typeof FEMALE_COLORS & { __female?: true }
    | typeof MALE_COLORS & { __male?: true };
  typography: typeof TYPOGRAPHY;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  shadows: typeof SHADOWS;
  motion: typeof MOTION;
  blur: number;
  /** True when the dark palette is active — components key dark-only
   *  treatments off this (e.g. cognac top hairline on cards). */
  isDark: boolean;
}

export const v3Female: V3Variant = {
  variant: 'female',
  colors: FEMALE_COLORS,
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  motion: MOTION,
  blur: BLUR,
  isDark: false,
};

export const v3Male: V3Variant = {
  variant: 'male',
  colors: MALE_COLORS,
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  motion: MOTION,
  blur: BLUR,
  isDark: true,
};

export type V3Theme = V3Variant;

/** Convenience union of every color key actually used — handy for tools. */
export type FemaleColorKey = keyof typeof FEMALE_COLORS;
export type MaleColorKey = keyof typeof MALE_COLORS;
