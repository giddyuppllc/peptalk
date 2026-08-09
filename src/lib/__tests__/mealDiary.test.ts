/**
 * The food diary — logged meals you can finally see, edit and delete.
 *
 * useMealStore has always exposed getMealsByDate, updateMeal and removeMeal.
 * None of them had a caller in app/. The nutrition screen selected `meals`
 * only to recompute the totals ring, and rendered the ring. So a user could
 * log food and never see it again: a mistyped entry was permanent and
 * invisible, and the only evidence was a calorie total that would not add up.
 *
 * These cover the arithmetic, because totals that disagree with the ring above
 * them are exactly the kind of bug someone notices and cannot explain.
 */
import {
  mealMacros,
  mealSummaryLine,
  groupMealsByType,
  sumMacros,
  fmtGrams,
  MEAL_TYPE_ORDER,
  MEAL_TYPE_LABELS,
} from '../mealDiary';
import type { MealEntry } from '../../types/fitness';

const food = (name: string, cal: number, p = 0, c = 0, f = 0) => ({
  foodId: name,
  foodName: name,
  servings: 1,
  calories: cal,
  proteinGrams: p,
  carbsGrams: c,
  fatGrams: f,
});

const meal = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1',
  date: '2026-08-09',
  mealType: 'breakfast',
  foods: [food('Eggs', 200, 18)],
  timestamp: '2026-08-09T08:00:00.000Z',
  ...over,
});

describe('macros for one meal', () => {
  it('sums itemised foods', () => {
    const m = meal({ foods: [food('Eggs', 200, 18, 2, 14), food('Toast', 120, 4, 22, 1)] });
    expect(mealMacros(m)).toEqual({
      calories: 320,
      proteinGrams: 22,
      carbsGrams: 24,
      fatGrams: 15,
    });
  });

  it('uses quickLog INSTEAD of foods, never both', () => {
    // A meal is either itemised or quick-logged. Adding them would
    // double-count; ignoring quickLog would report 0 for every quick entry,
    // which is the likelier mistake because `foods` is the field you see first.
    const m = meal({
      foods: [food('Eggs', 200, 18)],
      quickLog: { description: 'Diner breakfast', calories: 700, proteinGrams: 30, carbsGrams: 60, fatGrams: 35 },
    });
    expect(mealMacros(m).calories).toBe(700);
    expect(mealMacros(m).proteinGrams).toBe(30);
  });

  it('handles an empty or missing food list', () => {
    expect(mealMacros(meal({ foods: [] })).calories).toBe(0);
    expect(mealMacros(meal({ foods: undefined as any })).calories).toBe(0);
  });

  it('treats missing macro fields as zero rather than NaN', () => {
    // A NaN here propagates into the group total and renders as "NaN kcal".
    const m = meal({ foods: [{ foodId: 'x', foodName: 'X', servings: 1 } as any] });
    const r = mealMacros(m);
    expect(Number.isFinite(r.calories)).toBe(true);
    expect(r.calories).toBe(0);
  });
});

describe('the summary line', () => {
  it('prefers the quick-log description', () => {
    const m = meal({ quickLog: { description: 'Diner breakfast', calories: 1, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 } });
    expect(mealSummaryLine(m)).toBe('Diner breakfast');
  });

  it('lists food names, truncating with a count', () => {
    const m = meal({ foods: [food('A', 1), food('B', 1), food('C', 1), food('D', 1)] });
    expect(mealSummaryLine(m)).toBe('A, B, C +1');
  });

  it('never renders an empty string', () => {
    // An empty row is untappable-looking and hides a real entry.
    expect(mealSummaryLine(meal({ foods: [] }))).toBe('No items');
  });
});

describe('grouping', () => {
  it('orders groups by time of day, not insertion order', () => {
    const meals = [
      meal({ id: '1', mealType: 'dinner' }),
      meal({ id: '2', mealType: 'breakfast' }),
      meal({ id: '3', mealType: 'lunch' }),
    ];
    expect(groupMealsByType(meals).map((g) => g.mealType)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
  });

  it('drops empty meal types', () => {
    // Six headings with five blank makes a logged day look mostly empty.
    const groups = groupMealsByType([meal({ mealType: 'lunch' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Lunch');
  });

  it('totals each group', () => {
    const meals = [
      meal({ id: '1', mealType: 'lunch', foods: [food('A', 300, 20)] }),
      meal({ id: '2', mealType: 'lunch', foods: [food('B', 250, 15)] }),
    ];
    const [lunch] = groupMealsByType(meals);
    expect(lunch.meals).toHaveLength(2);
    expect(lunch.macros.calories).toBe(550);
    expect(lunch.macros.proteinGrams).toBe(35);
  });

  it('NEVER loses a meal with an unexpected type', () => {
    // The whole point of this screen is that a logged meal is visible. A meal
    // in the store and nowhere on screen is the bug being fixed, so an
    // unrecognised mealType lands in "Other" rather than being filtered away.
    const meals = [meal({ id: '1', mealType: 'brunch' as any }), meal({ id: '2' })];
    const groups = groupMealsByType(meals);
    const shown = groups.flatMap((g) => g.meals.map((m) => m.id));
    expect(shown).toContain('1');
    expect(shown).toContain('2');
    expect(groups.some((g) => g.label === 'Other')).toBe(true);
  });

  it('every meal appears exactly once', () => {
    const meals = MEAL_TYPE_ORDER.map((mt, i) => meal({ id: `m${i}`, mealType: mt }));
    const shown = groupMealsByType(meals).flatMap((g) => g.meals.map((m) => m.id));
    expect(shown).toHaveLength(meals.length);
    expect(new Set(shown).size).toBe(meals.length);
  });

  it('an empty day yields no groups', () => {
    expect(groupMealsByType([])).toEqual([]);
  });

  it('every meal type has a label', () => {
    for (const mt of MEAL_TYPE_ORDER) {
      expect(MEAL_TYPE_LABELS[mt]).toBeTruthy();
    }
  });
});

describe('the diary total matches the ring above it', () => {
  it('group totals sum to the day total', () => {
    // If these ever disagree the user sees a diary that does not add up to
    // their calorie ring, with no way to tell which one is lying.
    const meals = [
      meal({ id: '1', mealType: 'breakfast', foods: [food('A', 300, 20, 10, 5)] }),
      meal({ id: '2', mealType: 'lunch', foods: [food('B', 500, 40, 30, 12)] }),
      meal({
        id: '3',
        mealType: 'dinner',
        quickLog: { description: 'Out', calories: 700, proteinGrams: 30, carbsGrams: 60, fatGrams: 25 },
      }),
    ];
    const groups = groupMealsByType(meals);
    const fromGroups = sumMacros(groups.map((g) => g.macros));
    const fromMeals = sumMacros(meals.map(mealMacros));
    expect(fromGroups).toEqual(fromMeals);
    expect(fromGroups.calories).toBe(1500);
    expect(fromGroups.proteinGrams).toBe(90);
  });
});

describe('gram formatting', () => {
  it('keeps one decimal below 1g so trace amounts do not read as zero', () => {
    expect(fmtGrams(0.4)).toBe('0.4');
    expect(fmtGrams(0)).toBe('0');
    expect(fmtGrams(-1)).toBe('0');
  });

  it('rounds at or above 1g', () => {
    expect(fmtGrams(1.4)).toBe('1');
    expect(fmtGrams(22.6)).toBe('23');
  });
});
