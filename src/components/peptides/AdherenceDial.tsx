/**
 * AdherenceDial — large circular SVG ring used as the hero on the
 * Peptides tab and (reused in Phase 2) on the Home dashboard.
 *
 * Animates stroke-dashoffset on mount via react-native-reanimated for
 * a clean Trainerize-style sweep. Renders a center label + sub-label
 * inside the ring.
 *
 * Owns NO data. Pure presentation — `percent`, `centerLabel`,
 * `subLabel`, color, size all flow in from the caller.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, AccessibilityRole } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface AdherenceDialProps {
  /** Adherence percent (0-100). Clamped internally. */
  percent: number;
  /** Big number in the middle, e.g. "82%" or "23 of 28". */
  centerLabel: string;
  /** Caption under the center label, e.g. "doses logged". */
  subLabel?: string;
  /** Diameter in px. Default 180 for hero use; pass 110 for Home re-use. */
  size?: number;
  /** Ring thickness. */
  strokeWidth?: number;
  /** Primary stroke color. A subtle gradient pulls between this and itself
      at 70% alpha — falls back to flat when `gradientEnd` is set. */
  color?: string;
  /** Optional second color to enable a 2-stop gradient. */
  gradientEnd?: string;
  /** Track (unfilled) color. */
  trackColor?: string;
  /** Center-label color. Inherits from `color` when omitted. */
  centerLabelColor?: string;
  /** Sub-label color. */
  subLabelColor?: string;
  /** Disable the mount animation (useful for snapshot tests). */
  animate?: boolean;
  /** Mount-animation duration. */
  duration?: number;
  /** A11y label for the whole dial. */
  accessibilityLabel?: string;
}

export function AdherenceDial({
  percent,
  centerLabel,
  subLabel,
  size = 180,
  strokeWidth = 14,
  color = '#9B86A4',
  gradientEnd,
  trackColor = 'rgba(0,0,0,0.06)',
  centerLabelColor,
  subLabelColor = '#6B7280',
  animate = true,
  duration = 900,
  accessibilityLabel,
}: AdherenceDialProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const progress = useSharedValue(animate ? 0 : clamped);

  useEffect(() => {
    if (!animate) {
      progress.value = clamped;
      return;
    }
    progress.value = withTiming(clamped, {
      duration,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
    });
  }, [clamped, animate, duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const offset = circumference - (circumference * progress.value) / 100;
    return { strokeDashoffset: offset };
  });

  const useGradient = !!gradientEnd && gradientEnd !== color;
  const strokeStyle = useGradient ? 'url(#adherenceGradient)' : color;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole={'image' as AccessibilityRole}
      accessibilityLabel={
        accessibilityLabel ?? `Adherence ${Math.round(clamped)} percent. ${centerLabel}${subLabel ? `. ${subLabel}` : ''}`
      }
    >
      <Svg width={size} height={size}>
        {useGradient && (
          <Defs>
            <LinearGradient id="adherenceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={color} stopOpacity={1} />
              <Stop offset="100%" stopColor={gradientEnd as string} stopOpacity={1} />
            </LinearGradient>
          </Defs>
        )}
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated progress */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={strokeStyle}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>

      <View pointerEvents="none" style={styles.labelLayer}>
        <Text
          style={[
            styles.centerLabel,
            { color: centerLabelColor ?? '#2D2D2D', fontSize: size * 0.22 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerLabel}
        </Text>
        {subLabel ? (
          <Text
            style={[styles.subLabel, { color: subLabelColor, fontSize: Math.max(10, size * 0.075) }]}
            numberOfLines={1}
          >
            {subLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  centerLabel: {
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subLabel: {
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
    letterSpacing: 0.4,
  },
});

export default AdherenceDial;
