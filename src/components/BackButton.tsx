/**
 * BackButton — shared back-nav button with accessibility baked in.
 * Use this in new screens. Existing screens can migrate over time.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';

interface BackButtonProps {
  onPress?: () => void;
  icon?: 'chevron-back' | 'arrow-back' | 'close';
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

export function BackButton({
  onPress,
  icon = 'chevron-back',
  size = 24,
  color,
  style,
  label = 'Go back',
}: BackButtonProps) {
  const router = useRouter();
  const t = useTheme();
  const iconColor = color ?? t.text;

  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.back())}
      style={[styles.btn, style]}
      activeOpacity={0.7}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name={icon} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    // 2026-05-17 a11y fix: bumped from 40×40 to 44×44 to meet
    // iOS Human Interface Guidelines minimum tap target. hitSlop
    // still extends the touch area another 10pt in every direction
    // for users with motor impairments.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
