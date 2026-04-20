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
        Alert.alert('Sign in required', 'Please log in to use AI meal plans.');
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
        Alert.alert('No plan generated', 'The AI could not build a plan. Try different inputs.');
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
    for (const meal of pd.meals) {
      const mealType = MEAL_TYPE_MAP[meal.type.toLowerCase()] ?? 'snack';
      addMeal({
        id: `plan-${pd.day}-${mealType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: today,
        timestamp: now,
        mealType,
        foods: [],
        quickLog: {
          description: `${meal.name} — ${meal.description}`,
          calories: meal.calories,
          proteinGrams: meal.proteinGrams,
          carbsGrams: meal.carbsGrams,
          fatGrams: meal.fatGrams,
        },
      });
    }
    Alert.alert('Logged', `All ${pd.meals.length} meals from Day ${pd.day} added to today.`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>AI Meal Plan</Text>
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
            {pd.meals.map((meal, i) => (
              <View key={i} style={[styles.mealRow, { borderTopColor: t.cardBorder }]}>
                <Text style={[styles.mealType, { color: accent.deep }]}>{meal.type.toUpperCase()}</Text>
                <Text style={[styles.mealName, { color: t.text }]}>{meal.name}</Text>
                <Text style={[styles.mealDesc, { color: t.textSecondary }]}>{meal.description}</Text>
                <Text style={[styles.mealMacros, { color: t.textSecondary }]}>
                  {meal.calories}kcal · {meal.proteinGrams}P · {meal.carbsGrams}C · {meal.fatGrams}F
                </Text>
              </View>
            ))}
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
    paddingVertical: Spacing.sm,
  },
  mealType: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  mealName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  mealDesc: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  mealMacros: {
    fontSize: FontSizes.xs,
    marginTop: 4,
  },
});
