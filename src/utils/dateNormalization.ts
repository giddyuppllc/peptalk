/**
 * Date normalization helpers — converts a moment-in-time into a stable
 * `YYYY-MM-DD` string anchored to the user's LOCAL date.
 *
 * Why: most stores key entries by date string. Naively using
 * `new Date().toISOString().slice(0, 10)` breaks at midnight in any
 * non-UTC timezone — a meal logged at 11:30 PM EST records as the
 * NEXT day in UTC, then disappears from "today's totals" until the
 * UTC clock catches up.
 *
 * Use these helpers instead of inline date math whenever a
 * persisted-by-date value is computed.
 */

/** Local-timezone YYYY-MM-DD for a given Date (defaults to now). */
export function toLocalDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's local date string. */
export function todayKey(): string {
  return toLocalDateKey(new Date());
}

/** Yesterday's local date string. Useful for late-night entries the user
 *  may want to back-date. */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateKey(d);
}

/**
 * Add or subtract N days from a YYYY-MM-DD key, preserving the local
 * timezone anchor. Works across DST boundaries (Date arithmetic is
 * timezone-aware by default).
 */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

/** Days between two date keys (b - a), positive when b is later. */
export function daysBetweenKeys(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  const dateA = new Date(ya, (ma ?? 1) - 1, da ?? 1).getTime();
  const dateB = new Date(yb, (mb ?? 1) - 1, db ?? 1).getTime();
  return Math.round((dateB - dateA) / (24 * 60 * 60 * 1000));
}

/** Validate that a string matches `YYYY-MM-DD` exactly. */
export function isValidDateKey(key: string | undefined | null): boolean {
  if (!key) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Validate that the resulting Date didn't roll over (e.g. Feb 30 → Mar 2).
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d;
}
