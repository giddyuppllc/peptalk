/**
 * Verification harness for src/utils/mealMath.ts.
 *
 * `computeDailyTotals` drives every nutrition dashboard, macro ring,
 * weekly Aimee report, and adherence calc. Quiet defects (mis-typed
 * field, missing `?? 0`, sign flip) silently zero or NaN-poison real
 * meals.
 *
 * Run:
 *   npm run verify:mealmath
 */

import { computeDailyTotals } from '../src/utils/mealMath';
import type { MealEntry } from '../src/types/fitness';

interface Check {
  name: string;
  passed: boolean;
  expected?: unknown;
  got?: unknown;
}

const checks: Check[] = [];

function assertEq(name: string, got: unknown, expected: unknown) {
  checks.push({ name, passed: got === expected, expected, got });
}

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

const TODAY = '2026-05-17';
const OTHER_DAY = '2026-05-16';

function meal(over: Partial<MealEntry>): MealEntry {
  return {
    id: 'm-' + Math.random().toString(36).slice(2, 7),
    date: TODAY,
    mealType: 'lunch',
    foods: [],
    timestamp: new Date().toISOString(),
    ...over,
  } as MealEntry;
}

// ─── empty + filter ──────────────────────────────────────────────────────────

// 1. Empty list → all zeros
{
  const t = computeDailyTotals([], TODAY);
  assertEq('empty: calories 0', t.calories, 0);
  assertEq('empty: protein 0', t.proteinGrams, 0);
  assertEq('empty: micros 0', t.sodiumMg, 0);
}

// 2. Meals on other dates filtered out
{
  const t = computeDailyTotals([meal({
    date: OTHER_DAY,
    quickLog: { description: 'x', calories: 500, proteinGrams: 30, carbsGrams: 60, fatGrams: 20 },
  })], TODAY);
  assertEq('filter: other date excluded', t.calories, 0);
}

// 3. Sum across two meals same day
{
  const t = computeDailyTotals([
    meal({ quickLog: { description: 'a', calories: 200, proteinGrams: 10, carbsGrams: 25, fatGrams: 8 } }),
    meal({ quickLog: { description: 'b', calories: 400, proteinGrams: 20, carbsGrams: 50, fatGrams: 15 } }),
  ], TODAY);
  assertEq('sum: 2 quickLog meals — calories', t.calories, 600);
  assertEq('sum: 2 quickLog meals — protein', t.proteinGrams, 30);
}

// ─── quickLog only — micros stay 0 ───────────────────────────────────────────

{
  const t = computeDailyTotals([meal({
    quickLog: { description: 'x', calories: 500, proteinGrams: 30, carbsGrams: 60, fatGrams: 20 },
  })], TODAY);
  assertEq('quickLog: primary calories', t.calories, 500);
  assertEq('quickLog: primary protein', t.proteinGrams, 30);
  assertEq('quickLog: micro fiber stays 0', t.fiberGrams, 0);
  assertEq('quickLog: micro sodium stays 0', t.sodiumMg, 0);
}

// ─── itemized foods — full micro summation ───────────────────────────────────

{
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'chicken', servings: 1,
      calories: 200, proteinGrams: 30, carbsGrams: 0, fatGrams: 8,
      fiberGrams: 0, sodiumMg: 80, sugarGrams: 0, cholesterolMg: 90,
      saturatedFatGrams: 2, transFatGrams: 0, potassiumMg: 250,
      calciumMg: 15, ironMg: 1, vitaminAMcg: 10, vitaminCMg: 0,
    }],
  })], TODAY);
  assertEq('itemized: calories', t.calories, 200);
  assertEq('itemized: protein', t.proteinGrams, 30);
  assertEq('itemized: sodium', t.sodiumMg, 80);
  assertEq('itemized: cholesterol', t.cholesterolMg, 90);
  assertEq('itemized: potassium', t.potassiumMg, 250);
  assertEq('itemized: vitA', t.vitaminAMcg, 10);
}

// ─── missing optional macro → 0, not NaN ────────────────────────────────────

