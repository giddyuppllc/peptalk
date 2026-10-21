/**
 * "YYYY-MM-DD" → a stable ISO timestamp, anchored to local noon.
 *
 * WHY LOCAL NOON
 * Naive `new Date('2026-05-17').toISOString()` parses the string as UTC
 * midnight, so a user east of UTC sees "2026-05-17" render as 2026-05-17 and a
 * user west of UTC sees the same string render as the previous day. Noon local
 * keeps the date component stable across DST and every UTC offset.
 * (2026-05-17 timezone fix.)
 *
 * WHY IT LIVES IN lib/
 * It was a private helper in src/services/milestones.ts, which imports
 * useDoseLogStore and therefore the whole native storage chain — so it could
 * not be unit-tested without mocking three stores to prove one thing. Same
 * reasoning that keeps src/lib/products.ts RN-free.
 *
 * WHY IT CANNOT THROW
 * An invalid Date does not produce a bad string from `toISOString()` — it
 * throws `RangeError: Invalid time value`. The old implementation's
 * not-YYYY-MM-DD branch handed its input straight to `toISOString()`, so the
 * fallback path was the crashing path, reached exactly when the value was
 * malformed. Callers pass stored values (`p.endDate`, a check-in `date`,
 * `last.date`) that nothing validates at the boundary, and the app has a single
 * error boundary at the root — so one bad row replaced the whole app with the
 * fallback screen.
 */

/** ISO string, or null when the Date is not a date. */
function safeIso(dt: Date): string | null {
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

export function dateOnlyToIsoLocal(iso: string): string {
  if (typeof iso !== 'string') return new Date().toISOString();

  const [y, mo, d] = iso.split('-').map(Number);

  // Not a bare date string — could be a full ISO timestamp, could be rubbish.
  // Try it, and fall back to now rather than throwing, which is what the
  // non-string branch above already does.
  if (!y || !mo || !d) return safeIso(new Date(iso)) ?? new Date().toISOString();

  return safeIso(new Date(y, mo - 1, d, 12, 0, 0, 0)) ?? new Date().toISOString();
}
