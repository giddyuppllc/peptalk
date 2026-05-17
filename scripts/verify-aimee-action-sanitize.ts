/**
 * Hostile-payload harness for src/utils/aimeeActionSanitize.ts.
 *
 * Aimee's `client_action` payload is whatever the LLM emits. The model
 * can (and has) hallucinated:
 *   - negative or huge numbers
 *   - calendar-invalid dates like "2027-13-99"
 *   - enums it invented ("oral_irrigation", "second_breakfast")
 *   - giant strings, prototype-pollution shaped keys, missing fields
 *
 * Every sanitize* helper must either return a clamped, type-safe value
 * or `null` (reject). Crashing, throwing, or silently passing garbage
 * through to the local store is a regression.
 *
 * Run:
 *   npm run verify:sanitize
 *
 * Exits 0 on pass, 1 on any failure.
 */

import {
  clamp,
  clampString,
  isValidIsoDate,
  isValidHHmm,
  sanitizeLogDose,
  sanitizeLogMeal,
  sanitizeLogWater,
  sanitizeLogAppetite,
  sanitizeAddToPantry,
  sanitizeScheduleWorkout,
} from '../src/utils/aimeeActionSanitize';

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

function assertNull(name: string, got: unknown) {
  checks.push({ name, passed: got === null, expected: null, got });
}

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

// ─── primitives ─────────────────────────────────────────────────────────────

assertEq('clamp: NaN → min', clamp(NaN, 100), 0);
assertEq('clamp: -5 → min 0', clamp(-5, 100), 0);
assertEq('clamp: 1e9 → max', clamp(1e9, 100), 100);
assertEq('clamp: "42" → 42', clamp('42', 100), 42);
assertEq('clamp: undefined → 0', clamp(undefined, 100), 0);
assertEq('clamp: null → 0', clamp(null, 100), 0);
// Non-finite values are treated as garbage and coerced to `min`, not `max`.
// This matches the JSDoc contract on clamp(): "coerce non-finite to 0".
assertEq('clamp: Infinity → min (non-finite is rejected, not capped)', clamp(Infinity, 100), 0);
assertEq('clamp: -Infinity → min', clamp(-Infinity, 100), 0);
assertEq('clamp: object → 0', clamp({}, 100), 0);
assertEq('clamp: with custom min', clamp(-10, 100, -50), -10);

assertEq('isValidIsoDate: 2026-05-17 ✓', isValidIsoDate('2026-05-17'), true);
assertEq('isValidIsoDate: 2027-13-99 ✗', isValidIsoDate('2027-13-99'), false);
assertEq('isValidIsoDate: 2026-02-30 ✗ (no Feb 30)', isValidIsoDate('2026-02-30'), false);
assertEq('isValidIsoDate: empty ✗', isValidIsoDate(''), false);
assertEq('isValidIsoDate: number ✗', isValidIsoDate(20260517 as any), false);
assertEq('isValidIsoDate: null ✗', isValidIsoDate(null), false);
assertEq('isValidIsoDate: 2024-02-29 ✓ (leap)', isValidIsoDate('2024-02-29'), true);
assertEq('isValidIsoDate: 2025-02-29 ✗ (not leap)', isValidIsoDate('2025-02-29'), false);

assertEq('isValidHHmm: 09:30 ✓', isValidHHmm('09:30'), true);
assertEq('isValidHHmm: 24:00 ✗', isValidHHmm('24:00'), false);
assertEq('isValidHHmm: 12:60 ✗', isValidHHmm('12:60'), false);
assertEq('isValidHHmm: 9:30 ✗ (no leading zero)', isValidHHmm('9:30'), false);
assertEq('isValidHHmm: null ✗', isValidHHmm(null), false);

assertEq('clampString: trims + slices', clampString('   hello world   ', 5), 'hello');
assertEq('clampString: number → ""', clampString(42, 10), '');
assertEq('clampString: null → ""', clampString(null, 10), '');
assertEq('clampString: 10KB → bounded',
  clampString('x'.repeat(10_000), 100).length, 100);

// ─── log_dose ───────────────────────────────────────────────────────────────

// 1. missing peptideId → null
assertNull('dose: missing peptideId',
  sanitizeLogDose({ amount: 250, unit: 'mcg' }));

// 2. peptideId not a string → null
assertNull('dose: peptideId number',
  sanitizeLogDose({ peptideId: 12345, amount: 250 }));

