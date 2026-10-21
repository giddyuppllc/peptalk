/**
 * Community leaderboard — the metric rules, as pure functions.
 *
 * WHY THIS FILE EXISTS
 * The leaderboard is computed in Postgres (migration
 * 20260915200000_community_leaderboard.sql), because the rows it ranks belong
 * to other users and never reach this device. That makes the SQL the thing
 * that actually runs — and SQL is where a rule quietly drifts from what the app
 * shows a user about themselves.
 *
 * So every rule is written twice, once here and once in SQL, and they are held
 * together from both sides:
 *   - jest (src/lib/__tests__/leaderboardMetrics.test.ts) pins these functions
 *     and parses the migration to check its constants match the ones below;
 *   - scripts/test-leaderboard-sql.ts runs the migration in a throwaway
 *     Postgres, seeds the SAME fixture, and fails if a single number differs
 *     from what these functions compute.
 *
 * DATA AUTHORITY — every metric derives from a table the app already writes:
 *   checkin_streak       check_ins.date              (useCheckinStore → syncRecord)
 *   dose_adherence_30d   active_protocols + dose_logs (useDoseLogStore → syncRecord)
 *   workouts_30d         workout_logs.completed_at   (useWorkoutStore → syncRecord)
 *
 * Nothing here reads a dose amount, a compound, a weight or any other health
 * value. Adherence is a ratio of COUNTS; which peptide the counts belong to is
 * used only to match a log to its protocol and never leaves the database.
 *
 * "Goals completed" was asked for and is deliberately absent: useProgressGoalsStore
 * persists to the device only, so the server has no goal data to rank.
 *
 * No React / React Native imports — this must stay unit-testable in plain node.
 */

import { dosesPerWeekFor } from '../utils/doseAdherence';
import type { ProtocolFrequency } from '../types';

export type LeaderboardMetric = 'checkin_streak' | 'dose_adherence_30d' | 'workouts_30d';

export const LEADERBOARD_METRICS: readonly LeaderboardMetric[] = [
  'checkin_streak',
  'dose_adherence_30d',
  'workouts_30d',
] as const;

/** Trailing window, in days, for the two windowed metrics. */
export const METRIC_WINDOW_DAYS = 30;

/**
 * A streak still counts as "current" when its last check-in is yesterday.
 *
 * check_ins.date is the user's LOCAL calendar date, and the server only knows
 * UTC. A user west of UTC who checked in this evening can have a date that is
 * already "yesterday" in UTC, and a user east of UTC can be a day ahead. One
 * day of grace either side keeps the server from zeroing a real streak.
 */
export const STREAK_GRACE_DAYS = 1;

/**
 * Shout-out thresholds. These are the app's EXISTING badge thresholds
 * (useAchievementStore BADGES: streak_3/7/14/30, workout_count_1/10) — not new
 * numbers. A jest test parses BADGES and fails if these drift from it.
 */
export const CHECKIN_STREAK_THRESHOLDS: readonly number[] = [3, 7, 14, 30];
export const WORKOUT_COUNT_THRESHOLDS: readonly number[] = [1, 10];

/** How far back a milestone may be and still be shouted out. */
export const SHOUTOUT_WINDOW_DAYS = 14;

// ── date helpers (UTC calendar days, as 'YYYY-MM-DD') ─────────────────────

const DAY_MS = 86_400_000;

function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A timestamp's UTC day, or null when it is not a date at all.
 *
 * `new Date('nonsense').toISOString()` does not return a bad string — it throws
 * `RangeError: Invalid time value`. These metrics run on `completedAt` read
 * straight off a server row (`r.completed_at`, useWorkoutStore.ts:549), so one
 * malformed value anywhere in a user's history threw out of the leaderboard's
 * render. The only error boundary in the app is at the root, so that is not a
 * broken card — it is the whole app replaced by the fallback screen.
 *
 * A row we cannot date is dropped, which is what the surrounding code already
 * does with a row that has no `completedAt` at all.
 */
