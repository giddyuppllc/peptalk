/**
 * StatRow — k/v row with dashed-underline separator.
 *
 * Used inside drill cards (e.g. Activity card: "Steps · 6,420" /
 * "Active · 380 cal" / "Workouts · 3").
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  label: string;
  value: string;
  /** Hide the bottom separator (e.g. on the last row). */
  hideSeparator?: boolean;
}

export function StatRow({ label, value, hideSeparator }: Props) {
  const t = useV3Theme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 10,
            letterSpacing: 1.2,
            color: t.colors.textSecondary as string,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: t.typography.bodyBold,
            fontSize: 13,
            color: t.colors.textPrimary as string,
          }}
        >
          {value}
        </Text>
      </View>
      {!hideSeparator ? (
        <View
          style={[
            styles.dashedSeparator,
            {
              borderColor: t.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(42,26,79,0.12)',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashedSeparator: {
    marginTop: 6,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
});
