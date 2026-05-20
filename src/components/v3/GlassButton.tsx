/**
 * GlassButton + DrillCard — pressable variants of GlassCard.
 *
 * GlassButton: anywhere a card-styled tap target is wanted (chips,
 * action tiles). Spring-scales to 0.97 on press, light haptic tick.
 *
 * DrillCard: the home-screen drill-in landing card. Same press
 * mechanic, plus accepts a `label` (uppercase) and inline `preview`
 * (any ReactNode — the per-vertical data widget renders here).
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GlassButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function GlassButton({ onPress, children, style, accessibilityLabel }: GlassButtonProps) {
  const t = useV3Theme();
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
      }}
      style={[aStyle, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <GlassCard>{children}</GlassCard>
    </AnimatedPressable>
  );
}

interface DrillCardProps {
  label: string;
  preview: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function DrillCard({ label, preview, onPress, accessibilityLabel }: DrillCardProps) {
  const t = useV3Theme();
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
      }}
      style={[aStyle, styles.wrap]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <GlassCard>
        <Text
          style={{
            color: t.colors.textSecondary as string,
            fontFamily: t.typography.label,
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            marginBottom: t.spacing.sm,
          }}
        >
          {label}
        </Text>
        <View>{preview}</View>
      </GlassCard>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
});
