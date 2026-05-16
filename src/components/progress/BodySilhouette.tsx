/**
 * BodySilhouette — abstract 2D SVG body outline used as the visual
 * hero on the Home BodyCompositionHero card.
 *
 * Renders nine separable region paths (head, chest, abs, two arms,
 * two thighs, two calves) so callers can color-fill regions
 * individually. When `segmental` lean-mass data is supplied (lbs per
 * region from an InBody scan) each region's fill alpha is derived
 * from its share of the total — a clean visual cue that "your right
 * arm is carrying 10.4 lb of lean tissue, here's what that looks
 * like." When `segmental` is absent we fall back to a thin grey
 * outline so the silhouette never looks broken.
 *
 * Aesthetic target: Apple Fitness — geometric, minimal, NOT a
 * photo-realistic body. Proportions are loosely anatomical (head ≈
 * 1/8 of total height, shoulders ~2× head width, hips ~1.6× head).
 *
 * Pure presentation. No store reads.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface BodySilhouetteSegmental {
  /** Lean mass in lbs for the right arm. */
  rightArm?: number;
  /** Lean mass in lbs for the left arm. */
  leftArm?: number;
  /** Lean mass in lbs for the trunk (chest + abs). */
  trunk?: number;
  /** Lean mass in lbs for the right leg (thigh + calf). */
  rightLeg?: number;
  /** Lean mass in lbs for the left leg (thigh + calf). */
  leftLeg?: number;
}

export interface BodySilhouetteProps {
  /** Render width in px. */
  width: number;
  /** Render height in px. */
  height: number;
  /** Optional segmental lean-mass distribution (lbs per region). When
   *  absent the silhouette renders as a thin outline only. */
  segmental?: BodySilhouetteSegmental;
  /** Base accent color to tint regions. */
  accentColor: string;
  /** Outline stroke color. Defaults to white at 60% opacity, matching
   *  the existing gradient hero card. */
  outlineColor?: string;
  /** Disable the on-mount fill animation (e.g. snapshot tests). */
  animate?: boolean;
}

// ─── Region path data ──────────────────────────────────────────────
// Drawn against a 100×220 viewBox. Front view only. Symmetrical about
// x=50. Coordinates derived from an idealized 8-head-tall athletic
// figure; intentionally geometric, NOT anatomical.

const VB_W = 100;
const VB_H = 220;

const PATHS = {
  // Head — oval centered at (50, 18), ~14 wide, ~24 tall.
  head: 'M 50 4 C 58 4 64 10 64 18 C 64 26 58 32 50 32 C 42 32 36 26 36 18 C 36 10 42 4 50 4 Z',

  // Chest / shoulders — broad upper torso block tapering to waist.
  // Shoulders at y≈40, ribcage bottom at y≈85.
  chest:
    'M 50 34 L 62 38 L 76 46 L 78 60 L 76 80 L 70 88 L 50 90 L 30 88 L 24 80 L 22 60 L 24 46 L 38 38 Z',

  // Abs — narrow midsection from ribcage to hip.
  abs: 'M 30 88 L 70 88 L 72 110 L 70 128 L 50 130 L 30 128 L 28 110 Z',

  // Right arm (viewer-left, anatomical right). Upper arm + forearm
  // collapsed into a single tapered path hanging at the side.
  rightArm:
    'M 22 50 L 18 56 L 14 78 L 12 102 L 14 124 L 18 130 L 24 128 L 24 108 L 26 82 L 26 60 Z',

  // Left arm (viewer-right, anatomical left).
  leftArm:
    'M 78 50 L 82 56 L 86 78 L 88 102 L 86 124 L 82 130 L 76 128 L 76 108 L 74 82 L 74 60 Z',

  // Right thigh — hip to knee, viewer-left.
  rightThigh:
    'M 30 130 L 48 130 L 48 158 L 46 178 L 32 178 L 28 158 Z',

  // Left thigh — hip to knee, viewer-right.
  leftThigh:
    'M 52 130 L 70 130 L 72 158 L 68 178 L 54 178 L 52 158 Z',

  // Right calf — knee to ankle, viewer-left.
  rightCalf:
    'M 32 178 L 46 178 L 46 200 L 42 214 L 34 214 L 30 200 Z',

  // Left calf — knee to ankle, viewer-right.
  leftCalf:
    'M 54 178 L 68 178 L 70 200 L 66 214 L 58 214 L 54 200 Z',
} as const;

type RegionKey = keyof typeof PATHS;

/** Convert a hex color to an rgba() string at the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  // Accept #rgb, #rrggbb, or any rgb/rgba string by returning a safe
  // fallback. Most callers pass theme accent colors as #RRGGBB.
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Non-hex input — assume caller knows what they're doing.
  return hex;
}

/** Map segmental lean-mass to per-region fill alphas in [0, 1]. The
 *  region with the highest lean mass gets `maxAlpha`; the lowest
 *  non-zero region gets `minAlpha`. Missing regions get 0 (outline
 *  only). Trunk is split across chest + abs; each leg is split across
 *  thigh + calf. */
