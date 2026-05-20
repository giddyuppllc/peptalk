/**
 * MacroBar — horizontal macro progress bar with label + g count.
 *
 * Used as the secondary macro readout under the protein ring (carbs /
 * fat / fiber). Theme-aware accent colors.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';

type Kind = 'carbs' | 'fat' | 'fiber';

interface Props {
  kind: Kind;
  current: number;
  target: number;
  unit?: string;
}

export function MacroBar({ kind, current, target, unit = 'g' }: Props) {
  const t = useV3Theme();
  const pct = Math.min(100, Math.max(0, target > 0 ? (current / target) * 100 : 0));

  const fillColor = (() => {
    if (t.isDark) {
      if (kind === 'carbs') return (t.colors as any).accentCognacDeep;
      if (kind === 'fat') return (t.colors as any).accentTungsten;
      return (t.colors as any).accentOxblood;
    }
    if (kind === 'carbs') return (t.colors as any).accentMint;
    if (kind === 'fat') return (t.colors as any).accentLavender;
    return (t.colors as any).accentBabyBlue;
  })();

  const trackColor = t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(42,26,79,0.06)';

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 9,
            letterSpacing: 1.2,
            color: t.colors.textSecondary as string,
            textTransform: 'uppercase',
          }}
        >
          {kind}
        </Text>
        <Text
          style={{
            fontFamily: t.typography.bodyMedium,
            fontSize: 11,
            color: t.colors.textPrimary as string,
          }}
        >
          {Math.round(current)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: fillColor, width: `${pct}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
