/**
 * Date helpers for user-facing "today" semantics.
 *
 * Meals and other logs are keyed by a YYYY-MM-DD date string. The
 * daily-intake read side derives "today" from LOCAL time
 * (getFullYear/getMonth/getDate), so the WRITE side must stamp the same
 * local date — otherwise a meal logged in the evening (US) gets
 * tomorrow's UTC date and vanishes from today's totals.
 *
 * Always use todayLocalISO() when recording the date a user logged
 * something "today"; never new Date().toISOString().slice(0, 10) (UTC).
 */

/** Local-time YYYY-MM-DD for "today". */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Validate a `?date=` navigation param.
 *
 * The calendar's day sheet has always appended `?date=YYYY-MM-DD` to its
 * Quick-Add buttons, but nutrition and workouts never read search params at
 * all — so tapping "Log meal" on a past day silently logged it against today.
 *
 * Returns the key only when it is a real calendar date that is not in the
 * future; anything else returns null so the caller falls back to today.
 * Deliberately strict: a bad param must not become a bad date on a record.
 */
export function parseDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  // Rejects impossible dates that Date would otherwise roll over (2026-02-31).
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;

  // A future date cannot have been lived yet; treat it as a bad param.
  if (s > todayLocalISO()) return null;

  return s;
}

/** True when the key is today — used to keep "Today's …" copy honest. */
export function isToday(dateKey: string): boolean {
  return dateKey === todayLocalISO();
}

/** "Monday, August 24" — matches the format the day sheet and check-in use. */
export function formatDateKeyLong(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
