/**
 * StepGoalRing — circular progress ring of today's step count vs. user goal.
 *
 * Reads the latest synced steps reading for today from useBiometricsStore
 * (which the AppState foreground sync keeps fresh). Falls back to a friendly
 * "connect a watch" prompt if no data exists yet.
 *
 * Default goal is 10,000 — matches what HealthKit / Health Connect default to.
 * Could be made user-configurable later via the health profile.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useBiometricsStore } from '../store/useBiometricsStore';
import { Colors, Spacing, FontSizes } from '../constants/theme';

interface Props {
  /** Daily step goal. Default 10,000. */
  goal?: number;
  /** Diameter of the ring in px. Default 120. */
  size?: number;
  /** Stroke width of the ring. Default 10. */
  stroke?: number;
  /** Tap handler — typically routes to /settings/integrations or /(tabs)/calendar. */
  onPress?: () => void;
  /** Optional date override (YYYY-MM-DD). Default: today. */
  date?: string;
}

export function StepGoalRing({
  goal = 10000,
  size = 120,
  stroke = 10,
  onPress,
  date,
}: Props) {
  const t = useTheme();
  const dateKey = date ?? new Date().toISOString().slice(0, 10);
  const reading = useBiometricsStore((s) => s.getReading(dateKey, 'steps'));
  const stepsToday = reading?.value ? Math.round(reading.value) : 0;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(stepsToday / goal, 1);
  const dashOffset = circumference * (1 - progress);
  const goalReached = progress >= 1;

  const ringColor = goalReached ? '#6FA891' : '#3E7CB1'; // sage when hit, blue otherwise
  const trackColor = `${ringColor}26`;

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Steps today: ${stepsToday.toLocaleString()} of ${goal.toLocaleString()}`}
      style={styles.wrap}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={stroke}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            // Rotate -90° so the ring starts at the top instead of 3 o'clock
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        {/* Center content */}
        <View style={styles.center}>
          {stepsToday > 0 ? (
            <>
              <Text style={[styles.steps, { color: t.text }]}>
                {stepsToday >= 10000
                  ? `${(stepsToday / 1000).toFixed(1)}k`
                  : stepsToday.toLocaleString()}
              </Text>
              <Text style={[styles.goalText, { color: t.textSecondary }]}>
                {goalReached ? 'goal hit' : `of ${(goal / 1000).toFixed(0)}k`}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="walk-outline" size={28} color={t.textMuted} />
              <Text style={[styles.placeholder, { color: t.textMuted }]}>
                {onPress ? 'Connect' : '—'}
              </Text>
            </>
          )}
        </View>
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 1 },
  steps: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  goalText: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6 },
  placeholder: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});
