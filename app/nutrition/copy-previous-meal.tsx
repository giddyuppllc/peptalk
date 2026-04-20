/**
 * Copy Previous Meal — picks a meal from a past day and clones it into today.
 *
 * Route: /nutrition/copy-previous-meal
 * Params: mealType (target meal type for the copy)
 *
 * Flow:
 *   1. User picks a date from the past 14 days (only days with logged meals shown)
 *   2. User picks one of the meals logged on that day
 *   3. App clones it into today using the target mealType, then routes back
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealType } from '../../src/types/fitness';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  pre_workout: 'Pre-Workout',
  post_workout: 'Post-Workout',
};

const today = () => new Date().toISOString().slice(0, 10);

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CopyPreviousMealScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const { mealType: targetMealTypeParam } = useLocalSearchParams<{ mealType?: MealType }>();
  const targetMealType: MealType = (targetMealTypeParam as MealType) ?? 'lunch';

  const meals = useMealStore((state) => state.meals);
  const copyMealToDate = useMealStore((state) => state.copyMealToDate);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Group meals by date (last 14 days, excluding today)
  const dateGroups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const todayStr = today();

    const byDate: Record<string, typeof meals> = {};
    for (const meal of meals) {
      if (meal.date >= cutoffStr && meal.date < todayStr) {
        if (!byDate[meal.date]) byDate[meal.date] = [];
        byDate[meal.date].push(meal);
      }
    }
    return Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a));
  }, [meals]);

  const selectedDayMeals = selectedDate
    ? meals.filter((m) => m.date === selectedDate)
    : [];

  const handleCopy = (mealId: string) => {
    copyMealToDate(mealId, today(), targetMealType);
    router.back();
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: t.text }]}>Copy Previous Meal</Text>
          <Text style={[s.headerSub, { color: t.textSecondary }]}>
            → {MEAL_LABELS[targetMealType]} today
          </Text>
        </View>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {dateGroups.length === 0 ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIconCircle, { backgroundColor: `${accent.deep}14`, borderColor: `${accent.deep}33` }]}>
              <Ionicons name="time-outline" size={28} color={accent.deep} />
            </View>
            <Text style={[s.emptyTitle, { color: accent.deep }]}>
              Nothing to copy{'\n'}just yet.
            </Text>
            <Text style={[s.emptyDesc, { color: t.textSecondary }]}>
              Log a few meals first — they'll show up here so you can drop them into any day in two taps.
            </Text>
          </View>
        ) : (
          <>
            {/* Date selector strip */}
            <Text style={[s.sectionLabel, { color: t.textSecondary }]}>PICK A DAY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.dateStrip}
            >
              {dateGroups.map(([date, dayMeals]) => {
                const active = date === selectedDate;
                return (
                  <TouchableOpacity
                    key={date}
                    style={[
                      s.dateChip,
                      { backgroundColor: t.surface, borderColor: t.cardBorder },
                      active && { backgroundColor: accent.deep, borderColor: accent.deep },
                    ]}
                    onPress={() => setSelectedDate(date)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dateChipText, { color: t.text }, active && { color: '#fff' }]}>
                      {formatDateLabel(date)}
                    </Text>
                    <Text style={[s.dateChipMeta, { color: t.textSecondary }, active && { color: '#fff' }]}>
                      {dayMeals.length} meal{dayMeals.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Meal list for selected day */}
            {selectedDate && (
              <>
                <Text style={[s.sectionLabel, { color: t.textSecondary }]}>
                  PICK A MEAL TO COPY
                </Text>
                {selectedDayMeals.map((meal) => {
                  const totalCal = meal.foods.reduce((sum, f) => sum + f.calories, 0);
                  const totalP = meal.foods.reduce((sum, f) => sum + f.proteinGrams, 0);
                  const totalC = meal.foods.reduce((sum, f) => sum + f.carbsGrams, 0);
                  const totalF = meal.foods.reduce((sum, f) => sum + f.fatGrams, 0);
                  return (
                    <TouchableOpacity
                      key={meal.id}
                      style={[s.mealCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
                      onPress={() => handleCopy(meal.id)}
                      activeOpacity={0.85}
                    >
                      <View style={[s.mealIcon, { backgroundColor: `${accent.deep}18` }]}>
                        <Ionicons name="restaurant-outline" size={20} color={accent.deep} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.mealLabel, { color: t.text }]}>
                          {MEAL_LABELS[meal.mealType]}
                        </Text>
                        <Text
                          style={[s.mealFoodList, { color: t.textSecondary }]}
                          numberOfLines={2}
                        >
                          {meal.foods.map((f) => f.foodName).join(', ') || meal.quickLog?.description || 'Quick log'}
                        </Text>
                        <Text style={[s.mealMacros, { color: accent.deep }]}>
                          {Math.round(totalCal)} cal · {Math.round(totalP)}p · {Math.round(totalC)}c · {Math.round(totalF)}f
                        </Text>
                      </View>
                      <View style={[s.copyBtn, { backgroundColor: accent.deep }]}>
                        <Ionicons name="copy-outline" size={16} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginTop: 1,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 10,
    marginLeft: 4,
  },
  dateStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 12,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minWidth: 100,
  },
  dateChipText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  dateChipMeta: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: 10,
  },
  mealIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    marginBottom: 2,
  },
  mealFoodList: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginBottom: 4,
    lineHeight: 16,
  },
  mealMacros: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 6 },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    textAlign: 'center',
    lineHeight: 28,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
});
