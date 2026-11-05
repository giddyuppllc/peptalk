/**
 * Web dose reminders for the PWA.
 *
 * Native schedules reminders on the device (expo-notifications). A browser has
 * no scheduler, so on web a "scheduled reminder" is a ROW the server reads:
 * `web_dose_reminders` (what to remind and when, with the user's time zone)
 * plus `web_push_subscriptions` (where to deliver). The edge function
 * `web-dose-reminders` runs every 5 minutes, works out what is due with the
 * SAME cadence code native uses (supabase/functions/_shared/doseCadence.ts),
 * and sends Web Push. notificationService routes its dose functions here on
 * web, so the existing reminder toggles and activation flow drive it with no
 * UI of their own.
 *
 * Support: any browser with Service Worker + Push + Notification. On iOS that
 * means Safari 16.4+ AND the app added to the Home Screen — in a plain Safari
 * tab there is no PushManager, so this reports unsupported and the existing
 * "Notifications · Off" state shows. Also unsupported until the VAPID public
 * key is configured in the build (EXPO_PUBLIC_VAPID_PUBLIC_KEY).
 */
import { Platform } from 'react-native';

const VAPID_PUBLIC_KEY = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS reports a Mac UA; touch points tell them apart.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as any).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

/** Can this browser receive web push reminders right now (ignoring permission)? */
export function webPushSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  if (!VAPID_PUBLIC_KEY) return false;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (isIos() && !isStandalone()) return false;
  return (window as any).Notification?.permission !== 'denied';
}

function base64UrlToUint8Array(b64: string): Uint8Array {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function db() {
  const { supabase } = await import('./supabase');
  return supabase as any;
}

async function currentUserId(): Promise<string | null> {
  const client = await db();
  const { data } = await client.auth.getSession();
  return data?.session?.user?.id ?? null;
}

/**
 * Ask for permission (only from a user tap — the existing toggles and the
 * Activate button), subscribe this browser, and save the subscription.
 * Returns false when unsupported, denied, signed out, or anything fails.
 */
export async function ensureWebPushSubscription(): Promise<boolean> {
  if (!webPushSupported()) return false;
  try {
    // Ask FIRST, before any other await: Safari only shows the prompt while
    // the user's tap is still being handled, and an earlier await (the session
    // lookup) is enough to lose it.
    const N = (window as any).Notification;
    const permission = N.permission === 'granted' ? 'granted' : await N.requestPermission();
    if (permission !== 'granted') return false;
    const userId = await currentUserId();
    if (!userId) return false;

    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      }));
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const client = await db();
    const { error } = await client.from('web_push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        time_zone: browserTimeZone(),
        user_agent: (navigator.userAgent || '').slice(0, 300),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * The web equivalent of scheduling native dose reminders for one peptide:
 * upsert the schedule row the server reads. Mirrors scheduleDoseReminder's
 * arguments exactly, so callers do not branch.
 */
export async function saveWebDoseReminder(
  peptideId: string,
  peptideName: string,
  time: string,
  frequency: string,
  anchorDate?: string,
): Promise<string> {
  const subscribed = await ensureWebPushSubscription();
  if (!subscribed) return '';
  try {
    const userId = await currentUserId();
    if (!userId) return '';
    const client = await db();
    const { error } = await client.from('web_dose_reminders').upsert(
      {
        user_id: userId,
        peptide_id: peptideId,
        peptide_name: peptideName.slice(0, 120),
        reminder_time: time,
        frequency,
        anchor_date: anchorDate ?? null,
        time_zone: browserTimeZone(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,peptide_id' },
    );
    return error ? '' : `web-dose-${peptideId}`;
  } catch {
    return '';
  }
}

/** Stop web reminders for one peptide (deactivate / re-schedule). */
export async function deleteWebDoseReminder(peptideId: string): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const client = await db();
    await client.from('web_dose_reminders').delete().eq('user_id', userId).eq('peptide_id', peptideId);
  } catch {
    /* best-effort, like the native cancel */
  }
}

/** Stop every web dose reminder for the user (the dose / master toggles off). */
export async function deleteAllWebDoseReminders(): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const client = await db();
    await client.from('web_dose_reminders').delete().eq('user_id', userId);
  } catch {
    /* best-effort */
  }
}

/**
 * The master "Notifications" switch. Native reminders are left in place by
 * that switch (it is a preference the boot effects read); on web the server is
 * the scheduler, so the switch has to reach it: rows are paused, not deleted,
 * and resume when it is turned back on.
 */
export async function setWebRemindersEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const client = await db();
    await client.from('web_dose_reminders').update({ enabled }).eq('user_id', userId);
  } catch {
    /* best-effort */
  }
}