// 3. amount = -1 → null
assertNull('dose: negative amount',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: -1 }));

// 4. amount = 0 → null
assertNull('dose: zero amount',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: 0 }));

// 5. amount = NaN → null
assertNull('dose: NaN amount',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: 'banana' }));

// 6. mcg > 100000 → null
assertNull('dose: mcg overflow',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: 999999, unit: 'mcg' }));

// 7. mg > 100 → null
assertNull('dose: mg overflow',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: 5000, unit: 'mg' }));

// 8. iu > 10000 → null
assertNull('dose: iu overflow',
  sanitizeLogDose({ peptideId: 'bpc-157', amount: 50000, unit: 'iu' }));

// 9. hostile unit "kilograms" → defaults to mcg
{
  const r = sanitizeLogDose({ peptideId: 'bpc-157', amount: 100, unit: 'kilograms' });
  assertEq('dose: hostile unit defaults to mcg', r?.unit, 'mcg');
}

// 10. hostile route → defaults subcutaneous
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, route: 'oral_irrigation',
  });
  assertEq('dose: hostile route defaults sub-Q', r?.route, 'subcutaneous');
}

// 11. case-insensitive enum acceptance
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, unit: 'MCG', route: 'ORAL',
  });
  assertEq('dose: MCG → mcg', r?.unit, 'mcg');
  assertEq('dose: ORAL → oral', r?.route, 'oral');
}

// 12. invalid date dropped, valid kept
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, date: '2027-13-99',
  });
  assertEq('dose: bad date dropped', r?.date, undefined);
}
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, date: '2026-05-17',
  });
  assertEq('dose: good date kept', r?.date, '2026-05-17');
}

// 13. invalid time dropped
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, time: '99:99',
  });
  assertEq('dose: bad time dropped', r?.time, undefined);
}

// 14. notes 50KB → clamped to 500
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, notes: 'x'.repeat(50_000),
  });
  assertTrue('dose: notes ≤500 chars', (r?.notes?.length ?? 0) <= 500);
}

// 15. injectionSite via `site` key
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 100, site: 'left thigh',
  });
  assertEq('dose: site → injectionSite', r?.injectionSite, 'left thigh');
}

// 16. happy path
{
  const r = sanitizeLogDose({
    peptideId: 'bpc-157', amount: 250, unit: 'mcg', route: 'subcutaneous',
  });
  assertEq('dose: happy path peptideId', r?.peptideId, 'bpc-157');
  assertEq('dose: happy path amount', r?.amount, 250);
}

// ─── log_meal ───────────────────────────────────────────────────────────────

// 17. happy path with totals
{
  const r = sanitizeLogMeal({
    date: '2026-05-17',
    mealType: 'lunch',
    title: 'Chicken salad',
    totals: { calories: 400, protein: 30, carbs: 20, fat: 15 },
  });
  assertEq('meal: date kept', r?.date, '2026-05-17');
  assertEq('meal: type kept', r?.mealType, 'lunch');
  assertEq('meal: title kept', r?.quickLog.description, 'Chicken salad');
  assertEq('meal: calories kept', r?.quickLog.calories, 400);
}

// 18. hostile mealType → snack default
{
  const r = sanitizeLogMeal({ mealType: 'second_breakfast' });
  assertEq('meal: bad type → snack', r?.mealType, 'snack');
}

// 19. bad date → today (not crashed)
{
  const r = sanitizeLogMeal({ date: '2027-13-99' });
  assertTrue('meal: bad date replaced w/ today',
    /^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? ''));
}

// 20. items > 20 → capped at 20
{
  const items = Array.from({ length: 100 }, (_, i) => ({
    foodName: `food-${i}`, calories: 100, protein: 10, carbs: 10, fat: 5,
  }));
  const r = sanitizeLogMeal({ items });
  assertEq('meal: items capped at 20', r?.foods.length, 20);
}

// 21. per-item poison values clamped
{
  const r = sanitizeLogMeal({
    items: [{ foodName: 'doomburger', calories: 999_999, protein: 99_999, carbs: 99_999, fat: 99_999 }],
  });
  assertTrue('meal: item calories ≤3000', (r?.foods[0]?.calories ?? 0) <= 3000);
  assertTrue('meal: item protein ≤300', (r?.foods[0]?.proteinGrams ?? 0) <= 300);
  assertTrue('meal: item carbs ≤500', (r?.foods[0]?.carbsGrams ?? 0) <= 500);
  assertTrue('meal: item fat ≤300', (r?.foods[0]?.fatGrams ?? 0) <= 300);
}

