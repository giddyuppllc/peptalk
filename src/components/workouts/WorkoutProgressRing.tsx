/**
 * WorkoutProgressRing — circular SVG ring for the bespoke workout player.
 *
 * Reads its own animation in via reanimated (stroke-dashoffset), matches the
 * theme accent, and centers a percentage + "Exercise N of M" sublabel.
 *
 * Distinct from the generic ProgressRing in src/components/ProgressRing.tsx
 * because the workout player has its own typography + accent treatment and
 * we don't want to widen the generic ring's API for one consumer.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontSizes } from '../../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface WorkoutProgressRingProps {
  /** 0-1 (eg 0.5 = 50%) */
  progress: number;
  /** Current exercise index (1-based for display) */
  currentExercise?: number;
  /** Total exercises */
  totalExercises?: number;
  size?: number;
  strokeWidth?: number;
  /** Ring color — defaults to theme deep accent */
  color: string;
  trackColor?: string;
  textColor: string;
  textMutedColor: string;
}

export function WorkoutProgressRing({
  progress,
  currentExercise,
  totalExercises,
  size = 132,
  strokeWidth = 10,
  color,
  trackColor = 'rgba(0,0,0,0.06)',
  textColor,
  textMutedColor,
}: WorkoutProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const animated = useSharedValue(0);
  useEffect(() => {
    animated.value = withTiming(Math.min(1, Math.max(0, progress)) * 100, {
      duration: 700,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress, animated]);

  const animatedProps = useAnimatedProps(() => {
    const offset = circumference - (circumference * animated.value) / 100;
    return { strokeDashoffset: offset };
  });

  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const showSub =
    typeof currentExercise === 'number' && typeof totalExercises === 'number';

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={`Workout ${pct}% complete${
        showSub ? `, exercise ${currentExercise} of ${totalExercises}` : ''
      }`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.label}>
        <Text style={[styles.pct, { color: textColor }]}>{pct}%</Text>
        {showSub && (
          <Text style={[styles.sub, { color: textMutedColor }]}>
            Exercise {currentExercise} of {totalExercises}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: {
    fontSize: 28,
    fontFamily: 'DMSans-Bold',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

export default WorkoutProgressRing;
