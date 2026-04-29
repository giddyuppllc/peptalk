/**
 * Cycle notifications — predictive reminders tied to the cycle engine.
 *
 * Mode-aware: only schedules for `cyclical` and `scheduled_cycle` modes
 * (the only modes where biological prediction makes sense). Continuous /
 * returning / irregular / pregnancy modes have no upcoming-period date,
 * so we skip — scheduling them would be confusing or misleading.
 *
 * What gets scheduled (when applicable):
 *   1. Period approaching — 3 days before the predicted next period
 *   2. Period start — morning of the predicted next period
 *   3. Ovulation — morning of the predicted ovulation day
 *   4. PMS window starting — start of the predicted PMS window
 *
 * Tag prefix: every cycle notification id starts with `cycle:` so we can
 * sweep them cleanly with `cancelRemindersByTag('cycle:')` when the user
 * changes their contraception method or disables tracking.
 */

import { Platform } from 'react-native';
import {
  notificationsAvailable,
  cancelRemindersByTag,
} from './notificationService';
import type { CyclePrediction, PredictionMode } from '../types/cycle';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

/** Identifier prefix shared by every notification we schedule from this file. */
export const CYCLE_NOTIFICATION_TAG = 'cycle:';

/** YYYY-MM-DD → Date at the given hour:minute local time. */
function dateAt(yyyymmdd: string, hour: number, minute: number): Date {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hour, minute, 0, 0);
}

/**
 * Schedule a single one-shot notification at a specific local date/time.
 * Returns the identifier or '' when notifications aren't available / the
 * date is in the past.
 */
async function scheduleAt(
  id: string,
  fireAt: Date,
  title: string,
  body: string,
): Promise<string> {
  if (!notificationsAvailable() || !Notifications) return '';
  if (fireAt.getTime() <= Date.now()) return ''; // past, skip silently

  return Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title,
      body,
      sound: 'default',
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
      date: fireAt,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });
}

/**
 * Replace any previously-scheduled cycle notifications with a fresh set
 * derived from the latest prediction. Idempotent — safe to call on every
 * cycle-state mutation (period logged, method changed, etc.).
 *
 * Returns the count of scheduled notifications (0 when mode is non-predictive
 * or notifications aren't available).
 */
export async function rescheduleCycleNotifications(
  mode: PredictionMode,
  prediction: CyclePrediction | null,
): Promise<number> {
  // Always sweep the existing set first — even if we end up scheduling
  // nothing, stale reminders shouldn't linger.
  await cancelRemindersByTag(CYCLE_NOTIFICATION_TAG);

  if (!notificationsAvailable()) return 0;
  if (!prediction) return 0;
  if (mode !== 'cyclical' && mode !== 'scheduled_cycle') return 0;

  const ids: string[] = [];

  // 1. Period approaching — 3 days before
  const approachDate = new Date(
    dateAt(prediction.nextPeriodDate, 9, 0).getTime() - 3 * 24 * 3600 * 1000,
  );
  const approachId = await scheduleAt(
    `${CYCLE_NOTIFICATION_TAG}approach`,
    approachDate,
    'Period in 3 days',
    "We're predicting your next period in 3 days. Log any early symptoms — bloating, mood, cravings — to refine future predictions.",
  );
  if (approachId) ids.push(approachId);

  // 2. Period start — morning of
  const startId = await scheduleAt(
    `${CYCLE_NOTIFICATION_TAG}start`,
    dateAt(prediction.nextPeriodDate, 9, 0),
    'Period predicted today',
    'Tap to log your period start, flow, and symptoms in PepTalk.',
  );
  if (startId) ids.push(startId);

  // 3. Ovulation (cyclical mode only — scheduled_cycle has no biology-based ovulation)
  if (mode === 'cyclical' && prediction.ovulationDate) {
    const ovId = await scheduleAt(
      `${CYCLE_NOTIFICATION_TAG}ovulation`,
      dateAt(prediction.ovulationDate, 9, 0),
      'Ovulation today',
      'Predicted ovulation. Symptoms like cervical mucus changes or a temperature shift can confirm.',
    );
    if (ovId) ids.push(ovId);
  }

  // 4. PMS window — fire on the day it begins (only if it's still in the
  //    future and at least a day away from the period itself; we don't want
  //    PMS + period_start to fire back-to-back).
  if (prediction.pmsWindow?.start) {
    const pmsStart = dateAt(prediction.pmsWindow.start, 9, 0);
    const periodStart = dateAt(prediction.nextPeriodDate, 9, 0);
    if (periodStart.getTime() - pmsStart.getTime() >= 24 * 3600 * 1000) {
      const pmsId = await scheduleAt(
        `${CYCLE_NOTIFICATION_TAG}pms`,
        pmsStart,
        'PMS window starting',
        'Common in this phase: mood shifts, fatigue, cravings, breast tenderness. Logging helps spot patterns.',
      );
      if (pmsId) ids.push(pmsId);
    }
  }

  return ids.length;
}

/** Sweep all cycle notifications without scheduling new ones. */
export async function clearCycleNotifications(): Promise<void> {
  await cancelRemindersByTag(CYCLE_NOTIFICATION_TAG);
}
