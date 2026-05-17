/**
 * Drop-in bridge: returns the v2 `ThemeColors` shape but every visible
 * color is sourced from the v3 palette (`useV3Theme`).
 *
 * Why this exists: `app/(tabs)/peptalk.tsx` is ~1000 LOC of v2-shaped
 * JSX (`{ color: t.text }`, `t.bg`, `t.cardBorder`, `t.surface`, etc.).
 * A full token-by-token rewrite is high-risk on the highest-traffic
 * surface (Aimee chat). This shim preserves every existing reference
 * site while shifting the underlying values to v3 — fixing the audit
 * complaint without touching the JSX.
 *
 * Same API as `useTheme()`. Drop in: `const t = useV3BridgeTheme();`
 *
 * v3 → v2 mapping rationale:
 *   bg            ← v3.colors.bgBase1
 *   text          ← v3.colors.textPrimary
 *   textSecondary ← v3.colors.textSecondary
 *   cardBorder    ← v3.colors.divider
 *   primary       ← v3.colors.accentRose / accentCognac (theme-aware)
 *   surface       ← v3.colors.bgBase2
 *   tint          ← matches primary
 *
 * The orchid / blush / etc. tokens that the old palette exposed
 * fall back to v3 accent colors so consumers don't break. We don't
 * try to reproduce the exact v2 ombré gradients — they were tied to
 * the v2 male/female palette anyway, and v3 supplies its own.
 */

import { useV3Theme } from '../theme/V3ThemeProvider';
import type { ThemeColors } from './useTheme';

export function useV3BridgeTheme(): ThemeColors {
  const v3 = useV3Theme();
  const c = v3.colors as any;

  const primary = (v3.isDark ? c.accentCognac : c.accentRose) as string;
  const primaryLight = (v3.isDark ? c.accentTungstenLight : c.accentRoseLight) as string;
  const primaryDark = (v3.isDark ? c.accentOxblood : c.accentRoseDeep) as string;
  const accent = (c.accentBabyBlue ?? c.semanticPositive) as string;
  const blush = (v3.isDark ? c.accentCognac : c.accentRose) as string;
  const surface = (c.bgBase2 ?? c.bgBase1) as string;
  const cardBorder = (c.divider ?? 'rgba(0,0,0,0.08)') as string;
  const bg = c.bgBase1 as string;
  const textPrimary = c.textPrimary as string;
  const textSecondary = c.textSecondary as string;

  return {
    isDark: false,
    gender: v3.isDark ? 'male' : 'female',
    bg,
    card: surface,
    cardBorder,
    tabBar: bg,
    surface,
    text: textPrimary,
    textSecondary,
    textMuted: textSecondary,
    glass: 'rgba(255,255,255,0.85)',
    glassBorder: cardBorder,
    glassElevated: 'rgba(255,255,255,0.92)',
    glassElevatedBorder: cardBorder,
    glassAccent: `${primary}1F`,
    glassAccentBorder: `${primary}3D`,
    statusBar: 'dark',
    headerTint: textPrimary,
    inputBg: surface,
    inputBorder: cardBorder,
    placeholder: textSecondary,
    splashGradient: [bg, blush, bg],
    icon: textSecondary,
    tint: primary,
    shadow: '#000',
    shadowOpacity: 0.06,
    primary,
    primaryLight,
    primaryDark,
    secondary: blush,
    accent,
    surfaceTint: surface,
    tabActive: primary,
    ctaGradient: [primary, primaryLight] as const,
    accentSoft: accent,
    orchid: blush,
    orchidDeep: primary,
    blush,
  };
}
