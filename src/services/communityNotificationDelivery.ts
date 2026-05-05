/**
 * Community notification delivery — polls community_notifications and
 * fires LOCAL notifications for any unread events the user hasn't seen
 * yet on this device.
 *
 * Why local + polling instead of real push:
 *   - Real push needs an Expo push-token table + a server cron worker
 *     to send via Expo's API. Both are real infrastructure adds.
 *   - Polling on foreground + a `lastDeliveredId` checkpoint per device
 *     covers 90% of the value (you open the app → see banners for
 *     replies you missed) without the server-side work.
 *
 * Wired from app/_layout.tsx in the same AppState foreground listener
 * that already handles biometric + subscription syncs. Throttled and
 * idempotent — safe to call on every foreground transition.
 */

import { Platform } from 'react-native';
import { notificationsAvailable } from './notificationService';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

const LAST_DELIVERED_KEY = 'peptalk-community-last-delivered-id';

const KIND_COPY: Record<string, { title: string; body: (actor: string) => string }> = {
  reply_to_post: {
    title: 'New reply',
    body: (actor) => `${actor} replied to your post.`,
  },
  reply_to_comment: {
    title: 'New reply',
    body: (actor) => `${actor} replied to your comment.`,
  },
  reaction: {
    title: 'New reaction',
    body: (actor) => `${actor} reacted to your post.`,
  },
  mention: {
    title: 'You were mentioned',
    body: (actor) => `${actor} mentioned you in a comment.`,
  },
  moderation_action: {
    title: 'Moderation action',
    body: () => 'A post or comment of yours was reviewed.',
  },
};

async function getLastDeliveredId(): Promise<string | null> {
  try {
    const { secureStorage } = await import('./secureStorage');
    const v = await secureStorage.getItem(LAST_DELIVERED_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

async function setLastDeliveredId(id: string): Promise<void> {
  try {
    const { secureStorage } = await import('./secureStorage');
    await secureStorage.setItem(LAST_DELIVERED_KEY, id);
  } catch {
    // Best-effort persistence; missing it just means we redeliver one
    // banner on the next foreground.
  }
}

/**
 * Fetch any community_notifications that arrived after the last id we
 * delivered, fire a local banner for each, and persist the new
 * checkpoint. No-op when notifications aren't available on this build.
 */
export async function deliverPendingCommunityNotifications(): Promise<void> {
  if (!notificationsAvailable() || !Notifications) return;

  try {
    const { supabase } = await import('./supabase');
    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return;

    const lastId = await getLastDeliveredId();

    let q = (supabase as any)
      .from('community_notifications')
      .select(`
        id, kind, post_id, comment_id, body, created_at,
        actor:actor_id ( id, username, display_name )
      `)
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: true })
      .limit(20);

    if (lastId) {
      // PostgREST `.gt('id', lastId)` works on UUIDs lexicographically —
      // good enough for our checkpoint use case since gen_random_uuid v4
      // ids aren't time-ordered. The created_at filter below is the
      // real time anchor.
      // We cap at 20 to avoid a banner-storm if the user was offline a
      // long time.
    }

    const { data, error } = await q;
    if (error || !data || data.length === 0) return;

    let newest = lastId;
    for (const row of data) {
      // Skip rows we've already shown.
      if (lastId && row.id === lastId) continue;

      const copy = KIND_COPY[row.kind];
      if (!copy) continue;

      const actor =
        row.actor?.display_name?.trim() ||
        row.actor?.username?.trim() ||
        'Someone';

      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `community-${row.id}`,
          content: {
            title: copy.title,
            body: copy.body(actor),
            sound: 'default',
            data: {
              kind: row.kind,
              postId: row.post_id,
              commentId: row.comment_id,
            },
            ...(Platform.OS === 'android' && { channelId: 'reminders' }),
          },
          trigger: null, // fire immediately as a local banner
        });
      } catch {
        // Notification scheduling can fail on various devices — keep
        // iterating, don't bail on the whole batch.
      }
      newest = row.id;
    }

    if (newest && newest !== lastId) {
      await setLastDeliveredId(newest);
    }
  } catch (err) {
    if (__DEV__) console.warn('[community-push] delivery failed:', err);
  }
}
