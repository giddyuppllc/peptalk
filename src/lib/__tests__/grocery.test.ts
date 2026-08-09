/**
 * The grocery list — a store with full CRUD and no screen.
 *
 * useGroceryStore ships addItem / removeItem / toggleItem / clearChecked, and
 * the ONLY consumer anywhere in the app was the logout handler clearing it.
 * No screen, no route, no way to add an item or tick one off — while the AI
 * meal-plan card advertised "7-day meals + grocery list, from your targets."
 */
import {
  GROCERY_CATEGORY_ORDER,
  GROCERY_CATEGORY_LABELS,
  groupGroceryItems,
  grocerySummary,
} from '../grocery';
import type { GroceryItem } from '../../types/fitness';

const item = (over: Partial<GroceryItem> = {}): GroceryItem => ({
  id: 'g1',
  name: 'Spinach',
  category: 'produce',
  checked: false,
  ...over,
});

describe('aisle grouping', () => {
  it('orders by aisle, not alphabetically', () => {
    const items = [
      item({ id: '1', category: 'other', name: 'Foil' }),
      item({ id: '2', category: 'produce', name: 'Kale' }),
      item({ id: '3', category: 'dairy', name: 'Milk' }),
    ];
    expect(groupGroceryItems(items).map((g) => g.category)).toEqual([
      'produce',
      'dairy',
      'other',
    ]);
  });

  it('drops empty aisles', () => {
    expect(groupGroceryItems([item()])).toHaveLength(1);
  });

  it('sinks checked items rather than hiding them', () => {
    // They are the record of what you already picked up. Hiding them makes a
    // half-done shop look untouched.
    const items = [
      item({ id: 'a', name: 'Done', checked: true }),
      item({ id: 'b', name: 'Todo', checked: false }),
    ];
    expect(groupGroceryItems(items)[0].items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('NEVER loses an item with an unknown category', () => {
    // An item on the list and nowhere on screen is the failure this screen
    // exists to end.
    const items = [item({ id: 'x', category: 'frozen' as any })];
    const shown = groupGroceryItems(items).flatMap((g) => g.items.map((i) => i.id));
    expect(shown).toContain('x');
  });

  it('shows every item exactly once', () => {
    const items = GROCERY_CATEGORY_ORDER.map((c, i) =>
      item({ id: `i${i}`, category: c }),
    );
    const shown = groupGroceryItems(items).flatMap((g) => g.items.map((i) => i.id));
    expect(shown).toHaveLength(items.length);
    expect(new Set(shown).size).toBe(items.length);
  });

  it('does not mutate the input', () => {
    const items = [item({ id: 'a', checked: true }), item({ id: 'b' })];
    groupGroceryItems(items);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('handles an empty list', () => {
    expect(groupGroceryItems([])).toEqual([]);
  });

  it('every category has a label', () => {
    for (const c of GROCERY_CATEGORY_ORDER) expect(GROCERY_CATEGORY_LABELS[c]).toBeTruthy();
  });
});

describe('summary', () => {
  it('counts checked against total', () => {
    const items = [
      item({ id: '1', checked: true }),
      item({ id: '2', checked: false }),
      item({ id: '3', checked: false }),
    ];
    expect(grocerySummary(items)).toEqual({ total: 3, checked: 1, remaining: 2 });
  });

  it('is all zeroes for an empty list', () => {
    expect(grocerySummary([])).toEqual({ total: 0, checked: 0, remaining: 0 });
  });

  it('remaining never goes negative', () => {
    const items = [item({ checked: true })];
    const s = grocerySummary(items);
    expect(s.remaining).toBe(0);
    expect(s.checked).toBe(s.total);
  });
});
