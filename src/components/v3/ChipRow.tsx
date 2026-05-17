/**
 * Chip + ChipRow — small pill chips with optional colored dot.
 *
 * Used inside drill cards for inline mood/sleep/energy/etc. chips, and
 * by AimeeCenterpiece for the contextual quick-reply chips.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';

export interface ChipProps {
  label: string;
  /** Optional leading dot color. */
  dotColor?: string;
  onPress?: () => void;
  /** Emphasized (primary chip) — themed accent border instead of muted. */
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, dotColor, onPress, primary, style }: ChipProps) {
  const t = useV3Theme();
  const accent = t.isDark
    ? (t.colors as any).accentCognac
    : (t.colors as any).accentRose;

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: t.isDark
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(255,255,255,0.55)',
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: primary
            ? accent
            : t.isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.8)',
        },
        style,
      ]}
    >
      {dotColor ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : null}
      <Text
        style={{
          fontFamily: t.typography.bodyMedium,
          fontSize: 11,
          color: t.colors.textPrimary as string,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {content}
      </Pressable>
    );
  }
  return content;
}

interface ChipRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ChipRow({ children, style }: ChipRowProps) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
