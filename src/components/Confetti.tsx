/**
 * Confetti celebration overlay — fires particles on achievements, streaks, etc.
 *
 * Pure reanimated — no Lottie dependency needed.
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation, Easing } from 'react-native-reanimated';
import { useReduceMotion } from '../hooks/useReduceMotion';

// Dimensions are read per-render via useWindowDimensions() rather than captured
// once at module scope. Targeting Android 16 (API 36) means the system IGNORES
// `screenOrientation` on any display >= 600dp, so tablets and unfolded
// foldables can now rotate freely. A module-scope Dimensions.get() is evaluated
// exactly once at import and never updates, so after a rotation every value
// derived from it is stale — confetti would spawn across the OLD screen width
// and fall to the OLD screen height.
const PARTICLE_COUNT = 40;

const COLORS = [
  '#E89672', // pepBlue
  '#E89672', // pepTeal
  '#06CEFF', // pepCyan
  '#BFDBF7', // light blue (was gold)
  '#10B981', // green
  '#a855f7', // purple
  '#ef4444', // red
  '#ec4899', // pink
];

interface Particle {
  x: number;
  delay: number;
  color: string;
  size: number;
  rotation: number;
  drift: number;
}

function ConfettiParticle({
  particle,
  visible,
}: {
  particle: Particle;
  visible: boolean;
}) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const translateX = useSharedValue(particle.x);
  const reduceMotion = useReduceMotion();
  const { height: screenH } = useWindowDimensions();

  // 2026-05-17 perf+a11y: cancel worklet on unmount + honor Reduce Motion
  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        // Skip the animated fall — keep particles invisible so the
        // celebration is silent for vestibular-sensitive users.
        opacity.value = 0;
        translateY.value = -20;
        translateX.value = particle.x;
        rotate.value = 0;
        return;
      }
      opacity.value = withDelay(
        particle.delay,
        withTiming(1, { duration: 200 }),
      );
      translateY.value = withDelay(
        particle.delay,
        withTiming(screenH + 50, {
          duration: 2000 + Math.random() * 1000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      );
      translateX.value = withDelay(
        particle.delay,
        withTiming(particle.x + particle.drift, {
          duration: 2000 + Math.random() * 1000,
        }),
      );
      rotate.value = withDelay(
        particle.delay,
        withTiming(particle.rotation, { duration: 2500 }),
      );
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      cancelAnimation(translateX);
      cancelAnimation(rotate);
    };
  }, [visible, particle, translateY, opacity, rotate, translateX, reduceMotion, screenH]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: particle.size,
          height: particle.size * 0.6,
          backgroundColor: particle.color,
          borderRadius: particle.size > 8 ? 2 : 1,
        },
        animStyle,
      ]}
    />
  );
}

interface ConfettiProps {
  /** Whether the confetti is actively showing */
  visible: boolean;
  /** Called when animation finishes */
  onComplete?: () => void;
}

export function Confetti({ visible, onComplete }: ConfettiProps) {
  const { width: screenW } = useWindowDimensions();
  // screenW is a real dependency — on rotation the particles must be re-laid
  // out across the new width, not the width at first mount.
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * screenW,
      delay: Math.random() * 500,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rotation: 360 + Math.random() * 720,
      drift: (Math.random() - 0.5) * 100,
    }));
  }, [screenW]);

  useEffect(() => {
    if (visible && onComplete) {
      const timer = setTimeout(onComplete, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onComplete]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {particles.map((p, i) => (
        <ConfettiParticle key={i} particle={p} visible={visible} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  particle: {
    position: 'absolute',
    top: -20,
  },
});

export default Confetti;
