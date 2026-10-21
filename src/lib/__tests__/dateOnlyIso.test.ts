/**
 * A milestone date that is not a date must not throw.
 *
 * `dateOnlyToIsoLocal` is fed `p.endDate`, a check-in `date`, and `last.date` —
 * all stored values, none of them validated at the boundary. Its own
 * not-YYYY-MM-DD branch handed the value straight to `toISOString()`, and an
 * invalid Date does not return a bad string there: it throws
 * `RangeError: Invalid time value`.
 *
 * That branch is the one a malformed value arrives on, so the fallback path
 * was the crashing path. With a single root error boundary, that is the whole
 * app replaced by the fallback screen.
 */

import { dateOnlyToIsoLocal } from '../dateOnlyIso';

const NOT_DATES = [
  'nonsense',
  '',
  '   ',
  'yesterday',
  '0000-00-00',
  'NaN-NaN-NaN',
  '--',
  '2026-',
  'undefined',
  // Reaches the SECOND branch: y, mo and d are all truthy numbers, so the
  // not-a-date-string test passes, and `new Date(999999, 0, 1)` is still out of
  // range. Without this the guard on that line survived every mutation — every
  // other input above bails out one branch earlier.
  '999999-01-01',
  '275761-01-01',
];

describe('dateOnlyToIsoLocal', () => {
  it.each(NOT_DATES)('does not throw on %p', (bad) => {
    expect(() => dateOnlyToIsoLocal(bad)).not.toThrow();
  });

  it.each(NOT_DATES)('returns a parseable ISO timestamp for %p', (bad) => {
    const out = dateOnlyToIsoLocal(bad);
    expect(typeof out).toBe('string');
    expect(Number.isFinite(new Date(out).getTime())).toBe(true);
  });

  it('still anchors a real date to local noon', () => {
    // The whole reason this helper exists: naive parsing puts "2026-05-17" at
    // UTC midnight, which renders as the previous day west of UTC.
    const out = dateOnlyToIsoLocal('2026-05-17');
    const d = new Date(out);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(12);
  });

  it('accepts a full ISO timestamp through the fallback branch', () => {
    // "2026-05-17T08:30:00.000Z".split('-') gives a third part that is not a
    // number, so this takes the !d branch — which must still work, not just
    // not-crash.
    const out = dateOnlyToIsoLocal('2026-05-17T08:30:00.000Z');
    expect(new Date(out).toISOString()).toBe('2026-05-17T08:30:00.000Z');
  });

  it('does not throw on a non-string, whatever the type says', () => {
    // The signature says string; the callers read stored values.
    for (const v of [null, undefined, 42, {}, []]) {
      expect(() => dateOnlyToIsoLocal(v as unknown as string)).not.toThrow();
    }
  });
});
