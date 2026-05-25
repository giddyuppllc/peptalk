/**
 * MacroRing — circular progress ring with % center + label below.
 *
 * Protein-focal (§6.1). Female: rose accent stroke. Male: cognac.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  /** Current value (e.g. 75 grams). */
  current: number;
  /** Target value (e.g. 100 grams). */
  target: number;
  /** Unit label (e.g. "g"). */
  unit?: string;
  /** Label below the ring (e.g. "PROTEIN"). */
  label?: string;
  /** Ring diameter. */
  size?: number;
}

export function MacroRing({ current, target, unit = 'g', label = 'PROTEIN', size = 96 }: Props) {
  const t = useV3Theme();
  const pct = Math.min(100, Math.max(0, target > 0 ? (current / target) * 100 : 0));
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  const stroke = t.isDark ? (t.colors as any).accentCognac : (t.colors as any).accentRose;
  const trackColor = t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(42,26,79,0.08)';

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={stroke}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            style={{
              fontFamily: t.isDark ? t.typography.numeralsMale : t.typography.numeralsFemale,
              fontSize: size * 0.28,
              color: t.colors.textPrimary as string,
            }}
          >
            {Math.round(pct)}%
          </Text>
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 6,
          fontFamily: t.typography.label,
          fontSize: 9,
          // Wave 76.49: letterSpacing 1.4 was clipping "PROTEIN" -> "PROTEI"
          // on Android. The wrap width was being pulled to ~96 by the ring
          // and the spaced-out label couldn't fit. Dropped to 0.8 — still
          // reads as a small-caps label without busting the box.
          letterSpacing: 0.8,
          color: t.colors.textSecondary as string,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          fontFamily: t.typography.bodyMedium,
          fontSize: 12,
          color: t.colors.textPrimary as string,
        }}
      >
        {Math.round(current)} / {Math.round(target)} {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    // Wave 76.55: 112 wasn't enough on Galaxy S24 (Samsung One UI's
    // system font rendered DM Sans wider than expected). Bumped to
    // 132 and added flexShrink:0 so the parent row layout can't
    // squeeze it below this width.
    minWidth: 132,
    flexShrink: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
