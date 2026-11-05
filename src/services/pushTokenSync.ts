/**
 * Push token sync — registers the user's Expo push token with our
 * Supabase `push_tokens` table so the community-push-fanout edge
 * function can deliver real pushes (not just local-poll banners).
 *
 * Called from app/_layout.tsx in two places:
 *   1. When the user signs in (new session)
 *   2. On every foreground transition (cheap upsert, keeps last_seen_at fresh)
 *
 * Failure is non-fatal: if registration fails (no permission, no device,
 * Supabase offline) we just leave it; the existing local-poll delivery
 * still handles foreground notification surfacing.
 */

import { Platform } from 'react-native';
import { registerForPushNotifications, notificationsAvailable } from './notificationService';

let lastSyncedToken: string | null = null;

/** PostgREST's "function not found" — the RPC's migration is not applied yet. */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

/**
 * Save this device's token for the signed-in user. Prefers claim_push_token
 * (reassigns a shared device's token); falls back to the plain upsert while
 * that migration is not applied. Returns the error, or null.
 */
export async function writeToken(
   
  supabase: any,
  userId: string,
  token: string,
  platform: 'ios' | 'android',
): Promise<{ code?: string; message?: string } | null> {
  let { error } = await supabase.rpc('claim_push_token', { p_token: token, p_platform: platform });
  if (error && isMissingFunction(error)) {
    ({ error } = await supabase.from('push_tokens').upsert(
      { user_id: userId, expo_push_token: token, platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'expo_push_token' },
    ));
  }
  return error ?? null;
}

/**
 * Register an Expo push token + upsert into push_tokens for the current
 * user. Idempotent — call as often as you like.
 *
 * Returns the registered token, or null if the device/permissions
 * blocked it.
 */
export async function syncPushToken(): Promise<string | null> {
  if (!notificationsAvailable()) return null;

  try {
    const token = await registerForPushNotifications();
    if (!token) return null;

    // Skip the round-trip if we already synced this exact token in
    // this app session — push_tokens.unique(user_id, expo_push_token)
    // would no-op anyway, but this saves the network call.
    if (token === lastSyncedToken) return token;

    const { supabase } = await import('./supabase');
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user?.id) {
      // No session — defer until signed-in.
      return token;
    }

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
    if (!platform) return token;

    // Upsert keyed on the token alone. The 2026-05-17 migration
    // changed UNIQUE (user_id, expo_push_token) → UNIQUE
    // (expo_push_token) so a shared device that previously sent
    // pushes to user A correctly reassigns to user B on the next
    // sync. Without this, user A's row sat in the table forever
    // and the apple-notifications fanout kept routing to this
    // device under user A's id.
    //
    // That reassignment needs claim_push_token (migration
    // 20261105050000): the table's UPDATE policy only lets a user touch
    // their own row, so a plain upsert onto another user's token is
    // refused. Before that migration is applied the RPC does not exist and
    // the original upsert still covers the same-user case.
    const error = await writeToken(supabase, user.id, token, platform);
    if (error) {
      if (__DEV__) console.warn('[push-token-sync] upsert failed:', error);
      return token;
    }

    lastSyncedToken = token;
    return token;
  } catch (err) {
    if (__DEV__) console.warn('[push-token-sync] failed:', err);
    return null;
  }
}

/**
 * Remove the current device's token on sign-out so a shared device
 * doesn't keep getting pushes meant for the previous user.
 *
 * Removes ONLY the current user's row (RLS scopes deletes to
 * `auth.uid() = user_id`). The cross-user case — user A killed the
 * app without logging out, user B logs in — is handled by the
 * `UNIQUE (expo_push_token)` constraint added in migration
 * `20260517000000_push_tokens_device_unique.sql`: when user B's
 * syncPushToken upserts with onConflict='expo_push_token', user A's
 * row gets atomically overwritten with user B's row. No stale rows
 * leak.
 */
export async function clearPushToken(): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user?.id) {
      lastSyncedToken = null;
      return;
    }

    // Re-read the device's current Expo token if we don't have one
    // cached — covers the cold-boot-then-logout edge case.
    let tokenToClear = lastSyncedToken;
    if (!tokenToClear) {
      try {
        tokenToClear = await registerForPushNotifications();
      } catch {
        // Permission denied / no device — skip silently.
      }
    }

    if (tokenToClear) {
      await (supabase as any)
        .from('push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('expo_push_token', tokenToClear);
    }
  } catch {
    // Best-effort — if delete fails the next signed-in user just gets
    // bonus pushes for a few minutes until DeviceNotRegistered prunes
    // us server-side.
  } finally {
    lastSyncedToken = null;
  }
}
