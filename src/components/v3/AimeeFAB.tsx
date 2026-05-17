/**
 * AimeeFAB — bottom-right floating action button on every v3 screen.
 *
 * Female: rose→lavender gradient with a serif "A".
 * Male: oxblood→cognac gradient with a serif "A" in bone.
 *
 * Tap routes to /(tabs)/peptalk with an optional intent pre-loader, which
 * the chat surface auto-sends on arrival. The shared useChatStore makes
 * the thread continue seamlessly across every screen (§9.10).
 */

import React from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useAimeeRouter, type AimeeIntent } from '../../hooks/useAimeeRouter';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  /** Optional intent that pre-loads the chat (e.g. "log_meal"). */
  intent?: AimeeIntent;
  style?: StyleProp<ViewStyle>;
}

export function AimeeFAB({ intent = 'open_chat', style }: Props) {
  const t = useV3Theme();
  const openAimee = useAimeeRouter();
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => openAimee(intent)}
      onPressIn={() => {
        scale.value = withSpring(0.92, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
      }}
      style={[styles.wrap, aStyle, style]}
      accessibilityRole="button"
      accessibilityLabel="Open Aimee chat"
    >
      <LinearGradient
        colors={[
          (t.colors as any).fabGradientStart,
          (t.colors as any).fabGradientEnd,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, t.shadows.fab]}
      >
        <Text
          style={{
            fontFamily: t.isDark
              ? t.typography.numeralsMale
              : t.typography.numeralsFemale,
            fontSize: 22,
            color: t.isDark ? (t.colors.textPrimary as string) : '#fff',
          }}
        >
          A
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    zIndex: 50,
  },
  gradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
