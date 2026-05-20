/**
 * Meal Plan — generate a multi-day AI meal plan tailored to the user's
 * macro targets, diet, and allergens. Pro-tier only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, FontSizes, BorderRadius, Colors } from '../../src/constants/theme';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { useMealStore } from '../../src/store/useMealStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import type { MealType } from '../../src/types/fitness';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';

interface PlannedMeal {
  type: string;
  name: string;
  description: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

interface PlannedDay {
  day: number;
  meals: PlannedMeal[];
}

const MEAL_TYPE_MAP: Record<string, MealType> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
  'pre-workout': 'pre_workout',
  'post-workout': 'post_workout',
};

export default function MealPlanScreenWrapper() {
  return (
    <PaywallGate feature="meal_plan">
      <MealPlanScreen />
    </PaywallGate>
  );
}

function MealPlanScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const macroTargets = useMealStore((s) => s.targets);
  const addMeal = useMealStore((s) => s.addMeal);
  const profile = useHealthProfileStore((s) => s.profile);

  const [days, setDays] = useState<3 | 5 | 7>(5);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<PlannedDay[] | null>(null);

  const dietType = profile.nutrition.dietType ?? 'balanced';
  const allergens = [
    ...(profile.medical?.allergies ?? []),
    ...(profile.nutrition?.foodAllergies ?? []),
  ];
  const goals = profile.primaryGoals ?? [];

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setPlan(null);
      const { supabase } = await import('../../src/services/supabase');
      const { data: { session } } = await (supabase as any).auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Sign in required', 'Please log in to generate a meal plan.');
        return;
      }
      const { data, error } = await (supabase as any).functions.invoke('aimee-plan', {
        body: {
          days,
          macroTargets: {
            calories: macroTargets.calories,
            proteinGrams: macroTargets.proteinGrams,
            carbsGrams: macroTargets.carbsGrams,
            fatGrams: macroTargets.fatGrams,
          },
          dietType,
          allergens,
          goals,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (!data?.plan || !Array.isArray(data.plan) || data.plan.length === 0) {
        Alert.alert('No plan generated', 'Couldn\'t build a plan with these inputs — try different goals or allergens.');
        return;
      }
      setPlan(data.plan);
    } catch (err: any) {
      Alert.alert('Generation failed', err?.message ?? 'Could not generate meal plan.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLogDay = (pd: PlannedDay) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    // Cap meals/day at 8 so a runaway plan can't insert 1000 rows.
    for (const meal of pd.meals.slice(0, 8)) {
      const rawType = typeof meal.type === 'string' ? meal.type.toLowerCase() : '';
      const mealType = MEAL_TYPE_MAP[rawType] ?? 'snack';
      // Clamp every LLM-emitted field. Mirrors sanitizeLogMeal quickLog
      // caps so this entry point can't bypass the daily-ring guard.
      const description = `${clampString(meal.name, 100) || 'Planned meal'} — ${clampString(meal.description, 200)}`.slice(0, 300);
      addMeal({
        id: `plan-${pd.day}-${mealType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: today,
        timestamp: now,
        mealType,
        foods: [],
        quickLog: {
          description,
          calories: clamp(meal.calories, 5000),
          proteinGrams: clamp(meal.proteinGrams, 500),
          carbsGrams: clamp(meal.carbsGrams, 1000),
          fatGrams: clamp(meal.fatGrams, 500),
        },
      });
    }
    Alert.alert('Logged', `All ${Math.min(pd.meals.length, 8)} meals from Day ${pd.day} added to today.`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Meal Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard variant="elevated" style={styles.card}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Plan length</Text>
          <View style={styles.daysRow}>
            {([3, 5, 7] as const).map((d) => {
              const active = days === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDays(d)}
                  style={[
                    styles.dayChip,
                    { backgroundColor: active ? accent.deep : t.surface, borderColor: active ? accent.deep : t.cardBorder },
                  ]}
                >
                  <Text style={[styles.dayChipText, { color: active ? '#fff' : t.text }]}>{d} days</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.infoText, { color: t.textSecondary }]}>
            Using your macro targets ({macroTargets.calories}kcal / {macroTargets.proteinGrams}P / {macroTargets.carbsGrams}C / {macroTargets.fatGrams}F) and diet preference ({dietType}).
            {allergens.length > 0 ? `  Avoiding: ${allergens.join(', ')}.` : ''}
          </Text>

          <GradientButton
            label={generating ? 'Generating…' : `Generate ${days}-day plan`}
            onPress={handleGenerate}
            colors={[accent.deep, accent.pastel]}
            style={{ marginTop: Spacing.md }}
          />
        </GlassCard>

        {generating && (
          <View style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color={accent.deep} />
            <Text style={[styles.infoText, { color: t.textSecondary, marginTop: 8 }]}>
              Building your plan…
            </Text>
          </View>
        )}

        {plan && plan.map((pd) => (
          <GlassCard key={pd.day} variant="elevated" style={styles.card}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayTitle, { color: t.text }]}>Day {pd.day}</Text>
              <TouchableOpacity
                onPress={() => handleLogDay(pd)}
                style={[styles.logBtn, { borderColor: accent.deep }]}
                accessibilityRole="button"
                accessibilityLabel={`Log all meals for Day ${pd.day}`}
              >
                <Text style={[styles.logBtnText, { color: accent.deep }]}>Log all</Text>
              </TouchableOpacity>
            </View>
            {pd.meals.map((meal, i) => {
              // Per-meal-type accent so breakfast / lunch / dinner / snacks
              // are visually distinct without inventing new colors.
              const mealColor =
                meal.type === 'breakfast' ? '#E89672' :
                meal.type === 'lunch'     ? '#6FA891' :
                meal.type === 'dinner'    ? '#9B86A4' :
                                            '#3E7CB1'; // snack / fallback
              return (
                <View key={i} style={[styles.mealRow, { borderTopColor: t.cardBorder }]}>
                  <View style={[styles.mealTypePill, { backgroundColor: `${mealColor}18`, borderColor: `${mealColor}55` }]}>
                    <Text style={[styles.mealTypePillText, { color: mealColor }]}>
                      {meal.type.charAt(0).toUpperCase() + meal.type.slice(1)}
                    </Text>
                  </View>
                  <Text style={[styles.mealName, { color: t.text }]}>{meal.name}</Text>
                  <Text style={[styles.mealDesc, { color: t.textSecondary }]}>{meal.description}</Text>
                  <View style={styles.macroPills}>
                    <View style={[styles.macroPill, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                      <Text style={[styles.macroPillNum, { color: t.text }]}>{meal.calories}</Text>
                      <Text style={[styles.macroPillUnit, { color: t.textSecondary }]}>cal</Text>
                    </View>
                    <View style={[styles.macroPill, { backgroundColor: 'rgba(111, 168, 145, 0.12)' }]}>
                      <Text style={[styles.macroPillNum, { color: '#4E836D' }]}>{meal.proteinGrams}g</Text>
                      <Text style={[styles.macroPillUnit, { color: '#4E836D' }]}>protein</Text>
                    </View>
                    <View style={[styles.macroPill, { backgroundColor: 'rgba(127, 179, 216, 0.14)' }]}>
                      <Text style={[styles.macroPillNum, { color: '#3E7CB1' }]}>{meal.carbsGrams}g</Text>
                      <Text style={[styles.macroPillUnit, { color: '#3E7CB1' }]}>carbs</Text>
                    </View>
                    <View style={[styles.macroPill, { backgroundColor: 'rgba(217, 140, 134, 0.14)' }]}>
                      <Text style={[styles.macroPillNum, { color: '#B06A66' }]}>{meal.fatGrams}g</Text>
                      <Text style={[styles.macroPillUnit, { color: '#B06A66' }]}>fat</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </GlassCard>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  daysRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dayChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  infoText: {
    fontSize: FontSizes.xs,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dayTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  logBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  logBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  mealRow: {
    borderTopWidth: 1,
    paddingVertical: Spacing.sm + 2,
    gap: 4,
  },
  mealTypePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 2,
  },
  mealTypePillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mealName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  mealDesc: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  macroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  macroPillNum: {
    fontSize: 12,
    fontWeight: '700',
  },
  macroPillUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
});
