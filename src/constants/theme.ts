// ═══════════════════════════════════════════════════════════════════════════
// Pantone pastel palette (Cloud Dancer family)
// ═══════════════════════════════════════════════════════════════════════════

export const Colors = {
  // ── Pantone TCX pastel palette (approved) ───────────────────────────
  // Hex values match the official Pantone TCX standards (sRGB approximation).
  // Cloud Dancer is the canvas; the other 7 layer on for accents + CTAs.
  /** PANTONE 11-4201 TCX Cloud Dancer — shared cream background */
  cloudDancer: '#F0EEE9',
  /** PANTONE 11-0515 TCX Lemon Icing — shared warm highlight */
  lemonIcing: '#F4ECC2',
  /** PANTONE 13-1407 TCX Peach Dust — female pastel primary */
  peachDust: '#F0CFB1',
  /** Derived deeper peach for CTAs on white/cream bgs */
  peachDustDeep: '#E89672',
  /** Derived darker peach for strong contrast text */
  peachDustDarker: '#C76B45',
  /** PANTONE 12-2904 TCX Raindrops on Roses — female blush secondary */
  raindropsOnRoses: '#F2D8D5',
  /** PANTONE 13-3405 TCX Orchid Tint — female soft lavender accent */
  orchidTint: '#DBC6D8',
  /** PANTONE 13-4302 TCX Ice Melt — male pastel primary */
  iceMelt: '#D8E3E7',
  /** Derived deeper Ice Melt for male CTAs */
  iceMeltDeep: '#7FB3C2',
  /** Derived darker Ice Melt for strong contrast text */
  iceMeltDarker: '#5C92A3',
  /** PANTONE 12-5409 TCX Almost Aqua — male mint secondary */
  almostAqua: '#A4D9D1',
  /** PANTONE 14-4504 TCX Nimbus Cloud — male soft gray accent */
  nimbusCloud: '#D5D6D2',

  // ── Section accent derived shades (for useSectionAccent) ────────────
  /** Raindrops on Roses deep — Nutrition CTAs */
  raindropsDeep: '#D98C86',
  raindropsDarker: '#B06A66',
  /** Lemon Icing deep — Aimee CTAs */
  lemonDeep: '#C9A84A',
  lemonDarker: '#A08335',
  /** Almost Aqua deep — Workouts CTAs */
  almostAquaDeep: '#6FA891',
  almostAquaDarker: '#4E836D',
  /** Orchid Tint deep — Peptides CTAs */
  orchidDeep: '#9B86A4',
  orchidDarker: '#75627D',

  // ── Pro-tier "premium" accent — replaces the old gold gradient app-wide.
  // Light → deep light-blues, medical-feeling, harmonizes with iceMelt/powder.
  proBlueLight: '#BFDBF7',
  proBlue: '#7FB3D8',
  proBlueDeep: '#3E7CB1',
  proBlueDarker: '#2C5F8E',

  // ── Legacy named constants (repointed to new palette) ───────────────
  rose: '#e3a7a1',
  sage: '#b9cbb6',
  powder: '#c7d7e6',
  bone: '#f7f2ec',
  ink: '#1f2a36',

  // Derived
  roseDark: '#c98a84',
  roseLight: '#f0cbc7',
  sageDark: '#8faa8b',
  sageLight: '#d4e3d2',
  powderDark: '#a3bad2',
  powderLight: '#e0eaf3',

  // Base colors (Cloud Dancer cream now)
  darkBg: '#F0EEE9',
  darkCard: '#FFFFFF',
  darkCardBorder: 'rgba(0,0,0,0.08)',
  darkText: '#2D2D2D',
  darkTextSecondary: '#6B7280',

  // Light mode (same as base — no dark mode)
  lightBg: '#F0EEE9',
  lightCard: '#FFFFFF',
  lightCardBorder: 'rgba(0,0,0,0.06)',
  lightText: '#2D2D2D',
  lightTextSecondary: '#6B7280',

  // Utility
  white: '#ffffff',
  black: '#000000',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',

  // Glass (light mode)
  glassWhite: 'rgba(0,0,0,0.04)',
  glassBorder: 'rgba(0,0,0,0.08)',

  // ── PepTalk Brand Palette (legacy names, repointed to Pantone values) ─
  // NOTE: These names are preserved for back-compat with the 40+ files
  // that import them. Values now point at the new Pantone palette.
  pepBlue: '#7FB3C2',         // Ice Melt Deep (male primary)
  pepBlueDark: '#5C92A3',     // Ice Melt Darker
  pepBlueLight: '#D8E3E7',    // Ice Melt
  pepTeal: '#E89672',         // Peach Dust Deep (female primary)
  pepTealLight: '#F0CFB1',    // Peach Dust
  pepCyan: '#F4ECC2',         // Lemon Icing (shared highlight)

  // Glow
  glowBlue: 'rgba(127, 179, 194, 0.25)',   // Ice Melt Deep
  glowTeal: 'rgba(232, 150, 114, 0.25)',    // Peach Dust Deep
  glowRose: 'rgba(243, 217, 216, 0.30)',    // Raindrops on Roses

  // Glass accent
  glassBlue: 'rgba(232, 150, 114, 0.10)',
  glassBlueBorder: 'rgba(232, 150, 114, 0.20)',
} as const;

export const Gradients = {
  primary: ['#E89672', '#F2C7A9'] as const,              // Peach Dust Deep → Peach Dust
  character: ['#E89672', '#F4E9A7'] as const,            // Peach Dust Deep → Lemon Icing
  card: ['rgba(232,150,114,0.12)', 'rgba(243,217,216,0.06)'] as const,
  accent: ['#E89672', '#F4E9A7'] as const,               // Peach Dust Deep → Lemon Icing
  warm: ['#E89672', '#F5DAD6'] as const,                 // Peach Dust Deep → Raindrops on Roses
  male: ['#7FB3C2', '#CADEE5'] as const,                 // Ice Melt Deep → Ice Melt
  maleAccent: ['#7FB3C2', '#BADDCB'] as const,           // Ice Melt Deep → Almost Aqua
};

export const CategoryColors: Record<string, string> = {
  Metabolic: '#e3a7a1',
  Recovery: '#b9cbb6',
  'Growth Hormone': '#c7d7e6',
  Nootropic: '#d4b8e0',
  Immune: '#f0d68a',
  'Anti-inflammatory': '#a8d8ea',
  Mitochondrial: '#f5c6aa',
  Longevity: '#c5b3e6',
  Sleep: '#7eb5d6',
  Reproductive: '#f0b4c8',
  'Sexual Health': '#e8a0b8',
  Cosmetic: '#d4c5a9',
  Tanning: '#e8c49a',
  Neuropeptide: '#b8c9e0',
  Antimicrobial: '#a0d2db',
};

export const Fonts = {
  // Display / Editorial — Playfair Display (Jamie's magazine aesthetic)
  display: 'Playfair-Bold',
  displayBold: 'Playfair-ExtraBold',
  displayBlack: 'Playfair-Black',
  // Body — DM Sans (clean, modern, Sprinter-like)
  body: 'DMSans-Regular',
  bodyMedium: 'DMSans-Medium',
  bodySemiBold: 'DMSans-SemiBold',
  bodyBold: 'DMSans-Bold',
  // Aliases for backward compat
  heading: 'Playfair-ExtraBold',
  headingBold: 'Playfair-Black',
  headingItalic: 'Playfair-Bold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  hero: 36,
} as const;
