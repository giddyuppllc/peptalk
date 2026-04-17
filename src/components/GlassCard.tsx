import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients } from '../constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'accent' | 'glow' | 'gradient';
  /** Override glow/gradient color for segment theming */
  glowColor?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  variant = 'default',
  glowColor,
}) => {
  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={[Gradients.card[0], Gradients.card[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.gradientCard, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  const glowStyle: ViewStyle | undefined =
    variant === 'glow'
      ? {
          backgroundColor: glowColor
            ? `${glowColor}14`
            : 'rgba(59, 130, 246, 0.08)',
          borderColor: glowColor
            ? `${glowColor}40`
            : 'rgba(59, 130, 246, 0.25)',
          shadowColor: glowColor ?? '#E89672',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 8,
        }
      : undefined;

  return (
    <View
      style={[styles.card, variantStyles[variant] ?? variantStyles.default, glowStyle, style]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  gradientCard: {
    borderColor: 'rgba(59, 130, 246, 0.20)',
  },
});

const variantStyles: Record<string, ViewStyle> = StyleSheet.create({
  default: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  elevated: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  accent: {
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    borderColor: 'rgba(227, 167, 161, 0.25)',
  },
});

export default GlassCard;
