import React from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPress } from './AnimatedPress';
import { useSectionAccent } from '../hooks/useSectionAccent';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Custom gradient colors for segment theming */
  colors?: [string, string];
  style?: ViewStyle;
}

export function GradientButton({
  label,
  onPress,
  disabled = false,
  colors,
  style,
}: GradientButtonProps) {
  const accent = useSectionAccent();
  const c = colors ?? ([accent.deep, accent.deep] as [string, string]);
  return (
    <AnimatedPress
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.97}
      style={[disabled && styles.disabled, style]}
    >
      <LinearGradient
        colors={c}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </AnimatedPress>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.35,
  },
});

export default GradientButton;
