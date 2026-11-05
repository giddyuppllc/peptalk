/**
 * Dose reminder cadence — the ONE definition of "which days does this
 * protocol remind on", shared by:
 *   - the native app (src/services/notificationService.ts turns it into
 *     expo-notifications triggers), and
 *   - the web-push sender (supabase/functions/web-dose-reminders), which has
 *     no OS scheduler and decides every few minutes what is due.
 *
 * Pure TypeScript, no React Native or Deno APIs, so Metro, Jest and Deno all
 * import the same file. Change the cadence here and both platforms change.
 *
 * Weekdays are JS convention: 0 = Sunday … 6 = Saturday.
 */

export type DoseCadence =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekdays: number[] }
  /** Every 14 days from the anchor date (YYYY-MM-DD), or from today without one. */
  | { kind: 'biweekly'; anchor: string | null };

/** Parse YYYY-MM-DD into [y, m, d]; null when missing or malformed. */
export function parseDateKey(dateStr?: string | null): [number, number, number] | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Weekday (0=Sun) of a calendar date, independent of any time zone. */
export function weekdayOf(dateKey: string): number | null {
  const p = parseDateKey(dateKey);
  if (!p) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

/** Whole days from a to b (calendar dates). */
export function daysBetween(a: string, b: string): number | null {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  if (!pa || !pb) return null;
  return Math.round(
    (Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86_400_000,
  );
}

/**
 * The cadence for a protocol frequency. Mirrors what native has always
 * scheduled (see the history in notificationService.buildTriggersForFrequency):
 * multi-day weekly cadences start on the protocol's start weekday; with no
 * anchor they fall back to Monday; unknown frequencies fall back to daily.
 */
export function doseCadence(frequency: string, anchorDate?: string | null): DoseCadence {
  const anchorWeekday = anchorDate ? weekdayOf(anchorDate) : null;
  const start = anchorWeekday ?? 1; // Monday
  const shift = (days: number) => (start + days) % 7;

  switch (frequency) {
    case 'daily':
      return { kind: 'daily' };
    case 'weekly':
    case 'custom':
      return { kind: 'weekly', weekdays: [start] };
    case 'biweekly':
      return { kind: 'biweekly', anchor: anchorDate && parseDateKey(anchorDate) ? anchorDate : null };
    case 'biw': // 2x per week — start weekday + 3 days later
    case 'twice_weekly':
      return { kind: 'weekly', weekdays: [start, shift(3)] };
    case 'tiw': // 3x per week — start + 2 + 4
    case 'thrice_weekly':
    case 'triweekly':
      return { kind: 'weekly', weekdays: [start, shift(2), shift(4)] };
    case 'eod': // OS has no every-other-day repeat: ~4x/week from the start weekday
    case 'every_other_day':
      return { kind: 'weekly', weekdays: [start, shift(2), shift(4), shift(6)] };
    default:
      return { kind: 'daily' };
  }
}

/** Does this cadence remind on the given local calendar date? */
export function remindsOn(cadence: DoseCadence, dateKey: string): boolean {
  const wd = weekdayOf(dateKey);
  if (wd == null) return false;
  switch (cadence.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return cadence.weekdays.includes(wd);
    case 'biweekly': {
      if (!cadence.anchor) return false; // native anchors to "today" at schedule time; the server stores the anchor
      const n = daysBetween(cadence.anchor, dateKey);
      return n != null && n >= 0 && n % 14 === 0;
    }
  }
}

/** Parse "HH:MM" (24h). */
export function parseTime(time: string): { hours: number; minutes: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((time ?? '').trim());
  return m ? { hours: Number(m[1]), minutes: Number(m[2]) } : null;
}

// ─── Time zones ────────────────────────────────────────────────────────────

/** The calendar date (YYYY-MM-DD) and minutes-past-midnight at `at` in `timeZone`. */
export function localParts(at: Date, timeZone: string): { dateKey: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * The instant at which local wall-clock `dateKey HH:MM` happens in `timeZone`.
 * Two-pass offset correction, so it is right across DST changes (a time that
 * does not exist on a spring-forward day resolves to the next valid instant).
 */
export function zonedInstant(dateKey: string, hours: number, minutes: number, timeZone: string): Date | null {
  const p = parseDateKey(dateKey);
  if (!p) return null;
  const wall = Date.UTC(p[0], p[1] - 1, p[2], hours, minutes);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const lp = localParts(new Date(guess), timeZone);
    const lpp = parseDateKey(lp.dateKey)!;
    const asIfUtc = Date.UTC(lpp[0], lpp[1] - 1, lpp[2]) + lp.minutes * 60_000;
    guess += wall - asIfUtc;
  }
  return new Date(guess);
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Due reminder instants for one schedule inside (from, to]. Checks the local
 * dates either side of the window so a reminder just after local midnight is
 * not missed when the window straddles it.
 */
export function dueInstants(
  schedule: { frequency: string; anchorDate?: string | null; time: string; timeZone: string },
  from: Date,
  to: Date,
): Date[] {
  const t = parseTime(schedule.time);
  const tz = isValidTimeZone(schedule.timeZone) ? schedule.timeZone : 'UTC';
  if (!t || !(to > from)) return [];
  const cadence = doseCadence(schedule.frequency, schedule.anchorDate);
  const dates = new Set<string>();
  for (const at of [from, to]) {
    const d = localParts(at, tz).dateKey;
    dates.add(d);
  }
  const out: Date[] = [];
  for (const dateKey of dates) {
    if (!remindsOn(cadence, dateKey)) continue;
    const instant = zonedInstant(dateKey, t.hours, t.minutes, tz);
    if (instant && instant > from && instant <= to) out.push(instant);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
