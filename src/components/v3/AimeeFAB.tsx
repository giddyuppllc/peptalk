/**
 * AimeeFAB — bottom-right floating action button on every v3 screen.
 *
 * Female: rose→lavender gradient with a serif "A".
 * Male: oxblood→cognac gradient with a serif "A" in bone.
 *
 * Tap → opens AimeeChatSheet. Phase A: scaffold only — sheet rendered
 * empty. Phase F1 wires it to the chat backend.
 */

import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapMedium } from '../../utils/haptics';
import { AimeeChatSheet } from './AimeeChatSheet';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  /** Optional intent that pre-loads the chat sheet (e.g. "log_meal"). */
  intent?: string;
  style?: StyleProp<ViewStyle>;
}

export function AimeeFAB({ intent, style }: Props) {
  const t = useV3Theme();
  const [open, setOpen] = useState(false);
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = () => {
    tapMedium();
    setOpen(true);
  };

  return (
    <>
      <AnimatedPressable
        onPress={onPress}
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
      <AimeeChatSheet visible={open} onClose={() => setOpen(false)} intent={intent} />
    </>
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