// 22. totals poisoning
{
  const r = sanitizeLogMeal({
    totals: { calories: 1e9, protein: 1e9, carbs: 1e9, fat: 1e9 },
  });
  assertTrue('meal: totals.calories ≤5000', (r?.quickLog.calories ?? 0) <= 5000);
  assertTrue('meal: totals.protein ≤500', (r?.quickLog.proteinGrams ?? 0) <= 500);
}

// 23. notes string clamped
{
  const r = sanitizeLogMeal({ notes: 'x'.repeat(10_000) });
  assertTrue('meal: notes ≤500', (r?.notes?.length ?? 0) <= 500);
}

// 24. servings 0 → 1 (fallback)
{
  const r = sanitizeLogMeal({
    items: [{ foodName: 'eggs', servings: 0 }],
  });
  assertEq('meal: servings 0 → 1', r?.foods[0]?.servings, 1);
}

// 25. servings 999 capped
{
  const r = sanitizeLogMeal({
    items: [{ foodName: 'eggs', servings: 999 }],
  });
  assertTrue('meal: servings ≤50', (r?.foods[0]?.servings ?? 0) <= 50);
}

// 26. supports `protein` / `proteinGrams` aliases
{
  const r = sanitizeLogMeal({
    items: [{ foodName: 'eggs', protein: 10, proteinGrams: 999 }],
  });
  // both reasonable; just verify no crash + ≤300
  assertTrue('meal: protein alias clamped', (r?.foods[0]?.proteinGrams ?? 0) <= 300);
}

// ─── log_water ──────────────────────────────────────────────────────────────

// 27. ounces -1 → null
assertNull('water: negative ounces', sanitizeLogWater({ ounces: -1 }));

// 28. ounces 9999 → null
assertNull('water: huge ounces', sanitizeLogWater({ ounces: 9999 }));

// 29. ounces NaN → null
assertNull('water: NaN ounces', sanitizeLogWater({ ounces: 'one liter' }));

// 30. ounces 12 → rounded
{
  const r = sanitizeLogWater({ ounces: 12.7 });
  assertEq('water: rounded', r?.ounces, 13);
}

// 31. bad date → today
{
  const r = sanitizeLogWater({ ounces: 16, date: '2027-13-99' });
  assertTrue('water: bad date replaced',
    /^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? ''));
}

// ─── log_appetite ───────────────────────────────────────────────────────────

// 32. valid
{
  const r = sanitizeLogAppetite({ state: 'hungry' });
  assertEq('appetite: hungry', r?.state, 'hungry');
}

// 33. uppercase coerced
{
  const r = sanitizeLogAppetite({ state: 'FULL' });
  assertEq('appetite: FULL → full', r?.state, 'full');
}

// 34. hostile state → null
assertNull('appetite: hostile state',
  sanitizeLogAppetite({ state: 'starving_to_death' }));

// 35. notes clamped to 200
{
  const r = sanitizeLogAppetite({ state: 'hungry', notes: 'x'.repeat(5000) });
  assertTrue('appetite: notes ≤200', (r?.notes?.length ?? 0) <= 200);
}

// ─── add_to_pantry ──────────────────────────────────────────────────────────

// 36. empty items array
{
  const r = sanitizeAddToPantry({ items: [] });
  assertEq('pantry: empty array', r.length, 0);
}

// 37. >50 items capped
{
  const r = sanitizeAddToPantry({
    items: Array.from({ length: 200 }, (_, i) => ({ name: `food-${i}` })),
  });
  assertEq('pantry: items capped at 50', r.length, 50);
}

// 38. item missing name → dropped
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'eggs' }, { quantity: 5 }, { name: 'milk' }],
  });
  assertEq('pantry: nameless item dropped', r.length, 2);
}

// 39. hostile quantity 1e10 → capped at 10000
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', quantity: 1e10 }],
  });
  assertTrue('pantry: qty ≤10000', (r[0]?.quantity ?? 0) <= 10000);
}

// 40. negative quantity → defaults to 1
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', quantity: -5 }],
  });
  assertEq('pantry: negative qty → 1', r[0]?.quantity, 1);
}

// 41. hostile unit "tablespoons" → 'each'
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', unit: 'tablespoons' }],
  });
  assertEq('pantry: bad unit → each', r[0]?.unit, 'each');
}