function regionAlphas(
  segmental: BodySilhouetteSegmental | undefined,
  minAlpha = 0.32,
  maxAlpha = 0.92,
): Record<RegionKey, number> {
  // Default: no data → all zero (outline only).
  const out: Record<RegionKey, number> = {
    head: 0,
    chest: 0,
    abs: 0,
    rightArm: 0,
    leftArm: 0,
    rightThigh: 0,
    leftThigh: 0,
    rightCalf: 0,
    leftCalf: 0,
  };

  if (!segmental) return out;

  // Per-region mass values (head is decorative — never tinted from data).
  const regionMass: Partial<Record<RegionKey, number>> = {
    rightArm: segmental.rightArm,
    leftArm: segmental.leftArm,
    chest: segmental.trunk,
    abs: segmental.trunk,
    rightThigh: segmental.rightLeg,
    rightCalf: segmental.rightLeg,
    leftThigh: segmental.leftLeg,
    leftCalf: segmental.leftLeg,
  };

  // Find min + max of supplied values to normalize.
  const values = Object.values(regionMass).filter(
    (v): v is number => typeof v === 'number' && v > 0,
  );
  if (values.length === 0) return out;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;

  (Object.keys(regionMass) as RegionKey[]).forEach((key) => {
    const v = regionMass[key];
    if (typeof v !== 'number' || v <= 0) return;
    // Normalize. When all values are equal, give them the midpoint.
    const t = span > 0 ? (v - lo) / span : 0.5;
    out[key] = minAlpha + t * (maxAlpha - minAlpha);
  });

  // Head — decorative neutral fill (so it doesn't look hollow). Tied
  // to the average so it tracks the body's overall saturation.
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const headT =
    span > 0 ? Math.min(1, Math.max(0, (avg - lo) / span)) : 0.5;
  out.head = (minAlpha + headT * (maxAlpha - minAlpha)) * 0.7;

  return out;
}

/** Human-readable a11y label for each region. */
const A11Y_LABEL: Record<RegionKey, string> = {
  head: 'head',
  chest: 'chest',
  abs: 'abs',
  rightArm: 'right arm',
  leftArm: 'left arm',
  rightThigh: 'right thigh',
  leftThigh: 'left thigh',
  rightCalf: 'right calf',
  leftCalf: 'left calf',
};

/** Mount-stagger order — head first, then trunk, limbs sweep outward. */
const STAGGER_ORDER: RegionKey[] = [
  'head',
  'chest',
  'abs',
  'rightArm',
  'leftArm',
  'rightThigh',
  'leftThigh',
  'rightCalf',
  'leftCalf',
];

interface RegionPathProps {
  region: RegionKey;
  targetAlpha: number;
  accentColor: string;
  outlineColor: string;
  delayMs: number;
  animate: boolean;
}

const RegionPath: React.FC<RegionPathProps> = ({
  region,
  targetAlpha,
  accentColor,
  outlineColor,
  delayMs,
  animate,
}) => {
  const alpha = useSharedValue(animate ? 0 : targetAlpha);

  useEffect(() => {
    if (!animate) {
      alpha.value = targetAlpha;
      return;
    }
    alpha.value = withDelay(
      delayMs,
      withTiming(targetAlpha, {
        duration: 650,
        easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      }),
    );
  }, [targetAlpha, animate, delayMs, alpha]);

  const animatedProps = useAnimatedProps(() => ({
    fillOpacity: alpha.value,
  }));

  return (
    <AnimatedPath
      d={PATHS[region]}
      fill={accentColor}
      stroke={outlineColor}
      strokeWidth={0.8}
      strokeLinejoin="round"
      animatedProps={animatedProps}
      accessibilityLabel={A11Y_LABEL[region]}
    />
  );
};

export const BodySilhouette: React.FC<BodySilhouetteProps> = ({
  width,
  height,
  segmental,
  accentColor,
  outlineColor = 'rgba(255,255,255,0.55)',
  animate = true,
}) => {
  const alphas = regionAlphas(segmental);

  return (
    <View
      style={[styles.wrap, { width, height }]}
      accessibilityRole="image"
      accessibilityLabel={
        segmental
          ? 'Body silhouette showing your lean-mass distribution per region'
          : 'Body silhouette outline'
      }
    >
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <G>
          {STAGGER_ORDER.map((region, i) => (
            <RegionPath
              key={region}
              region={region}
              targetAlpha={alphas[region]}
              accentColor={accentColor}
              outlineColor={outlineColor}
              delayMs={i * 70}
              animate={animate}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BodySilhouette;
