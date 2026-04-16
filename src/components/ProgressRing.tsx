/**
 * Animated circular progress ring — the core health app visual element.
 *
 * Uses react-native-svg + reanimated for smooth fill animation.
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0-100 percentage */
  progress: number;
  /** Ring diameter */
  size?: number;
  /** Ring stroke width */
  strokeWidth?: number;
  /** Fill color */
  color?: string;
  /** Track color */
  trackColor?: string;
  /** Center label (e.g. "72%") */
  label?: string;
  /** Sub-label below main label */
  subLabel?: string;
  /** Label font size */
  labelSize?: number;
  /** Animation duration in ms */
  duration?: number;
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
  color = '#E89672',
  trackColor = 'rgba(0,0,0,0.05)',
  label,
  subLabel,
  labelSize = 22,
  duration = 800,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(Math.min(100, Math.max(0, progress)), {
      duration,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress, duration, animatedProgress]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset =
      circumference - (circumference * animatedProgress.value) / 100;
    return { strokeDashoffset };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
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
      {/* Center label */}
      <View style={styles.labelContainer}>
        {label != null && (
          <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
        )}
        {subLabel != null && (
          <Text style={styles.subLabel}>{subLabel}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '800',
    color: '#2D2D2D',
  },
  subLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
});

export default ProgressRing;
