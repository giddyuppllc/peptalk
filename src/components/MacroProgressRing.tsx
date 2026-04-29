/**
 * MacroProgressRing — circular progress of today's calorie intake vs. goal.
 *
 * Mirrors StepGoalRing's API + visual style so the home dashboard can
 * place them side-by-side without one looking out of place. Reads from
 * useMealStore (targets + today's totals) so it stays aligned with the
 * Nutrition tab.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useMealStore } from '../store/useMealStore';
import { Spacing, FontSizes } from '../constants/theme';

interface Props {
  /** Diameter in px. Default 120 (matches StepGoalRing). */
  size?: number;
  /** Stroke width. Default 10. */
  stroke?: number;
  /** Tap handler — typically /(tabs)/nutrition. */
  onPress?: () => void;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MacroProgressRing({ size = 120, stroke = 10, onPress }: Props) {
  const t = useTheme();
  const targets = useMealStore((s) => s.targets);
  const meals = useMealStore((s) => s.meals);

  const todayCals = useMemo(() => {
    const today = todayKey();
    return meals
      .filter((m) => m.date === today)
      .reduce((acc, m) => {
        const fromQuickLog = m.quickLog?.calories ?? 0;
        const fromFoods = (m.foods ?? []).reduce((s, f) => s + (f.calories ?? 0), 0);
        return acc + Math.max(fromQuickLog, fromFoods);
      }, 0);
  }, [meals]);

  const goal = targets?.calories ?? 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(todayCals / goal, 1) : 0;
  const dashOffset = circumference * (1 - progress);
  const goalReached = progress >= 1;
  const overBy = goal > 0 ? Math.max(0, todayCals - goal) : 0;

  // Color logic: blue while under goal, sage when met (≥1.0), amber if
  // significantly over (>110% — flag the over-eat).
  const ringColor =
    goal === 0
      ? '#9CA3AF'
      : todayCals > goal * 1.1
        ? '#B45309'
        : goalReached
          ? '#6FA891'
          : '#3E7CB1';
  const trackColor = `${ringColor}26`;

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        goal > 0
          ? `Today's calories: ${todayCals} of ${goal}`
          : "Today's calories — no daily target set yet"
      }
      style={styles.wrap}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={stroke}
            fill="none"
          />
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
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.center}>
          {goal > 0 ? (
            <>
              <Text style={[styles.value, { color: t.text }]}>
                {todayCals >= 1000 ? `${(todayCals / 1000).toFixed(1)}k` : todayCals}
              </Text>
              <Text style={[styles.goalText, { color: t.textSecondary }]}>
                {goalReached
                  ? overBy > 0 && goal > 0 && todayCals > goal * 1.1
                    ? `+${overBy} over`
                    : 'goal hit'
                  : `of ${goal >= 1000 ? `${(goal / 1000).toFixed(1)}k` : goal}`}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="restaurant-outline" size={28} color={t.textMuted} />
              <Text style={[styles.placeholder, { color: t.textMuted }]}>
                Set goal
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
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  goalText: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6 },
  placeholder: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});

// Spacing/FontSizes referenced for tree-shake guard
void Spacing;
void FontSizes;
