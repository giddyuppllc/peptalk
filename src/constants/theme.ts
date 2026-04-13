export const Colors = {
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

  // Base colors (white-first design — Jamie's vision)
  darkBg: '#FFFFFF',
  darkCard: '#FFFFFF',
  darkCardBorder: 'rgba(0,0,0,0.08)',
  darkText: '#2D2D2D',
  darkTextSecondary: '#6B7280',

  // Light mode (same as base — no dark mode)
  lightBg: '#FFFFFF',
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

  // PepTalk Brand Palette
  pepBlue: '#5B8DB8',
  pepBlueDark: '#3D7099',
  pepBlueLight: '#8BB5D5',
  pepTeal: '#F8A97A',
  pepTealLight: '#FCCBA8',
  pepCyan: '#FFBF82',

  // Glow
  glowBlue: 'rgba(91, 141, 184, 0.25)',
  glowTeal: 'rgba(248, 169, 122, 0.25)',
  glowRose: 'rgba(242, 182, 177, 0.30)',

  // Glass accent
  glassBlue: 'rgba(248, 169, 122, 0.10)',
  glassBlueBorder: 'rgba(248, 169, 122, 0.20)',
} as const;

export const Gradients = {
  primary: ['#F8A97A', '#F2B6B1'] as const,
  character: ['#F8A97A', '#FFBF82'] as const,
  card: ['rgba(248,169,122,0.12)', 'rgba(242,182,177,0.06)'] as const,
  accent: ['#F8A97A', '#F4E285'] as const,
  warm: ['#F8A97A', '#F2B6B1'] as const,
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
