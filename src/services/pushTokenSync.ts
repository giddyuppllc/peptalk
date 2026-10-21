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
import { captureException } from './telemetry';

let lastSyncedToken: string | null = null;

/**
 * Remove an Expo push token from text bound for telemetry.
 *
 * A push token is a delivery address for this device: anyone holding it can
 * send it notifications. PostgREST error text can echo a conflicting value
 * back (a unique violation's detail names the key), so the message is
 * scrubbed both of the exact token and of anything token-shaped.
 */
export function redactPushToken(text: string, token: string | null): string {
  let out = text;
  if (token) out = out.split(token).join('[push-token]');
  return out.replace(/Expo(?:nent)?PushToken\[[^\]]*\]/g, '[push-token]');
}

/**
 * Report a failed token save in every build, not only under __DEV__.
 *
 * From 2026-05-17 every save was refused by the database (the ON CONFLICT
 * target had no matching unique constraint) and the only trace was a dev-only
 * console.warn, so production had no signal at all for four months. Only the
 * error code and a redacted message leave the device: never the token, and
 * never the error's `details`, which can quote row values.
 */
export function reportSaveFailure(stage: 'upsert' | 'sync', err: unknown, token: string | null): void {
  const e = (err ?? {}) as { message?: unknown; code?: unknown };
  const rawMessage =
    err instanceof Error ? err.message : typeof e.message === 'string' ? e.message : String(err);
  captureException(new Error(`push token ${stage} failed: ${redactPushToken(rawMessage, token)}`), {
    source: 'pushTokenSync',
    stage,
    code: typeof e.code === 'string' ? e.code : undefined,
  });
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

  let token: string | null = null;
  try {
    // 'ifGranted': this runs at sign-in and on every foreground. It must never
    // raise the OS prompt; it only syncs a token the user already allowed.
    token = await registerForPushNotifications('ifGranted');
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

    // Upsert keyed on the token alone. This needs UNIQUE (expo_push_token)
    // in the database, or Postgres refuses the ON CONFLICT target outright.
    // The 2026-05-17 migration meant to add it never ran (its version
    // collided in the ledger); 20260915120000_push_tokens_token_unique.sql
    // replaces it. `npm run verify:onconflict` checks every onConflict target
    // against the migrations, and `check:onconflict:live` against production.
    const { error } = await (supabase as any)
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token: token,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'expo_push_token' },
      );

    if (error) {
      reportSaveFailure('upsert', error, token);
      return token;
    }

    lastSyncedToken = token;
    return token;
  } catch (err) {
    reportSaveFailure('sync', err, token);
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
 * `UNIQUE (expo_push_token)` constraint in migration
 * `20260915120000_push_tokens_token_unique.sql` (not yet applied as of
 * 2026-09-15). Note that under RLS that upsert cannot take over a row owned
 * by user A: ON CONFLICT DO UPDATE checks the UPDATE policy against the
 * existing row and raises instead. See that migration's header.
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
    //
    // 'ifGranted': this runs DURING LOGOUT. It used to request permission,
    // so a user who had never answered the notification prompt was shown it
    // as they signed out. Without permission there is no token to clear.
    let tokenToClear = lastSyncedToken;
    if (!tokenToClear) {
      try {
        tokenToClear = await registerForPushNotifications('ifGranted');
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
