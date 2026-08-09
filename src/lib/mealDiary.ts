/**
 * Summarising logged meals for the food diary.
 *
 * THE FEATURE THIS BELONGS TO
 * useMealStore has always exposed `getMealsByDate`, `updateMeal` and
 * `removeMeal`. Not one of them had a UI consumer:
 *
 *   getMealsByDate   no caller anywhere in app/
 *   updateMeal       reachable only via food-search?mealId, which nothing sent
 *   removeMeal       no caller anywhere in app/
 *
 * The nutrition screen selected `meals` purely to recompute daily totals, and
 * rendered the totals. So you could log food and then never see it, change it,
 * or delete it — a mistyped entry was permanent and invisible. Every part of
 * the machinery to fix that already existed; the screen to drive it did not.
 *
 * The arithmetic lives here rather than in the component because totals that
 * disagree with the ring above them are the kind of bug people notice and
 * cannot explain, and a sum inside a useMemo cannot be tested.
 */
import type { MealEntry, MealType } from '../types/fitness';

export interface MealMacros {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

/** Display order. Follows the day, with the workout slots where they fall. */
export const MEAL_TYPE_ORDER: MealType[] = [
  'breakfast',
  'pre_workout',
  'lunch',
  'post_workout',
  'dinner',
  'snack',
];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
};

/**
 * Macros for one meal.
 *
 * A meal is EITHER itemised foods OR a quickLog — the store lets a user enter
 * totals without itemising. Summing both would double-count, and summing only
 * `foods` silently reports 0 for every quick-logged meal, which is the more
 * likely mistake since `foods` is the field you notice first.
 */
export function mealMacros(meal: MealEntry): MealMacros {
  if (meal.quickLog) {
    return {
      calories: meal.quickLog.calories || 0,
      proteinGrams: meal.quickLog.proteinGrams || 0,
      carbsGrams: meal.quickLog.carbsGrams || 0,
      fatGrams: meal.quickLog.fatGrams || 0,
    };
  }
  return (meal.foods ?? []).reduce<MealMacros>(
    (sum, f) => ({
      calories: sum.calories + (f.calories || 0),
      proteinGrams: sum.proteinGrams + (f.proteinGrams || 0),
      carbsGrams: sum.carbsGrams + (f.carbsGrams || 0),
      fatGrams: sum.fatGrams + (f.fatGrams || 0),
    }),
    { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  );
}

/**
 * One line describing what the meal was, for the collapsed row.
 * Quick-logs use their description; itemised meals list the food names.
 */
export function mealSummaryLine(meal: MealEntry, maxItems = 3): string {
  if (meal.quickLog?.description) return meal.quickLog.description;
  const names = (meal.foods ?? []).map((f) => f.foodName).filter(Boolean);
  if (names.length === 0) return 'No items';
  const shown = names.slice(0, maxItems).join(', ');
  return names.length > maxItems ? `${shown} +${names.length - maxItems}` : shown;
}

export interface MealGroup {
  mealType: MealType;
  label: string;
  meals: MealEntry[];
  macros: MealMacros;
}

/**
 * Group a day's meals by type, in display order, dropping empty slots.
 *
 * Only non-empty groups are returned: rendering six headings with five of them
 * blank makes a logged day look mostly empty, and an empty diary should be one
 * clear empty state rather than a list of nothings.
 */
export function groupMealsByType(meals: readonly MealEntry[]): MealGroup[] {
  const groups: MealGroup[] = [];
  for (const mealType of MEAL_TYPE_ORDER) {
    const inType = meals.filter((m) => m.mealType === mealType);
    if (inType.length === 0) continue;
    groups.push({
      mealType,
      label: MEAL_TYPE_LABELS[mealType],
      meals: inType,
      macros: sumMacros(inType.map(mealMacros)),
    });
  }
  // Anything with an unrecognised mealType still has to appear — a meal that
  // exists in the store and nowhere on screen is the bug this file exists for.
  const known = new Set(MEAL_TYPE_ORDER);
  const orphans = meals.filter((m) => !known.has(m.mealType));
  if (orphans.length > 0) {
    groups.push({
      mealType: orphans[0].mealType,
      label: 'Other',
      meals: orphans,
      macros: sumMacros(orphans.map(mealMacros)),
    });
  }
  return groups;
}

export function sumMacros(list: readonly MealMacros[]): MealMacros {
  return list.reduce<MealMacros>(
    (a, b) => ({
      calories: a.calories + b.calories,
      proteinGrams: a.proteinGrams + b.proteinGrams,
      carbsGrams: a.carbsGrams + b.carbsGrams,
      fatGrams: a.fatGrams + b.fatGrams,
    }),
    { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  );
}

/**
 * The food rows to store when turning a logged meal into a reusable template.
 *
 * `saveMealAsTemplate` used to read `source.foods` directly, so saving a
 * QUICK-LOGGED meal produced a template with zero calories, zero macros and an
 * empty food list — silently. No error, just a row in My Meals that logs as
 * nothing when tapped. Quick-logs are not rare: the AI recipe generator, the
 * meal scanner, voice-log and Aimee's log_meal all write them.
 *
 * A quick-log becomes ONE food row rather than staying a quickLog, because
 * logMealTemplate rebuilds a meal from `foods` and an empty list would log
 * nothing. `fallbackName` covers a quick-log saved with no description.
 *
 * Lives here rather than in the store so it can be tested without an RN
 * runtime — same reason the rest of this file does.
 */
export function templateFoodRows(
  meal: Pick<MealEntry, 'id' | 'foods' | 'quickLog'>,
  fallbackName: string,
): MealEntry['foods'] {
  if (meal.foods && meal.foods.length > 0) return meal.foods.map((f) => ({ ...f }));
  if (!meal.quickLog) return [];
  return [
    {
      foodId: `quicklog-${meal.id}`,
      foodName: meal.quickLog.description || fallbackName,
      servings: 1,
      calories: meal.quickLog.calories || 0,
      proteinGrams: meal.quickLog.proteinGrams || 0,
      carbsGrams: meal.quickLog.carbsGrams || 0,
      fatGrams: meal.quickLog.fatGrams || 0,
    },
  ];
}

/** Round for display without turning 0.4 g of fat into a bare "0". */
export function fmtGrams(n: number): string {
  if (n <= 0) return '0';
  return n < 1 ? n.toFixed(1) : String(Math.round(n));
}
