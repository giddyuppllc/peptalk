/**
 * The health-plan screen — a feature that was complete except for a way in.
 *
 * usePlanStore has twelve actions; NINE had no caller anywhere in the app.
 * `generateHealthPlan` in llmService had none either. The store's only consumer
 * was the logout handler clearing it. There was no route and no screen.
 *
 * Meanwhile Aimee tells users: "Once your profile is set, I can create a plan
 * combining: Weekly workout schedule · Meal plan framework with macro targets ·
 * Peptide protocol timing · Daily check-in reminders."
 *
 * So the app promised the plan, held a store to keep one in, and shipped a
 * generator to write one — with nowhere for any of it to surface.
 */
import {
  DAY_LABELS,
  ITEM_TYPE_META,
  todayDayOfWeek,
  sortItemsByTime,
  planSummary,
} from '../healthPlan';
import type { HealthPlanItem } from '../../types';

const item = (over: Partial<HealthPlanItem> = {}): HealthPlanItem => ({
  id: 'i1',
  dayOfWeek: 1,
  time: '07:00',
  type: 'checkin',
  title: 'Morning Check-In',
  description: 'Log mood, energy, sleep',
  completed: false,
  ...over,
});

describe('day labelling', () => {
  it('is indexed the same way as Date.getDay and HealthPlanItem.dayOfWeek', () => {
    // 0 = Sunday in both. An off-by-one here shows the user the wrong day's
    // schedule, which looks like the plan being wrong rather than the label.
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe('Sunday');
    expect(DAY_LABELS[1]).toBe('Monday');
    expect(DAY_LABELS[6]).toBe('Saturday');
  });

  it('todayDayOfWeek matches the local calendar day', () => {
    const d = new Date('2026-08-09T12:00:00');
    expect(todayDayOfWeek(d)).toBe(d.getDay());
    expect(DAY_LABELS[todayDayOfWeek(d)]).toBe('Sunday');
  });

  it('is in range for every day', () => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 7, 2 + i);
      const dow = todayDayOfWeek(d);
      expect(dow).toBeGreaterThanOrEqual(0);
      expect(dow).toBeLessThan(7);
      expect(DAY_LABELS[dow]).toBeTruthy();
    }
  });
});

describe('every item type can render', () => {
  it.each(['workout', 'meal', 'protocol', 'checkin', 'custom'] as const)(
    '%s has a label and an icon',
    (type) => {
      // A missing entry crashes the row on `meta.label`, and the type union is
      // the store's, not this file's — so a new type added there must land here.
      expect(ITEM_TYPE_META[type]?.label).toBeTruthy();
      expect(ITEM_TYPE_META[type]?.icon).toBeTruthy();
    },
  );
});

describe('ordering a day', () => {
  it('sorts by clock time', () => {
    const items = [
      item({ id: 'c', time: '18:00' }),
      item({ id: 'a', time: '07:00' }),
      item({ id: 'b', time: '12:30' }),
    ];
    expect(sortItemsByTime(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not reorder on a malformed time', () => {
    // String comparison is only valid for zero-padded HH:mm. "7:00" would sort
    // AFTER "18:00" and silently rearrange someone's day, so anything
    // malformed goes to the end instead of interleaving on a bad comparison.
    const items = [item({ id: 'bad', time: '7:00' }), item({ id: 'ok', time: '18:00' })];
    expect(sortItemsByTime(items).map((i) => i.id)).toEqual(['ok', 'bad']);
  });

  it('never drops or duplicates an item', () => {
    const items = [
      item({ id: 'a', time: '09:00' }),
      item({ id: 'b', time: 'nonsense' }),
      item({ id: 'c', time: '06:00' }),
    ];
    const out = sortItemsByTime(items);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((i) => i.id)).size).toBe(3);
  });

  it('does not mutate the input', () => {
    const items = [item({ id: 'b', time: '18:00' }), item({ id: 'a', time: '07:00' })];
    sortItemsByTime(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('handles an empty day', () => {
    expect(sortItemsByTime([])).toEqual([]);
  });
});

describe('progress', () => {
  it('counts completed against total', () => {
    const schedule = [
      item({ id: '1', completed: true }),
      item({ id: '2', completed: true }),
      item({ id: '3', completed: false }),
      item({ id: '4', completed: false }),
    ];
    expect(planSummary(schedule)).toEqual({ total: 4, completed: 2, percent: 50 });
  });

  it('is 0% for an empty plan, not NaN', () => {
    // 0/0 renders as "NaN%" and a bar of width "NaN%", which on some layouts
    // takes the full width and reads as a finished plan.
    expect(planSummary([])).toEqual({ total: 0, completed: 0, percent: 0 });
  });

  it('is 100% when everything is done', () => {
    expect(planSummary([item({ completed: true })]).percent).toBe(100);
  });

  it('rounds to a whole number', () => {
    const schedule = [item({ id: '1', completed: true }), item({ id: '2' }), item({ id: '3' })];
    expect(planSummary(schedule).percent).toBe(33);
  });

  it('agrees with the store: completed / total', () => {
    // usePlanStore.getWeeklyProgress computes the same ratio. A screen showing
    // "8 of 12 done" beside a bar drawn from a different calculation is a bug
    // nobody can explain, so the two must not drift.
    const schedule = Array.from({ length: 12 }, (_, i) =>
      item({ id: `i${i}`, completed: i < 8 }),
    );
    const s = planSummary(schedule);
    expect(s.completed).toBe(8);
    expect(s.total).toBe(12);
    expect(s.percent).toBe(Math.round((8 / 12) * 100));
  });
});