function utcDayKey(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // One check, not three. An earlier draft also tested `value === ''`, which no
  // test could ever catch because `new Date('').getTime()` is already NaN —
  // dead code dressed as a guard. The finite check is the whole guard.
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

// ── inputs ────────────────────────────────────────────────────────────────

export interface ProtocolInput {
  peptideId: string | null;
  frequency: ProtocolFrequency | string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface DoseInput {
  peptideId: string | null;
  date: string;
  /** dose_logs.source. 'planned' = scheduled, not taken. */
  source: string | null;
}

export interface WorkoutInput {
  /** ISO timestamp, or null for a planned/unfinished workout. */
  completedAt: string | null;
}

// ── metric derivations ───────────────────────────────────────────────────

/** Consecutive-day runs over the distinct check-in dates. */
export function checkinRuns(dates: string[], today: string): { start: string; end: string; length: number }[] {
  const limit = toDayNumber(today) + STREAK_GRACE_DAYS;
  const days = [...new Set(dates.map(toDayNumber))].filter((d) => d <= limit).sort((a, b) => a - b);
  const runs: { start: string; end: string; length: number }[] = [];
  let runStart = -1;
  let prev = -1;
  for (const d of days) {
    if (runStart === -1 || d !== prev + 1) {
      if (runStart !== -1) runs.push({ start: fromDayNumber(runStart), end: fromDayNumber(prev), length: prev - runStart + 1 });
      runStart = d;
    }
    prev = d;
  }
  if (runStart !== -1) runs.push({ start: fromDayNumber(runStart), end: fromDayNumber(prev), length: prev - runStart + 1 });
  return runs;
}

/** Current check-in streak in days. 0 when the latest run has lapsed. */
export function checkinStreak(dates: string[], today: string): number {
  const runs = checkinRuns(dates, today);
  if (runs.length === 0) return 0;
  const last = runs[runs.length - 1];
  return toDayNumber(last.end) >= toDayNumber(today) - STREAK_GRACE_DAYS ? last.length : 0;
}

/**
 * Dose adherence over the trailing window, as a whole percent — or null when
 * the user has no active protocol in the window (nothing was expected of them,
 * so there is nothing to rank).
 *
 * Mirrors the app's own adherence rule in utils/doseAdherence.ts: expected
 * doses come from the protocol's frequency via dosesPerWeekFor, never less than
 * one, and planned-but-untaken doses do not count as taken. Logged doses are
 * capped at the expected count PER PROTOCOL, so extra doses on one compound
 * cannot paper over missed doses on another, and nobody can climb the board by
 * logging more than their plan.
 */
export function doseAdherencePct(
  protocols: ProtocolInput[],
  doses: DoseInput[],
  today: string,
): number | null {
  const todayN = toDayNumber(today);
  const windowStart = todayN - (METRIC_WINDOW_DAYS - 1);
  let expectedTotal = 0;
  let loggedTotal = 0;
  for (const p of protocols) {
    if (p.isActive !== true) continue;
    const ws = Math.max(p.startDate ? toDayNumber(p.startDate) : windowStart, windowStart);
    const we = Math.min(p.endDate ? toDayNumber(p.endDate) : todayN, todayN);
    if (we < ws) continue;
    const days = we - ws + 1;
    const dpw = dosesPerWeekFor((p.frequency ?? 'custom') as ProtocolFrequency);
    // (dpw * days) / 7, in that order, so JS and Postgres numeric agree exactly
    // on values like 0.25 × 14 / 7 = 0.5 that float division would round wrong.
    const expected = Math.max(1, Math.round((dpw * days) / 7));
    const logged =
      p.peptideId == null
        ? 0
        : doses.filter((d) => {
            if (d.peptideId !== p.peptideId) return false;
            if ((d.source ?? 'user') === 'planned') return false;
            const dn = toDayNumber(d.date);
            return dn >= ws && dn <= we;
          }).length;
    expectedTotal += expected;
    loggedTotal += Math.min(logged, expected);
  }
  if (expectedTotal === 0) return null;
  return Math.round((100 * loggedTotal) / expectedTotal);
}

/** Completed workouts whose UTC completion date falls in the trailing window. */
export function workoutsInWindow(workouts: WorkoutInput[], today: string): number {
  const todayN = toDayNumber(today);
  const start = todayN - (METRIC_WINDOW_DAYS - 1);
  return workouts.filter((w) => {
    const key = utcDayKey(w.completedAt);
    if (key === null) return false;
    const dn = toDayNumber(key);
    return dn >= start && dn <= todayN;
  }).length;
}

// ── milestones (shout-outs) ──────────────────────────────────────────────

export type MilestoneKind = 'checkin_streak' | 'workout_count';

export interface MilestoneEvent {
  kind: MilestoneKind;
  threshold: number;
  achievedOn: string;
}

/**
 * Real milestone events: the day a check-in run crossed a badge threshold, and
 * the day the Nth workout was completed. Only events inside the shout-out window
 * are returned, newest first.
 */
export function milestoneEvents(
  checkinDates: string[],
  workouts: WorkoutInput[],
  today: string,
): MilestoneEvent[] {
  const since = toDayNumber(today) - (SHOUTOUT_WINDOW_DAYS - 1);
  const until = toDayNumber(today) + STREAK_GRACE_DAYS;
  const out: MilestoneEvent[] = [];
  for (const run of checkinRuns(checkinDates, today)) {
    for (const t of CHECKIN_STREAK_THRESHOLDS) {
      if (run.length >= t) {
        out.push({ kind: 'checkin_streak', threshold: t, achievedOn: addDays(run.start, t - 1) });
      }
    }
  }
  // Day keys, not epoch millis: a row we cannot date is dropped here rather
  // than becoming a NaN that throws out of toISOString() further down.
  const completed = workouts
    .map((w) => utcDayKey(w.completedAt))
    .filter((k): k is string => k !== null)
    .sort();
  for (const t of WORKOUT_COUNT_THRESHOLDS) {
    if (completed.length >= t) {
      out.push({ kind: 'workout_count', threshold: t, achievedOn: completed[t - 1] });
    }
  }
  return out
    .filter((e) => {
      const n = toDayNumber(e.achievedOn);
      return n >= since && n <= until;
    })
    .sort((a, b) => (a.achievedOn === b.achievedOn ? b.threshold - a.threshold : a.achievedOn < b.achievedOn ? 1 : -1));
}

// ── gating + ranking ─────────────────────────────────────────────────────

export interface CandidateUser {
  userId: string;
  /** profiles.leaderboard_opt_in. Anything but a literal `true` is OFF. */
  optIn: boolean | null | undefined;
  metrics: Record<LeaderboardMetric, number | null>;
}

/**
 * The gate. Only a literal `true` opts a user in — null, undefined, 'true', 1
 * all stay out. Default-off must survive a missing column, a bad hydrate, or a
 * truthy-but-wrong value; a `Boolean(x)` check would not.
 */
export function isOptedIn(optIn: unknown): boolean {
  return optIn === true;
}

export interface RankedEntry {
  rank: number;
  userId: string;
  value: number;
}

/**
 * Rank opted-in users on one metric. Users with no value, or zero, are left off
 * — the board shouts out progress, it does not list who has none. Ties share a
 * rank (1, 1, 3), matching Postgres rank().
 */
export function rankLeaderboard(users: CandidateUser[], metric: LeaderboardMetric): RankedEntry[] {
  const eligible = users
    .filter((u) => isOptedIn(u.optIn))
    .map((u) => ({ userId: u.userId, value: u.metrics[metric] }))
    .filter((e): e is { userId: string; value: number } => typeof e.value === 'number' && e.value > 0)
    .sort((a, b) => b.value - a.value);
  const out: RankedEntry[] = [];
  eligible.forEach((e, i) => {
    const rank = i > 0 && eligible[i - 1].value === e.value ? out[i - 1].rank : i + 1;
    out.push({ rank, userId: e.userId, value: e.value });
  });
  return out;
}
