/**
 * Leaderboard payload scrub — what the client is willing to hold about another
 * person, as an allowlist.
 *
 * The server functions already return only these columns (the migration's
 * RETURNS TABLE is checked against ALLOWED_*_FIELDS by jest, and the local
 * Postgres run asserts the live function signature). This is the second
 * layer: if the SQL is ever widened — a `SELECT *`, a joined `email`, a
 * `peptide_name` added "for context" — the extra field is dropped here before
 * it reaches a store, a render, or a crash report.
 *
 * Why user_id is allowed: the existing public_profiles table already exposes
 * id → username/display_name/avatar to every signed-in user, so returning it
 * adds nothing new, and the client needs it to mark "you" and to hide a person
 * through the existing community block.
 *
 * Pure, RN-free, unit-tested.
 */

import type { LeaderboardMetric, MilestoneKind } from './leaderboardMetrics';
import { LEADERBOARD_METRICS } from './leaderboardMetrics';

export const ALLOWED_LEADERBOARD_FIELDS = [
  'rank',
  'user_id',
  'username',
  'display_name',
  'avatar_url',
  'metric_value',
  'is_self',
] as const;

export const ALLOWED_SHOUTOUT_FIELDS = [
  'user_id',
  'username',
  'display_name',
  'avatar_url',
  'kind',
  'threshold',
  'achieved_on',
  'is_self',
] as const;

export const ALLOWED_MY_METRICS_FIELDS = [
  'checkin_streak',
  'dose_adherence_30d',
  'workouts_30d',
] as const;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  value: number;
  isSelf: boolean;
}

export interface ShoutoutRow {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  kind: MilestoneKind;
  threshold: number;
  achievedOn: string;
  isSelf: boolean;
}

export type MyMetrics = Record<LeaderboardMetric, number | null>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One leaderboard row, reduced to the allowlist. Null when malformed. */
export function scrubLeaderboardRow(raw: unknown): LeaderboardRow | null {
  if (!isRecord(raw)) return null;
  const userId = str(raw.user_id);
  const rank = int(raw.rank);
  const value = int(raw.metric_value);
  if (!userId || rank == null || value == null) return null;
  return {
    rank,
    userId,
    username: str(raw.username),
    displayName: str(raw.display_name),
    avatarUrl: str(raw.avatar_url),
    value,
    isSelf: raw.is_self === true,
  };
}

const SHOUTOUT_KINDS: readonly MilestoneKind[] = ['checkin_streak', 'workout_count'];

/** One shout-out, reduced to the allowlist. Null when malformed or unknown. */
export function scrubShoutoutRow(raw: unknown): ShoutoutRow | null {
  if (!isRecord(raw)) return null;
  const userId = str(raw.user_id);
  const threshold = int(raw.threshold);
  const achievedOn = str(raw.achieved_on);
  const kind = raw.kind as MilestoneKind;
  if (!userId || threshold == null || !achievedOn || !SHOUTOUT_KINDS.includes(kind)) return null;
  return {
    userId,
    username: str(raw.username),
    displayName: str(raw.display_name),
    avatarUrl: str(raw.avatar_url),
    kind,
    threshold,
    achievedOn: achievedOn.slice(0, 10),
    isSelf: raw.is_self === true,
  };
}

/** The caller's own numbers. Only the three metric counts survive. */
export function scrubMyMetrics(raw: unknown): MyMetrics {
  const row = Array.isArray(raw) ? raw[0] : raw;
  const out = {} as MyMetrics;
  for (const m of LEADERBOARD_METRICS) {
    out[m] = isRecord(row) ? int(row[m]) : null;
  }
  return out;
}

export function scrubRows<T>(raw: unknown, scrub: (r: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(scrub).filter((r): r is T => r !== null);
}

/**
 * Drop a user from already-fetched rows. Used when someone opts out (their own
 * row must vanish from every cached board at once, not on the next fetch) and
 * when a viewer hides a person via block.
 */
export function withoutUser<T extends { userId: string }>(rows: T[], userId: string): T[] {
  return rows.filter((r) => r.userId !== userId);
}

/** Drop the viewer's own rows — opting out must clear "you" everywhere. */
export function withoutSelf<T extends { isSelf: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.isSelf);
}

// ── cached-list purges (used by useLeaderboardStore) ─────────────────────

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ListState<T> {
  rows: T[];
  status: LoadStatus;
}

export type Boards = Record<LeaderboardMetric, ListState<LeaderboardRow>>;

/** The cached lists after the viewer opts out — their own rows gone everywhere. */
export function purgeSelf(
  boards: Boards,
  shoutouts: ListState<ShoutoutRow>,
): { boards: Boards; shoutouts: ListState<ShoutoutRow> } {
  const next = {} as Boards;
  for (const k of Object.keys(boards) as LeaderboardMetric[]) {
    next[k] = { ...boards[k], rows: withoutSelf(boards[k].rows) };
  }
  return { boards: next, shoutouts: { ...shoutouts, rows: withoutSelf(shoutouts.rows) } };
}

/** The cached lists after the viewer hides someone. */
export function purgeUser(
  boards: Boards,
  shoutouts: ListState<ShoutoutRow>,
  userId: string,
): { boards: Boards; shoutouts: ListState<ShoutoutRow> } {
  const next = {} as Boards;
  for (const k of Object.keys(boards) as LeaderboardMetric[]) {
    next[k] = { ...boards[k], rows: withoutUser(boards[k].rows, userId) };
  }
  return { boards: next, shoutouts: { ...shoutouts, rows: withoutUser(shoutouts.rows, userId) } };
}
