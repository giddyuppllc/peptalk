/**
 * The two one-shot alerts activation promises: "vial expiring" (28 days after
 * reconstitution) and "cycle complete" (the protocol's planned end date).
 *
 * They used to be scheduled inline in ActivateProtocolButton as local
 * notifications only, so:
 *   - on the web app they never existed (expo-notifications has no web
 *     scheduler), while the confirmation text promised them;
 *   - deactivating or deleting a protocol cancelled its dose reminders but
 *     left these two scheduled, so a stopped protocol still announced its
 *     vial and its cycle end;
 *   - the master Notifications switch, once it cancels everything, had no
 *     way to put them back.
 *
 * One definition now serves all three: native schedules a local notification,
 * web saves a row the web-dose-reminders function sends by Web Push. The
 * wording is unchanged from the original.
 */
import { Platform } from 'react-native';
import { notificationsAvailable } from './notificationService';

export const VIAL_LIFE_DAYS = 28;

export interface ProtocolAlert {
  identifier: string;
  fireAt: Date;
  title: string;
  body: string;
}

const tagFor = (peptideId: string) => `protocol-${peptideId}-`;

function at9(date: Date): Date {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d;
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * The alerts for one protocol. `startDate`/`endDate` are the protocol's own
 * YYYY-MM-DD fields; `weeks` defaults to the span between them.
 */
export function protocolAlertsFor(p: {
  peptideId: string;
  peptideName: string;
  startDate: string;
  endDate?: string | null;
  weeks?: number;
}): ProtocolAlert[] {
  const tag = tagFor(p.peptideId);
  const start = parseDay(p.startDate);
  const vial = new Date(start);
  vial.setDate(vial.getDate() + VIAL_LIFE_DAYS);
  const alerts: ProtocolAlert[] = [
    {
      identifier: `${tag}vial-expiry`,
      fireAt: at9(vial),
      title: `${p.peptideName} vial expiring`,
      body: `Your reconstituted vial is ${VIAL_LIFE_DAYS} days old today. Discard if it shows cloudiness, particles, or color change. Reconstitute a fresh vial for continued cycling.`,
    },
  ];
  if (p.endDate) {
    const end = parseDay(p.endDate);
    const weeks = p.weeks ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000)));
    alerts.push({
      identifier: `${tag}cycle-end`,
      fireAt: at9(end),
      title: `${p.peptideName} cycle complete`,
      body: `Your protocol's planned ${weeks}-week cycle ends today. Review your check-ins and decide on a break vs. continuation with your provider.`,
    });
  }
  return alerts;
}

async function scheduleNative(a: ProtocolAlert): Promise<void> {
   
  const Notifications = require('expo-notifications');
  await Notifications.scheduleNotificationAsync({
    identifier: a.identifier,
    content: {
      title: a.title,
      body: a.body,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
      date: a.fireAt,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
}

/** Schedule (or replace) a protocol's alerts. Past times are skipped. */
export async function scheduleProtocolAlerts(alerts: ProtocolAlert[], now = new Date()): Promise<void> {
  if (!notificationsAvailable()) return;
  for (const a of alerts) {
    if (a.fireAt.getTime() <= now.getTime()) continue;
    try {
      if (Platform.OS === 'web') {
         
        const { saveWebOneShot } = require('./webPush');
        await saveWebOneShot(a.identifier, a.fireAt, a.title, a.body);
      } else {
        await scheduleNative(a);
      }
    } catch {
      // Best-effort, like every other reminder.
    }
  }
}

/** Remove a protocol's alerts (deactivate / delete / re-activate). */
export async function cancelProtocolAlerts(peptideId: string): Promise<void> {
  const tag = tagFor(peptideId);
  try {
    if (Platform.OS === 'web') {
       
      const { deleteWebOneShotsByPrefix } = require('./webPush');
      await deleteWebOneShotsByPrefix(tag);
      return;
    }
    if (!notificationsAvailable()) return;
     
    const Notifications = require('expo-notifications');
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled as { identifier?: string }[]) {
      if (n.identifier?.startsWith(tag)) {
        try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch { /* ignore */ }
      }
    }
  } catch {
    /* best-effort */
  }
}
