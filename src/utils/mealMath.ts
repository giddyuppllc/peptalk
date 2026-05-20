/**
 * Pure macro/micro summation for meals on a given calendar date.
 *
 * Extracted from `useMealStore.getDailyTotals` so the math is testable
 * in plain Node (no zustand, no React). The store delegates to this
 * function; the test harness exercises it with hostile fixtures.
 *
 * Why this matters: every nutrition dashboard, macro ring, Aimee
 * weekly report, and adherence card reads from `getDailyTotals`. A
 * mis-typed field name (e.g. `protein` vs `proteinGrams`) or missing
 * `?? 0` guard silently zeroes or NaN-poisons real meals — invisible
 * until a user complains about wrong macros.
 *
 * Tested in `scripts/verify-meal-math.ts`. If you tweak a summand
 * here, mirror it there.
 */

import type { MealEntry } from '../types/fitness';

export interface DailyTotals {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  sodiumMg: number;
  sugarGrams: number;
  cholesterolMg: number;
  saturatedFatGrams: number;
  transFatGrams: number;
  potassiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitaminAMcg: number;
  vitaminCMg: number;
}

function zeroTotals(): DailyTotals {
  return {
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
    sodiumMg: 0,
    sugarGrams: 0,
    cholesterolMg: 0,
    saturatedFatGrams: 0,
    transFatGrams: 0,
    potassiumMg: 0,
    calciumMg: 0,
    ironMg: 0,
    vitaminAMcg: 0,
    vitaminCMg: 0,
  };
}

/** Coerce a possibly-undefined / NaN number to a safe 0. */
function safe(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Sum macros + micros across a set of meals filtered to one calendar
 * date. Meal entries with a `quickLog` use those four primary macros
 * only (micros stay 0 — quickLog has no per-micro fields). Meal
 * entries with itemized `foods[]` sum every field. Both paths apply
 * `?? 0` and `Number.isFinite` guards so a hostile or legacy row
 * with `undefined` / `NaN` doesn't poison the totals.
 */
export function computeDailyTotals(meals: MealEntry[], date: string): DailyTotals {
  const totals = zeroTotals();
  for (const meal of meals) {
    if (meal.date !== date) continue;
    if (meal.quickLog) {
      totals.calories += safe(meal.quickLog.calories);
      totals.proteinGrams += safe(meal.quickLog.proteinGrams);
      totals.carbsGrams += safe(meal.quickLog.carbsGrams);
      totals.fatGrams += safe(meal.quickLog.fatGrams);
    } else {
      for (const food of meal.foods) {
        totals.calories += safe(food.calories);
        totals.proteinGrams += safe(food.proteinGrams);
        totals.carbsGrams += safe(food.carbsGrams);
        totals.fatGrams += safe(food.fatGrams);
        totals.fiberGrams += safe(food.fiberGrams);
        totals.sodiumMg += safe(food.sodiumMg);
        totals.sugarGrams += safe(food.sugarGrams);
        totals.cholesterolMg += safe(food.cholesterolMg);
        totals.saturatedFatGrams += safe(food.saturatedFatGrams);
        totals.transFatGrams += safe(food.transFatGrams);
        totals.potassiumMg += safe(food.potassiumMg);
        totals.calciumMg += safe(food.calciumMg);
        totals.ironMg += safe(food.ironMg);
        totals.vitaminAMcg += safe(food.vitaminAMcg);
        totals.vitaminCMg += safe(food.vitaminCMg);
      }
    }
  }
  return totals;
}
