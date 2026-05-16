/**
 * AskAimeeButton — small chip-style "Ask Aimee about this" button.
 *
 * Tap → routes the user to the Aimee chat tab with a pre-loaded
 * question in the input. Designed as the consistent escape hatch from
 * jargon-heavy screens (peptide detail, dosing calculator, readiness
 * card, food-scan results) so a user who's lost can hand off to Aimee
 * without having to type the question themselves.
 *
 * Uses the `prefill` param on /(tabs)/peptalk so the message lands in
 * the chat input rather than auto-sending — gives the user a chance to
 * edit or add context before firing it off.
 */

import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { useRouter } from 'expo-router';
import { AimeeDnaIcon } from './AimeeDnaIcon';
import { FontSizes, Spacing } from '../constants/theme';

interface AskAimeeButtonProps {
  /** Pre-loaded question text to populate Aimee's input. */
  prefill: string;
  /** Compact icon-only variant (for tight spaces like ReadinessCard). */
  variant?: 'chip' | 'icon';
  /** Override label — defaults to "Ask Aimee about this". */
  label?: string;
  /** Optional wrapper style override. */
  style?: StyleProp<ViewStyle>;
  /** Used for accessibility — falls back to label/prefill. */
  accessibilityLabel?: string;
}

export function AskAimeeButton({
  prefill,
  variant = 'chip',
  label = 'Ask Aimee about this',
  style,
  accessibilityLabel,
}: AskAimeeButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push({
      pathname: '/(tabs)/peptalk',
      params: { prefill },
    } as any);
  };

  const a11y = accessibilityLabel ?? `Ask Aimee: ${prefill}`;

  if (variant === 'icon') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[styles.iconBtn, style]}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Opens Aimee chat with a related question pre-loaded"
      >
        <AimeeDnaIcon size={20} active />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[styles.chip, style]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Opens Aimee chat with a related question pre-loaded"
    >
      <AimeeDnaIcon size={16} active />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(62, 124, 177, 0.35)',
    backgroundColor: 'rgba(62, 124, 177, 0.08)',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62, 124, 177, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(62, 124, 177, 0.30)',
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: '#3E7CB1',
    letterSpacing: 0.2,
  },
});

export default AskAimeeButton;
