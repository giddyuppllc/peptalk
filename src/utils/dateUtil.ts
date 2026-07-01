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
