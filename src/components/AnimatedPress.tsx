/**
 * AnimatedPress — wraps any child with a smooth scale-down + haptic on press.
 *
 * Use this instead of TouchableOpacity for a game-like tactile feel.
 */

import React from 'react';
import { Pressable, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { tapLight } from '../utils/haptics';
import { useReduceMotion } from '../hooks/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressProps {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Scale factor on press (default 0.96) */
  scaleTo?: number;
  /** Enable haptic feedback (default true) */
  haptic?: boolean;
  children: React.ReactNode;
  /** Accessibility */
  accessible?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
}

export function AnimatedPress({
  onPress,
  onLongPress,
  style,
  disabled = false,
  scaleTo = 0.96,
  haptic = true,
  children,
  accessible,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: AnimatedPressProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reduceMotion) return;
    scale.value = withSpring(scaleTo, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePressOut = () => {
    if (reduceMotion) return;
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });
  };

  const handlePress = () => {
    if (haptic) tapLight();
    onPress?.();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[animatedStyle, style, disabled && { opacity: 0.4 }]}
      accessible={accessible}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...(accessibilityState ?? {}) }}
    >
      {children}
    </AnimatedPressable>
  );
}

export default AnimatedPress;
