import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useSectionAccent } from '../hooks/useSectionAccent';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface PepTalkCharacterProps {
  size?: number;
  variant?: 'full' | 'avatar' | 'mini';
  animated?: boolean;
  /** Show a pulse ring animation (e.g. when bot is typing) */
  typing?: boolean;
  /** Segment palette primary color for outer glow */
  glowColor?: string;
  /** Override the mascot body color (defaults to current section accent) */
  bodyColor?: string;
  /** Override the secondary accent bubble color (defaults to section pastel) */
  accentColor?: string;
  style?: ViewStyle;
}

export function PepTalkCharacter({
  size = 120,
  variant = 'full',
  animated = false,
  typing = false,
  glowColor,
  bodyColor,
  accentColor,
  style,
}: PepTalkCharacterProps) {
  const accent = useSectionAccent();
  const body = bodyColor ?? accent.deep;
  const accentHex = accentColor ?? accent.pastel;
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (animated) {
      scale.value = withRepeat(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [animated, scale]);

  useEffect(() => {
    if (typing) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = withTiming(0, { duration: 200 });
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [typing, pulseOpacity, pulseScale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const isMini = variant === 'mini';
  const isAvatar = variant === 'avatar';
  const s = isMini ? Math.min(size, 28) : isAvatar ? Math.min(size, 36) : size;
  const half = s / 2;
  const glowC = glowColor ?? body;

  // Molecule node sizes relative to container
  const big = s * 0.28;
  const med = s * 0.2;
  const sm = s * 0.16;

  const Wrapper = animated ? Animated.View : View;
  const wrapperProps = animated
    ? { style: [styles.wrap, { width: s, height: s }, animStyle, style] }
    : { style: [styles.wrap, { width: s, height: s }, style] };

  return (
    <Wrapper {...(wrapperProps as any)}>
      {/* Typing pulse ring */}
      {(typing || variant === 'full') && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: s + (variant === 'full' ? 24 : 12),
              height: s + (variant === 'full' ? 24 : 12),
              borderRadius: (s + (variant === 'full' ? 24 : 12)) / 2,
              borderColor: `${glowC}60`,
            },
            typing ? pulseRingStyle : { opacity: 0 },
          ]}
        />
      )}

      {/* Outer glow ring (full variant only) */}
      {variant === 'full' && (
        <View
          style={[
            styles.glowRing,
            {
              width: s + 16,
              height: s + 16,
              borderRadius: (s + 16) / 2,
              borderColor: `${glowC}30`,
              shadowColor: glowC,
            },
          ]}
        />
      )}

      {/* Main gradient circle */}
      <LinearGradient
        colors={[body, body]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.circle, { width: s, height: s, borderRadius: half, shadowColor: body }]}
      >
        {/* Molecule SVG */}
        <Svg width={s * 0.7} height={s * 0.7} viewBox="0 0 100 100">
          {/* Center node */}
          <Circle cx="50" cy="45" r={(big / s) * 100} fill="rgba(255,255,255,0.9)" />
          {/* Top-right node */}
          <Circle cx="72" cy="28" r={(med / s) * 100} fill="rgba(0,0,0,0.50)" />
          {/* Bottom-left node */}
          <Circle cx="32" cy="68" r={(med / s) * 100} fill="rgba(0,0,0,0.45)" />
          {/* Small accent bubble */}
          <Circle cx="68" cy="65" r={(sm / s) * 100} fill="rgba(0,0,0,0.35)" />
          {/* Tiny sparkle */}
          <Circle cx="25" cy="35" r={(sm / s) * 80} fill="rgba(103,232,249,0.6)" />
        </Svg>
      </LinearGradient>

      {/* Floating bubbles (full variant only) */}
      {variant === 'full' && (
        <>
          <View
            style={[
              styles.bubble,
              {
                width: 8,
                height: 8,
                borderRadius: 4,
                top: 4,
                right: s * 0.15,
                backgroundColor: `${glowC}50`,
              },
            ]}
          />
          <View
            style={[
              styles.bubble,
              {
                width: 5,
                height: 5,
                borderRadius: 2.5,
                bottom: 8,
                left: s * 0.1,
                backgroundColor: `${body}50`,
              },
            ]}
          />
          <View
            style={[
              styles.bubble,
              {
                width: 6,
                height: 6,
                borderRadius: 3,
                top: s * 0.6,
                right: 0,
                backgroundColor: `${accentHex}80`,
              },
            ]}
          />
        </>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E89672',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  bubble: {
    position: 'absolute',
  },
});

export default PepTalkCharacter;