{
  // Itemized meal with `fiberGrams: undefined` (optional field omitted).
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'plain pasta', servings: 1,
      calories: 200, proteinGrams: 7, carbsGrams: 40, fatGrams: 1,
    } as any],
  })], TODAY);
  assertEq('missing micro: fiber → 0 not NaN', t.fiberGrams, 0);
  assertEq('missing micro: sodium → 0', t.sodiumMg, 0);
  // Primary macros that were provided still sum correctly
  assertEq('missing micro: primary calories unaffected', t.calories, 200);
}

// ─── NaN macro → 0 (defense against hostile / legacy data) ───────────────────

{
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'broken', servings: 1,
      calories: NaN as any, proteinGrams: 10, carbsGrams: 20, fatGrams: 5,
    } as any],
  })], TODAY);
  assertEq('NaN: calories→0 not propagated', t.calories, 0);
  assertEq('NaN: other macros unaffected', t.proteinGrams, 10);
}

// ─── Infinity macro → 0 ──────────────────────────────────────────────────────

{
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'busted', servings: 1,
      calories: Infinity as any, proteinGrams: 10, carbsGrams: 20, fatGrams: 5,
    } as any],
  })], TODAY);
  assertEq('Infinity: calories→0 not propagated', t.calories, 0);
}

// ─── string / undefined macro → 0 ────────────────────────────────────────────

{
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'undef', servings: 1,
      calories: undefined as any, proteinGrams: '30' as any, carbsGrams: null as any, fatGrams: 5,
    } as any],
  })], TODAY);
  assertEq('undefined → 0', t.calories, 0);
  // strings are not "number" → 0
  assertEq('string number → 0 (no implicit coerce)', t.proteinGrams, 0);
  assertEq('null → 0', t.carbsGrams, 0);
  assertEq('fat 5 still 5', t.fatGrams, 5);
}

// ─── mixed quickLog + itemized in same day ───────────────────────────────────

{
  const t = computeDailyTotals([
    meal({
      mealType: 'breakfast',
      quickLog: { description: 'oats', calories: 300, proteinGrams: 10, carbsGrams: 50, fatGrams: 8 },
    }),
    meal({
      mealType: 'lunch',
      foods: [{
        foodId: 'f1', foodName: 'chicken salad', servings: 1,
        calories: 500, proteinGrams: 40, carbsGrams: 30, fatGrams: 20,
        fiberGrams: 8, sodiumMg: 600,
      } as any],
    }),
  ], TODAY);
  assertEq('mixed: total calories 800', t.calories, 800);
  assertEq('mixed: total protein 50', t.proteinGrams, 50);
  // Fiber only from itemized
  assertEq('mixed: fiber from itemized', t.fiberGrams, 8);
  assertEq('mixed: sodium from itemized', t.sodiumMg, 600);
}

// ─── explicit 0 vs undefined — both yield 0 ─────────────────────────────────

{
  const t = computeDailyTotals([meal({
    foods: [{
      foodId: 'f1', foodName: 'zero-sodium', servings: 1,
      calories: 100, proteinGrams: 5, carbsGrams: 15, fatGrams: 2,
      sodiumMg: 0,
    } as any],
  })], TODAY);
  assertEq('explicit 0 sodium → 0 not undefined', t.sodiumMg, 0);
  assertTrue('explicit 0 sodium is finite number', Number.isFinite(t.sodiumMg));
}

// ─── many meals, no overflow / no NaN drift ─────────────────────────────────

{
  const meals: MealEntry[] = Array.from({ length: 100 }, (_, i) => meal({
    id: `m${i}`,
    quickLog: { description: 's', calories: 10, proteinGrams: 1, carbsGrams: 2, fatGrams: 0.5 },
  }));
  const t = computeDailyTotals(meals, TODAY);
  assertEq('100 quickLog meals — calories', t.calories, 1000);
  assertEq('100 quickLog meals — protein', t.proteinGrams, 100);
  // 100 * 0.5 = 50 (floating-point safe)
  assertTrue('100 quickLog meals — fat ≈ 50',
    Math.abs(t.fatGrams - 50) < 0.001, t.fatGrams);
}

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Meal math harness —');
console.log(`Total checks: ${checks.length}`);
console.log(`Passed:       ${passed}`);
console.log(`Failed:       ${failed.length}`);

if (failed.length > 0) {
  console.log('\nFailures:');
  for (const f of failed) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    got:      ${JSON.stringify(f.got)}`);
  }
  process.exit(1);
}

console.log('\n✓ All meal math checks passed.\n');
process.exit(0);
