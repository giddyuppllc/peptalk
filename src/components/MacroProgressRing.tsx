/**
 * MacroProgressRing — circular progress of today's calorie intake vs. goal.
 *
 * Mirrors StepGoalRing's API + visual style so the home dashboard can
 * place them side-by-side without one looking out of place. Reads from
 * useMealStore (targets + today's totals) so it stays aligned with the
 * Nutrition tab.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
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
  /**
   * Long-press handler — typically routes to /(tabs)/nutrition.
   * Single tap is reserved for flipping between calorie and macro views,
   * so we expose long-press for the navigation action.
   */
  onPress?: () => void;
}

// Per-macro accent colors. Stay inside the existing theme palette
// (sage / proBlue / rose / lemon) — matches the Track-A palette used
// elsewhere on home so colors don't fight.
const MACRO_COLORS = {
  protein: '#6FA891', // sage
  carbs:   '#3E7CB1', // proBlue
  fat:     '#D98C86', // rose
  fiber:   '#C9A84A', // lemon
} as const;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MacroProgressRing({ size = 120, stroke = 10, onPress }: Props) {
  const t = useTheme();
  const targets = useMealStore((s) => s.targets);
  const meals = useMealStore((s) => s.meals);

  // Tap toggles between calorie view (default) and macro breakdown view.
  // Long-press hits the existing onPress (typically navigation).
  const [view, setView] = useState<'calories' | 'macros'>('calories');
  const fade = useRef(new Animated.Value(1)).current;
  // Track the flip-view timer so we can cancel on unmount — earlier
  // this leaked a setTimeout that fired setView on a dead component
  // if the user tapped flip and immediately navigated away.
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    };
  }, []);
  const flipView = () => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = setTimeout(() => {
      setView((v) => (v === 'calories' ? 'macros' : 'calories'));
      flipTimerRef.current = null;
    }, 120);
  };

  // Today's totals across all macros — sum either quickLog or per-food values.
  const todayTotals = useMemo(() => {
    const today = todayKey();
    return meals
      .filter((m) => m.date === today)
      .reduce(
        (acc, m) => {
          const ql = m.quickLog;
          if (ql) {
            return {
              calories: acc.calories + (ql.calories ?? 0),
              protein:  acc.protein  + (ql.proteinGrams ?? 0),
              carbs:    acc.carbs    + (ql.carbsGrams ?? 0),
              fat:      acc.fat      + (ql.fatGrams ?? 0),
              fiber:    acc.fiber    + ((ql as any).fiberGrams ?? 0),
            };
          }
          const foods = m.foods ?? [];
          return {
            calories: acc.calories + foods.reduce((s, f) => s + (f.calories ?? 0), 0),
            protein:  acc.protein  + foods.reduce((s, f) => s + (f.proteinGrams ?? 0), 0),
            carbs:    acc.carbs    + foods.reduce((s, f) => s + (f.carbsGrams ?? 0), 0),
            fat:      acc.fat      + foods.reduce((s, f) => s + (f.fatGrams ?? 0), 0),
            fiber:    acc.fiber    + foods.reduce((s, f) => s + ((f as any).fiberGrams ?? 0), 0),
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      );
  }, [meals]);

  const todayCals = todayTotals.calories;
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

  // Macro view — 4 concentric rings. Each ring is thinner so 4 fit
  // inside the same 120px footprint. Outer ring = protein (most important
  // for our user base), then carbs, then fat, innermost = fiber.
  const macroStroke = 5;
  const macroGap = 2;
  const macroRadii = [
    (size - macroStroke) / 2,
    (size - macroStroke) / 2 - (macroStroke + macroGap),
    (size - macroStroke) / 2 - 2 * (macroStroke + macroGap),
    (size - macroStroke) / 2 - 3 * (macroStroke + macroGap),
  ];
  const macroProgress = (current: number, target: number | undefined) =>
    target && target > 0 ? Math.min(current / target, 1) : 0;
  const macros = [
    { label: 'P', current: Math.round(todayTotals.protein), target: targets?.proteinGrams ?? 0, color: MACRO_COLORS.protein, radius: macroRadii[0] },
    { label: 'C', current: Math.round(todayTotals.carbs),   target: targets?.carbsGrams ?? 0,   color: MACRO_COLORS.carbs,   radius: macroRadii[1] },
    { label: 'F', current: Math.round(todayTotals.fat),     target: targets?.fatGrams ?? 0,     color: MACRO_COLORS.fat,     radius: macroRadii[2] },
    { label: 'Fb', current: Math.round(todayTotals.fiber),  target: targets?.fiberGrams ?? 0,   color: MACRO_COLORS.fiber,   radius: macroRadii[3] },
  ];

  // Single tap = flip; long press = fall through to caller's onPress (navigation).
  return (
    <TouchableOpacity
      onPress={flipView}
      onLongPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        view === 'calories'
          ? (goal > 0 ? `Today's calories: ${todayCals} of ${goal}. Tap for macro breakdown.` : "Today's calories — no daily target set yet")
          : `Macros — protein ${macros[0].current}g, carbs ${macros[1].current}g, fat ${macros[2].current}g, fiber ${macros[3].current}g. Tap to flip back to calories.`
      }
      style={styles.wrap}
    >
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: fade }}>
        {view === 'calories' ? (
          <>
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
          </>
        ) : (
          <>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
              {macros.map((m) => {
                const c = 2 * Math.PI * m.radius;
                const off = c * (1 - macroProgress(m.current, m.target));
                return (
                  <React.Fragment key={m.label}>
                    <Circle
                      cx={size / 2}
                      cy={size / 2}
                      r={m.radius}
                      stroke={`${m.color}26`}
                      strokeWidth={macroStroke}
                      fill="none"
                    />
                    <Circle
                      cx={size / 2}
                      cy={size / 2}
                      r={m.radius}
                      stroke={m.color}
                      strokeWidth={macroStroke}
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={c}
                      strokeDashoffset={off}
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
            <View style={styles.macroCenter}>
              <Text style={[styles.macroLine, { color: MACRO_COLORS.protein }]}>P {macros[0].current}g</Text>
              <Text style={[styles.macroLine, { color: MACRO_COLORS.carbs }]}>C {macros[1].current}g</Text>
              <Text style={[styles.macroLine, { color: MACRO_COLORS.fat }]}>F {macros[2].current}g</Text>
              {macros[3].current > 0 && (
                <Text style={[styles.macroLine, { color: MACRO_COLORS.fiber }]}>Fb {macros[3].current}g</Text>
              )}
            </View>
          </>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 1 },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  goalText: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6 },
  placeholder: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  macroCenter: { alignItems: 'center', gap: 1 },
  macroLine: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});

// Spacing/FontSizes referenced for tree-shake guard
void Spacing;
void FontSizes;
