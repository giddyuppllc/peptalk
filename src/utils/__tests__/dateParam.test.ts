/**
 * `?date=` back-dating.
 *
 * The calendar day sheet has always appended `?date=YYYY-MM-DD` to its
 * Quick-Add buttons, but nutrition read no search params at all — so tapping
 * "Log meal" on a past day showed today and logged against today. The param
 * was written by one component and read by nobody.
 *
 * This pins the validator, because a bad `?date=` must never reach a record:
 * a date on a meal is data, and a wrong one is worse than a missing one.
 */
import { parseDateParam, isToday, formatDateKeyLong, todayLocalISO } from '../dateUtil';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('parseDateParam', () => {
  it('accepts a real past date', () => {
    const past = daysAgo(3);
    expect(parseDateParam(past)).toBe(past);
  });

  it('accepts today', () => {
    expect(parseDateParam(todayLocalISO())).toBe(todayLocalISO());
  });

  it('rejects a future date — it cannot have been lived yet', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(parseDateParam(tomorrow)).toBeNull();
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    // new Date(2026, 1, 31) silently becomes March 3rd. That must not become
    // the date on a meal record.
    expect(parseDateParam('2026-02-31')).toBeNull();
    expect(parseDateParam('2026-13-01')).toBeNull();
  });

  const badInputs: [unknown, string][] = [
    ['', 'empty'],
    ['24-08-2026', 'wrong order'],
    ['2026/08/24', 'wrong separator'],
    ['today', 'a word'],
    ['2026-8-4', 'unpadded'],
    [undefined, 'missing'],
    [null, 'null'],
    [20260824, 'a number'],
  ];
  it.each(badInputs)('rejects %p (%s)', (input) => {
    expect(parseDateParam(input)).toBeNull();
  });

  it('trims surrounding whitespace rather than failing on it', () => {
    const past = daysAgo(1);
    expect(parseDateParam(`  ${past}  `)).toBe(past);
  });
});

describe('date display helpers', () => {
  it('knows today from any other day', () => {
    expect(isToday(todayLocalISO())).toBe(true);
    expect(isToday(daysAgo(1))).toBe(false);
  });

  it('formats a key the way the rest of the app does', () => {
    // Matches DaySummarySheet / check-in: "Monday, August 24"
    expect(formatDateKeyLong('2026-08-24')).toBe('Monday, August 24');
  });

  it('formats from the local calendar date, not UTC', () => {
    // A naive new Date('2026-08-24') parses as UTC midnight and renders as the
    // 23rd anywhere west of Greenwich — which would label a back-dated log with
    // the wrong day.
    expect(formatDateKeyLong('2026-01-01')).toContain('January 1');
  });
});
