/**
 * Grouping and counting for the grocery list.
 *
 * useGroceryStore had full CRUD — addItem, removeItem, toggleItem,
 * clearChecked — and its only consumer anywhere was the logout handler
 * clearing it. No screen, no route, no way to add an item or tick one off,
 * while the AI meal-plan card advertised "7-day meals + grocery list".
 *
 * Pure so it can be tested without an RN runtime, same as mealDiary and
 * healthPlan.
 */
import type { GroceryItem, GroceryCategory } from '../types/fitness';

/** Aisle order — roughly how a shop is walked, not alphabetical. */
export const GROCERY_CATEGORY_ORDER: GroceryCategory[] = [
  'produce',
  'protein',
  'dairy',
  'grains',
  'supplements',
  'other',
];

export const GROCERY_CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: 'Produce',
  protein: 'Protein',
  dairy: 'Dairy',
  grains: 'Grains',
  supplements: 'Supplements',
  other: 'Other',
};

export interface GroceryGroup {
  category: GroceryCategory;
  label: string;
  items: GroceryItem[];
}

/**
 * Group by category in aisle order, unchecked first within each group.
 *
 * Checked items sink rather than disappear: they are the record of what you
 * already picked up, and hiding them makes a half-done shop look untouched.
 * An unrecognised category still renders under "Other" — an item on the list
 * and nowhere on screen is the failure this whole screen exists to end.
 */
export function groupGroceryItems(items: readonly GroceryItem[]): GroceryGroup[] {
  const known = new Set(GROCERY_CATEGORY_ORDER);
  const groups: GroceryGroup[] = [];

  const sortWithin = (list: GroceryItem[]) =>
    [...list].sort((a, b) => Number(a.checked) - Number(b.checked));

  for (const category of GROCERY_CATEGORY_ORDER) {
    const inCat = items.filter(
      (i) => i.category === category || (category === 'other' && !known.has(i.category)),
    );
    if (inCat.length === 0) continue;
    groups.push({
      category,
      label: GROCERY_CATEGORY_LABELS[category],
      items: sortWithin(inCat),
    });
  }
  return groups;
}

export interface GrocerySummary {
  total: number;
  checked: number;
  remaining: number;
}

export function grocerySummary(items: readonly GroceryItem[]): GrocerySummary {
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  return { total, checked, remaining: total - checked };
}
