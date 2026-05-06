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

    // Upsert — bumps last_seen_at on existing rows.
    const { error } = await (supabase as any)
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token: token,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' },
      );

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
 */
export async function clearPushToken(): Promise<void> {
  if (!lastSyncedToken) return;
  try {
    const { supabase } = await import('./supabase');
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user?.id) return;
    await (supabase as any)
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('expo_push_token', lastSyncedToken);
  } catch {
    // Best-effort — if delete fails the next signed-in user just gets
    // bonus pushes for a few minutes until DeviceNotRegistered prunes
    // us server-side.
  } finally {
    lastSyncedToken = null;
  }
}
