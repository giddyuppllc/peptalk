/**
 * Date utilities — shared across stores and services.
 *
 * All cycle/log data is date-anchored (YYYY-MM-DD string) not
 * timestamp-anchored. Centralizing these helpers means we never
 * accidentally introduce a timezone bug by letting one store use
 * UTC and another use local time.
 *
 * Convention: `toDateKey` uses LOCAL time — a meal logged at 11 PM
 * in NYC belongs to today's local date, not tomorrow's UTC date.
 * For fixed UTC anchoring (cycle computation, integrations sync),
 * use `toDateKeyUTC`.
 */

/** Local-time YYYY-MM-DD. Use for user-facing "today" semantics. */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC YYYY-MM-DD. Use when aligning across devices / services. */
export function toDateKeyUTC(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a Date anchored at UTC noon (tz-safe). */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Days between two YYYY-MM-DD keys. Rounded to avoid DST edge cases. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (parseDateKey(b).getTime() - parseDateKey(a).getTime()) / (24 * 60 * 60 * 1000),
  );
}

/** Add N days to a YYYY-MM-DD key and return the new key. */
export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateKeyUTC(d);
}
