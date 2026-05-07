/**
 * PerformanceBubble — translucent circular tile showing a single
 * easy-to-read figure plus a short label. Tappable; tap fires
 * onPress so the parent can open the breakdown sheet.
 *
 * Visual: glass bubble with a soft accent gradient, big sans-serif
 * value in the center, label below. Designed to read at a glance
 * even in a 2-column grid on small screens.
 */

import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { FontSizes } from '../constants/theme';

interface PerformanceBubbleProps {
  value: number;
  unit?: '%' | 'days' | 'count' | string;
  label: string;
  /** Higher = denser fill — gives a "fuller" bubble for higher scores. */
  fillRatio?: number;
  onPress?: () => void;
}

const SIZE = 150;

export function PerformanceBubble({
  value,
  unit = '%',
  label,
  fillRatio,
  onPress,
}: PerformanceBubbleProps) {
  const t = useTheme();
  const accent = useSectionAccent();

  // Default fill scales with the value when unit is %; for "days" we cap
  // at 1.0 once the streak hits 14+ so the bubble doesn't look broken.
  const ratio = (() => {
    if (typeof fillRatio === 'number') return Math.max(0, Math.min(1, fillRatio));
    if (unit === '%') return Math.max(0, Math.min(1, value / 100));
    if (unit === 'days') return Math.max(0, Math.min(1, value / 14));
    return 0.6;
  })();

  // Deeper alpha for more "filled" bubbles; the unfilled ones are nearly
  // pure glass so they feel lower-priority.
  const alphaHex = Math.round((0.18 + ratio * 0.5) * 255)
    .toString(16)
    .padStart(2, '0');
  const fillColor = `${accent.deep}${alphaHex}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        pressed && styles.wrapPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit === '%' ? '%' : unit === 'days' ? ' days' : ''}. Tap for breakdown.`}
    >
      <LinearGradient
        colors={[fillColor, `${accent.deep}10`]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.bubble,
          { borderColor: `${accent.deep}40` },
        ]}
      >
        <View style={styles.inner}>
          <View style={styles.numberRow}>
            <Text style={[styles.value, { color: t.text }]}>{value}</Text>
            <Text style={[styles.unit, { color: t.textSecondary }]}>
              {unit === '%' ? '%' : unit === 'days' ? 'd' : ''}
            </Text>
          </View>
          <Text style={[styles.label, { color: t.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    margin: 6,
  },
  wrapPressed: {
    transform: [{ scale: 0.97 }],
  },
  bubble: {
    width: '100%',
    height: '100%',
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  unit: {
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default PerformanceBubble;
