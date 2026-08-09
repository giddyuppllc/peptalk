/**
 * Nutrition — Master Refactor Plan v3.1 §6.
 *
 * Protein-focal home for the vertical:
 *   1. Photo food log (top, Pro-gated) — §6.3
 *   2. Protein ring + secondary macro bars — §6.1
 *   3. Water tracker (cup-tap) — §6.5
 *   4. Appetite log chips — §6.6
 *   5. AI meal plan ribbon (Pro) — §6.7
 *   6. Macro target settings shortcut — §6.2
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Alert } from '../../src/lib/alert';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  V3DetailShell,
  GlassCard,
  MacroRing,
  MacroBar,
} from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useMealStore } from '../../src/store/useMealStore';
import {
  groupMealsByType,
  mealMacros,
  mealSummaryLine,
  fmtGrams,
  MEAL_TYPE_LABELS,
} from '../../src/lib/mealDiary';
import type { MealEntry } from '../../src/types/fitness';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import {
  useAppetiteLogStore,
  APPETITE_OPTIONS,
  type AppetiteState,
} from '../../src/store/useAppetiteLogStore';

const CUP_OZ = 8;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function NutritionScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const today = todayKey();
  const targets = useMealStore((s) => s.targets);
  // Select primitives only — `getDailyTotals(today)` and `getByDate(today)`
  // returned a fresh object/array on every call, which made Zustand's
  // useSyncExternalStore see a new reference each render → infinite loop.
  const meals = useMealStore((s) => s.meals);
  const waterOz = useMealStore((s) => s.getWater(today));
  const logWater = useMealStore((s) => s.logWater);
  const getDailyTotals = useMealStore((s) => s.getDailyTotals);
  const removeMeal = useMealStore((s) => s.removeMeal);
  // Derived from the already-selected `meals` array rather than calling
  // getMealsByDate in the selector — that returns a fresh array each call and
  // Zustand's reference check would loop, the same bug the comment above
  // describes for getDailyTotals.
  const todaysMeals = useMemo(
    () => meals.filter((m) => m.date === today),
    [meals, today],
  );
  const totals = useMemo(
    () => getDailyTotals(today),
    [getDailyTotals, today, meals],
  );
  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = tier !== 'free';
  const logAppetite = useAppetiteLogStore((s) => s.logAppetite);
  const appetiteEntries = useAppetiteLogStore((s) => s.entries);
  const recentAppetite = useMemo(
    () => appetiteEntries.filter((e) => e.loggedAt.slice(0, 10) === today),
    [appetiteEntries, today],
  );

  const proteinDeficit = useMemo(() => {
    if (!targets.proteinGrams) return null;
    const gap = targets.proteinGrams - totals.proteinGrams;
    if (gap <= 0) return null;
    return Math.round(gap);
  }, [totals.proteinGrams, targets.proteinGrams]);

  const observation =
    proteinDeficit !== null
      ? `Protein is ${proteinDeficit}g short of target. I can suggest meals.`
      : "You're tracking on protein. Nice.";

  const cups = Math.floor(waterOz / CUP_OZ);
  const cupTarget = Math.max(1, Math.round((targets.waterOz ?? 64) / CUP_OZ));

  const handlePhotoLog = () => {
    tapMedium();
    if (!isPro) {
      router.push('/subscription' as never);
      return;
    }
    // Pro path uses the existing photo meal-scan flow.
    router.push('/nutrition/meal-scan' as never);
  };

  const handleAppetite = (state: AppetiteState) => {
    tapLight();
    logAppetite(state);
  };

  return (
    <V3DetailShell
      title="Nutrition"
      observation={observation}
      intent="nutrition_overview"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {/* §6.3 — Photo food log */}
        <Pressable
          onPress={handlePhotoLog}
          accessibilityRole="button"
          accessibilityLabel={
            isPro
              ? 'Snap a photo to log a meal'
              : 'Upgrade to Pro to log meals by photo'
          }
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.photoRow}>
              <View
                style={[
                  styles.cameraBubble,
                  {
                    backgroundColor: isPro
                      ? t.isDark
                        ? 'rgba(201,136,90,0.22)'
                        : 'rgba(229,146,141,0.22)'
                      : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <Ionicons
                  name="camera-outline"
                  size={26}
                  color={
                    t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  {isPro ? 'Snap to log a meal' : 'Photo log — Pro feature'}
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? 'Aimee estimates macros, you confirm before it writes.'
                    : 'Upgrade to log meals by photo — Aimee estimates macros.'}
                </Text>
              </View>
              {!isPro ? (
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.30)'
                        : 'rgba(229,146,141,0.25)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.4,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              ) : null}
            </View>
          </GlassCard>
        </Pressable>

        {/* Scan fridge / pantry — drill into the kitchen-inventory flow. */}
        <Pressable
          onPress={() => {
            tapMedium();
            if (!isPro) {
              router.push('/subscription' as never);
              return;
            }
            router.push('/pantry' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            isPro
              ? 'Open your pantry to view, add, scan, or remove items'
              : 'Upgrade to Pro for your pantry'
          }
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.photoRow}>
              <View
                style={[
                  styles.cameraBubble,
                  {
                    backgroundColor: isPro
                      ? t.isDark
                        ? 'rgba(201,136,90,0.22)'
                        : 'rgba(229,146,141,0.22)'
                      : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <Ionicons
                  name="scan-outline"
                  size={26}
                  color={
                    t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  {isPro ? 'My pantry' : 'My pantry — Pro feature'}
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? 'View, add, scan, or remove what’s in your fridge, freezer & pantry — then build meals from it.'
                    : 'Upgrade to Pro to track your kitchen and build meals from what you have.'}
                </Text>
              </View>
              {!isPro ? (
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.30)'
                        : 'rgba(229,146,141,0.25)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.4,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              ) : null}
            </View>
          </GlassCard>
        </Pressable>

        {/* §6.1 — Protein-focal macros */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.macroLayout}>
            <MacroRing
              current={totals.proteinGrams}
              target={targets.proteinGrams}
              unit="g"
              label="PROTEIN"
              size={128}
            />
            <View style={{ flex: 1, marginLeft: 18 }}>
              <MacroBar
                kind="carbs"
                current={totals.carbsGrams}
                target={targets.carbsGrams}
              />
              <MacroBar
                kind="fat"
                current={totals.fatGrams}
                target={targets.fatGrams}
              />
              <MacroBar
                kind="fiber"
                current={totals.fiberGrams ?? 0}
                target={targets.fiberGrams ?? 30}
              />
            </View>
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: (t.colors as any).divider as string },
            ]}
          />
          <View style={styles.calsRow}>
            <Text
              style={[
                styles.calsLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              CALORIES
            </Text>
            <Text
              style={[
                styles.calsValue,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              {Math.round(totals.calories)} / {Math.round(targets.calories)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/nutrition/targets' as never);
            }}
            style={styles.targetsLink}
            accessibilityRole="button"
            accessibilityLabel="Adjust macro targets"
          >
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
                textDecorationLine: 'underline',
              }}
            >
              Adjust targets
            </Text>
          </Pressable>
        </GlassCard>

        {/* §6.5 — Water tracker */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.rowBetween}>
            <Text
              style={[
                styles.cardTitle,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.headlineMale
                    : t.typography.headlineFemale,
                },
              ]}
            >
              Water
            </Text>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
              }}
            >
              {cups} / {cupTarget} cups
            </Text>
          </View>
          <View style={styles.cupRow}>
            {Array.from({ length: cupTarget }).map((_, i) => {
              const filled = i < cups;
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    tapLight();
                    if (i < cups) {
                      // Tap a filled cup to remove
                      logWater(today, -CUP_OZ);
                    } else {
                      logWater(today, CUP_OZ);
                    }
                  }}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    filled
                      ? `Remove cup ${i + 1}`
                      : `Add cup ${i + 1}`
                  }
                >
                  <Ionicons
                    name={filled ? 'water' : 'water-outline'}
                    size={26}
                    color={
                      filled
                        ? t.isDark
                          ? ((t.colors as any).accentCognac as string)
                          : ((t.colors as any).accentBabyBlue as string)
                        : (t.colors.textSecondary as string)
                    }
                  />
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* §6.6 — Appetite log */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.cardTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            How's your appetite?
          </Text>
          <View style={styles.appetiteRow}>
            {APPETITE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.state}
                onPress={() => handleAppetite(opt.state)}
                style={[
                  styles.appetiteChip,
                  {
                    borderColor: (t.colors as any)[opt.tintKey] as string,
                    backgroundColor: 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Log ${opt.label.toLowerCase()} appetite`}
              >
                <Text style={styles.appetiteEmoji}>{opt.emoji}</Text>
                <Text
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyMedium,
                    fontSize: 12,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {recentAppetite.length > 0 ? (
            <Text
              style={{
                marginTop: 10,
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 11,
              }}
            >
              {recentAppetite.length} entr
              {recentAppetite.length === 1 ? 'y' : 'ies'} logged today.
            </Text>
          ) : null}
        </GlassCard>

        {/* §6.7 — AI meal plan (Pro) */}
        <Pressable
          onPress={() => {
            tapLight();
            if (!isPro) {
              router.push('/subscription' as never);
              return;
            }
            router.push('/nutrition/meal-plan' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            isPro
              ? 'Open AI meal plan'
              : 'Upgrade to Pro to unlock AI meal plan'
          }
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  AI meal plan
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  {isPro
                    ? '7-day meals from your targets.'
                    : 'Pro: weekly plan from your targets, dietary prefs, and cycle.'}
                </Text>
              </View>
              {!isPro ? (
                <View
                  style={[
                    styles.proPill,
                    {
                      backgroundColor: t.isDark
                        ? 'rgba(201,136,90,0.30)'
                        : 'rgba(229,146,141,0.25)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.4,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
              )}
            </View>
          </GlassCard>
        </Pressable>

        {/* Build a meal from pantry — drill into the inventory-based composer. */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push('/nutrition/custom-meal-from-pantry' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Build a meal from your pantry"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Build from your pantry
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  Pick what you're cooking — macros auto-tally and pantry quantities decrement.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {/* Grocery list — useGroceryStore had full CRUD and no screen at all;
            its only consumer was the logout handler clearing it. This is the
            door. */}
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/nutrition/grocery' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open your grocery list"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.photoRow}>
              <View
                style={[
                  styles.cameraBubble,
                  { backgroundColor: t.isDark ? 'rgba(201,136,90,0.22)' : 'rgba(229,146,141,0.22)' },
                ]}
              >
                <Ionicons
                  name="cart-outline"
                  size={24}
                  color={
                    t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Grocery list
                </Text>
                <Text
                  style={[
                    styles.cardSub,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  What you need, by aisle. Tick things off as you shop.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {/* ── Today's food diary ─────────────────────────────────────────────
            This screen selected `meals` only to recompute the totals ring and
            never rendered a single one. useMealStore has always exposed
            getMealsByDate, updateMeal and removeMeal, and NONE of them had a
            caller in app/ — so food could be logged and then never seen,
            corrected, or deleted. A mistyped entry was permanent and invisible,
            and the only evidence it existed was a calorie ring that would not
            add up.

            Tapping a meal opens food-search with `mealId`, which that screen
            has always implemented ("if provided, adds to an existing meal
            entry") and which nothing ever sent. This is the door. */}
        <TodaysMealsSection
          meals={todaysMeals}
          onOpenMeal={(meal) =>
            router.push(
              `/nutrition/food-search?mealId=${meal.id}&mealType=${meal.mealType}` as never,
            )
          }
          onDeleteMeal={(meal) => {
            Alert.alert(
              'Delete this entry?',
              `${MEAL_TYPE_LABELS[meal.mealType] ?? 'Meal'} — ${mealSummaryLine(meal)}`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    tapMedium();
                    removeMeal(meal.id);
                  },
                },
              ],
            );
          }}
          t={t}
        />

        {/* Quick logger entry — sends user to existing food search */}
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/nutrition/food-search' as never);
          }}
          style={[
            styles.cta,
            { backgroundColor: t.colors.textPrimary as string },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Log a meal"
        >
          <Ionicons
            name="add"
            size={18}
            color={t.colors.bgBase1 as string}
          />
          <Text
            style={{
              color: t.colors.bgBase1 as string,
              fontFamily: t.typography.bodyBold,
              fontSize: 13,
              letterSpacing: 0.3,
            }}
          >
            Log a meal
          </Text>
        </Pressable>
      </ScrollView>
    </V3DetailShell>
  );
}

/**
 * Today's logged meals, grouped by meal type.
 *
 * Tap a row to add to that meal (food-search?mealId=…, a path that has been
 * implemented and unreachable). Long-press to delete — removeMeal has existed
 * in the store since it was written with no caller anywhere in the app, so
 * until now a mistyped entry could not be removed.
 *
 * Long-press rather than a visible trash icon: the common action is "add to
 * this meal", and a delete control sitting next to it on a row-sized target is
 * how people destroy a day's logging by accident. The Alert names the meal it
 * is about to remove.
 */
function TodaysMealsSection({
  meals,
  onOpenMeal,
  onDeleteMeal,
  t,
}: {
  meals: MealEntry[];
  onOpenMeal: (meal: MealEntry) => void;
  onDeleteMeal: (meal: MealEntry) => void;
  t: ReturnType<typeof useV3Theme>;
}) {
  const groups = useMemo(() => groupMealsByType(meals), [meals]);

  return (
    <GlassCard style={styles.cardSpacing}>
      <View style={styles.diaryHeader}>
        <Text
          style={[
            styles.cardTitle,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.isDark ? t.typography.headlineMale : t.typography.headlineFemale,
            },
          ]}
        >
          Today&apos;s food
        </Text>
        {meals.length > 0 ? (
          <Text
            style={[
              styles.cardSub,
              { color: t.colors.textSecondary as string, fontFamily: t.typography.body },
            ]}
          >
            {meals.length} {meals.length === 1 ? 'entry' : 'entries'}
          </Text>
        ) : null}
      </View>

      {groups.length === 0 ? (
        <Text
          style={[
            styles.cardSub,
            { color: t.colors.textSecondary as string, fontFamily: t.typography.body },
          ]}
        >
          Nothing logged yet today. Anything you add shows up here, and you can
          tap it later to add more or fix it.
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.mealType} style={styles.diaryGroup}>
            <View style={styles.diaryGroupHeader}>
              <Text
                style={[
                  styles.diaryGroupLabel,
                  { color: t.colors.textPrimary as string, fontFamily: t.typography.label },
                ]}
              >
                {group.label.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.diaryGroupKcal,
                  { color: t.colors.textSecondary as string, fontFamily: t.typography.body },
                ]}
              >
                {Math.round(group.macros.calories)} kcal
              </Text>
            </View>

            {group.meals.map((meal) => {
              const m = mealMacros(meal);
              return (
                <Pressable
                  key={meal.id}
                  onPress={() => {
                    tapLight();
                    onOpenMeal(meal);
                  }}
                  onLongPress={() => onDeleteMeal(meal)}
                  delayLongPress={450}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.label}: ${mealSummaryLine(meal)}, ${Math.round(
                    m.calories,
                  )} calories. Tap to add to this meal, long press to delete.`}
                  style={[styles.diaryRow, { borderTopColor: t.colors.cardBorder as string }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.diaryRowTitle,
                        { color: t.colors.textPrimary as string, fontFamily: t.typography.body },
                      ]}
                    >
                      {mealSummaryLine(meal)}
                    </Text>
                    <Text
                      style={[
                        styles.diaryRowMacros,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      P {fmtGrams(m.proteinGrams)}g · C {fmtGrams(m.carbsGrams)}g · F{' '}
                      {fmtGrams(m.fatGrams)}g
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.diaryRowKcal,
                      { color: t.colors.textPrimary as string, fontFamily: t.typography.bodyBold },
                    ]}
                  >
                    {Math.round(m.calories)}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={t.colors.textSecondary as string}
                  />
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  diaryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  diaryGroup: { marginTop: 14 },
  diaryGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  diaryGroupLabel: { fontSize: 10, letterSpacing: 1.3 },
  diaryGroupKcal: { fontSize: 11 },
  diaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  diaryRowTitle: { fontSize: 14 },
  diaryRowMacros: { fontSize: 11, marginTop: 2 },
  diaryRowKcal: { fontSize: 14 },
  cardSpacing: { marginTop: 12 },
  cardTitle: {
    fontSize: 17,
  },
  cardSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  macroLayout: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Divider color is theme-driven at the call site so it adapts to both
  // palettes. Keep the layout-only styles here.
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  calsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calsLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  calsValue: {
    fontSize: 18,
  },
  targetsLink: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  appetiteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  appetiteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  appetiteEmoji: {
    fontSize: 14,
  },
  cta: {
    marginTop: 18,
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    gap: 8,
  },
});
