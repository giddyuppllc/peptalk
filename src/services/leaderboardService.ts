/**
 * leaderboardService — the opt-in flag and the three leaderboard RPCs.
 *
 * SERVER-FIRST, like profileService: `profiles.leaderboard_opt_in` is the only
 * copy of the choice. A device-local mirror would let the switch show "on" to a
 * user the server has never heard of, or "off" while they are still listed.
 *
 * Every RPC result goes through the allowlist scrub in lib/leaderboardPayload
 * before it is returned, so a widened SQL function cannot put an extra field
 * into app state.
 *
 * The migration behind this (20260915200000_community_leaderboard.sql) is NOT
 * applied yet. Until it is, every call here fails soft: the opt-in read returns
 * null and the lists return an error the screens render as a retry state.
 */

import { supabase } from './supabase';
import { captureException } from './telemetry';
import type { LeaderboardMetric } from '../lib/leaderboardMetrics';
import {
  scrubLeaderboardRow,
  scrubMyMetrics,
  scrubRows,
  scrubShoutoutRow,
  type LeaderboardRow,
  type MyMetrics,
  type ShoutoutRow,
} from '../lib/leaderboardPayload';

/** Same untyped binding profileService uses — the generated types predate the column. */
const db = supabase as any;

export type ListResult<T> = { ok: true; rows: T[] } | { ok: false };

/** The signed-in user's choice, or null when signed out / unreadable. */
export async function fetchLeaderboardOptIn(): Promise<boolean | null> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data, error } = await db
      .from('profiles')
      .select('leaderboard_opt_in')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    // Only a literal true is "in" — see isOptedIn in lib/leaderboardMetrics.
    return data ? data.leaderboard_opt_in === true : false;
  } catch (err) {
    captureException(err, { source: 'leaderboardService.fetchOptIn' });
    return null;
  }
}

/** One spelling for an address, so two forms of the same account still match. */
export function normalizeAccountEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * The signed-in account's address, or null when there is no session or it
 * cannot be read. Used to check that a held choice belongs to whoever is
 * actually signed in before it is written.
 */
export async function fetchCurrentAccountEmail(): Promise<string | null> {
  try {
    const { data: { user } } = await db.auth.getUser();
    return normalizeAccountEmail(user?.email);
  } catch (err) {
    captureException(err, { source: 'leaderboardService.fetchCurrentAccountEmail' });
    return null;
  }
}

/**
 * Write the choice. True only on a CONFIRMED write — the switch must not show
 * a state the server did not accept.
 *
 * `.select()` is what makes that true rather than aspirational. A PostgREST
 * `.update().eq()` with no select returns 204 and `error: null` whether or not
 * any row matched, so a filter that matched nothing — an RLS policy that hides
 * the row, a profile row that does not exist yet — reported success. "Leave
 * the leaderboard" then told the user they were off it while they stayed
 * publicly ranked. Reading the stored value back is the only way to know.
 */
export async function saveLeaderboardOptIn(optIn: boolean): Promise<boolean> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;
    const wanted = optIn === true;
    const { data, error } = await db
      .from('profiles')
      .update({ leaderboard_opt_in: wanted })
      .eq('id', user.id)
      .select('leaderboard_opt_in')
      .maybeSingle();
    if (error) throw error;
    return data?.leaderboard_opt_in === wanted;
  } catch (err) {
    captureException(err, { source: 'leaderboardService.saveOptIn' });
    return false;
  }
}

export async function fetchLeaderboard(metric: LeaderboardMetric): Promise<ListResult<LeaderboardRow>> {
  try {
    const { data, error } = await db.rpc('get_community_leaderboard', { p_metric: metric, p_limit: 50 });
    if (error) throw error;
    return { ok: true, rows: scrubRows(data, scrubLeaderboardRow) };
  } catch (err) {
    captureException(err, { source: 'leaderboardService.fetchLeaderboard', extra: { metric } });
    return { ok: false };
  }
}

export async function fetchShoutouts(): Promise<ListResult<ShoutoutRow>> {
  try {
    const { data, error } = await db.rpc('get_community_shoutouts', { p_limit: 20 });
    if (error) throw error;
    return { ok: true, rows: scrubRows(data, scrubShoutoutRow) };
  } catch (err) {
    captureException(err, { source: 'leaderboardService.fetchShoutouts' });
    return { ok: false };
  }
}

export async function fetchMyMetrics(): Promise<MyMetrics | null> {
  try {
    const { data, error } = await db.rpc('get_my_leaderboard_metrics');
    if (error) throw error;
    return scrubMyMetrics(data);
  } catch (err) {
    captureException(err, { source: 'leaderboardService.fetchMyMetrics' });
    return null;
  }
}