// 42. hostile storage → 'pantry'
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', storageLocation: 'attic' }],
  });
  assertEq('pantry: bad storage → pantry', r[0]?.storageLocation, 'pantry');
}

// 43. very long name capped
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'x'.repeat(10_000) }],
  });
  assertTrue('pantry: name ≤120', (r[0]?.name.length ?? 0) <= 120);
}

// 44. category clamped
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', category: 'x'.repeat(500) }],
  });
  assertTrue('pantry: category ≤40', (r[0]?.category?.length ?? 0) <= 40);
}

// 45. fractional qty rounded to 2 decimals
{
  const r = sanitizeAddToPantry({
    items: [{ name: 'rice', quantity: 2.34567 }],
  });
  assertEq('pantry: qty 2 decimals', r[0]?.quantity, 2.35);
}

// ─── schedule_workout ───────────────────────────────────────────────────────

// 46. happy path
{
  const r = sanitizeScheduleWorkout({
    startedAt: '2026-05-17T10:00:00.000Z',
    durationMinutes: 45,
    workoutName: 'Leg day',
  });
  assertEq('workout: name kept', r?.workoutName, 'Leg day');
  assertEq('workout: duration kept', r?.durationMinutes, 45);
}

// 47. negative duration → 0
{
  const r = sanitizeScheduleWorkout({ durationMinutes: -999 });
  assertEq('workout: negative duration → 0', r?.durationMinutes, 0);
}

// 48. 10000-min duration → 240 cap
{
  const r = sanitizeScheduleWorkout({ durationMinutes: 10000 });
  assertEq('workout: huge duration → 240', r?.durationMinutes, 240);
}

// 49. NaN duration → 0
{
  const r = sanitizeScheduleWorkout({ durationMinutes: 'forever' });
  assertEq('workout: NaN duration → 0', r?.durationMinutes, 0);
}

// 50. fractional duration → floored
{
  const r = sanitizeScheduleWorkout({ durationMinutes: 45.99 });
  assertEq('workout: fractional duration → 45', r?.durationMinutes, 45);
}

// 51. missing workoutName → 'Workout'
{
  const r = sanitizeScheduleWorkout({ durationMinutes: 30 });
  assertEq('workout: missing name → Workout', r?.workoutName, 'Workout');
}

// 52. notes clamped to 500
{
  const r = sanitizeScheduleWorkout({
    durationMinutes: 30, notes: 'x'.repeat(5000),
  });
  assertTrue('workout: notes ≤500', (r?.notes?.length ?? 0) <= 500);
}

// 53. derives date from startedAt
{
  const r = sanitizeScheduleWorkout({
    startedAt: '2026-05-17T10:00:00.000Z',
    durationMinutes: 30,
  });
  assertEq('workout: date derived from startedAt', r?.date, '2026-05-17');
}

// 54. hostile startedAt → falls back to now (string)
{
  const r = sanitizeScheduleWorkout({
    startedAt: 12345,
    durationMinutes: 30,
  });
  assertTrue('workout: bad startedAt → string',
    typeof r?.startedAt === 'string' && r.startedAt.length > 0);
}

// ─── Crash-safety smoke ─────────────────────────────────────────────────────

// 55. each sanitizer survives `{}`
assertTrue('dose: survives {}',
  ((): boolean => { try { sanitizeLogDose({}); return true; } catch { return false; } })());
assertTrue('meal: survives {}',
  ((): boolean => { try { sanitizeLogMeal({}); return true; } catch { return false; } })());
assertTrue('water: survives {}',
  ((): boolean => { try { sanitizeLogWater({}); return true; } catch { return false; } })());
assertTrue('appetite: survives {}',
  ((): boolean => { try { sanitizeLogAppetite({}); return true; } catch { return false; } })());
assertTrue('pantry: survives {}',
  ((): boolean => { try { sanitizeAddToPantry({}); return true; } catch { return false; } })());
assertTrue('workout: survives {}',
  ((): boolean => { try { sanitizeScheduleWorkout({}); return true; } catch { return false; } })());

// 56. each sanitizer survives prototype-shaped keys
assertTrue('dose: survives __proto__ key',
  ((): boolean => {
    try {
      sanitizeLogDose({ peptideId: 'bpc-157', amount: 100, __proto__: { polluted: true } } as any);
      return true;
    } catch { return false; }
  })());

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Aimee action sanitize harness —');
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

console.log('\n✓ All sanitize checks passed.\n');
process.exit(0);
