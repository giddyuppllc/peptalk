/**
 * Native reminder (re)scheduling from the saved notification preferences.
 *
 * The master "Enable notifications" switch only wrote the preference: every
 * reminder already scheduled on the phone (doses, workouts, meals, check-in,
 * weekly report, meal safety) kept firing after it was turned off, and turning
 * it back on restored nothing until each toggle was flipped again.
 *
 * applyMasterSwitch makes the switch mean what its label says: off cancels
 * every scheduled local reminder; on reschedules each category that is on.
 * Web is untouched here — its dose reminders are server-sent and paused via
 * webPush.setWebRemindersEnabled (useNotificationStore.setEnabled).
 */
import { Platform } from 'react-native';
import {
  scheduleDoseReminder,
  scheduleWorkoutReminder,
  scheduleMealReminder,
  scheduleDailyCheckInReminder,
  scheduleWeeklyReport,
  scheduleMealSafetyChecks,
  cancelAll,
} from './notificationService';
import { useNotificationStore } from '../store/useNotificationStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { getPeptideById } from '../data/peptides';

// Expo weekday numbers are 1=Sun … 7=Sat; scheduleWorkoutReminder takes a label.
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function rescheduleWorkouts(time: string, days: number[]): Promise<void> {
  for (const day of days) {
    await scheduleWorkoutReminder(DAY_LABELS[day - 1] ?? 'Workout', time);
  }
}

export async function rescheduleAllMeals(mealTimes: Record<string, string>): Promise<void> {
  for (const [meal, time] of Object.entries(mealTimes)) {
    await scheduleMealReminder(meal, time);
  }
}

/**
 * Dose reminders for every active protocol (08:00 default, anchored to the
 * protocol start date). scheduleDoseReminder sweeps the peptide's existing
 * identifiers first, so this is idempotent.
 */
export async function rescheduleAllDoses(): Promise<void> {
  const protocols = useDoseLogStore.getState().protocols.filter((p) => p.isActive);
  for (const protocol of protocols) {
    const peptideName = getPeptideById(protocol.peptideId)?.name ?? protocol.peptideId;
    await scheduleDoseReminder(protocol.peptideId, peptideName, '08:00', protocol.frequency, protocol.startDate);
  }
}

export async function applyMasterSwitch(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!enabled) {
    await cancelAll();
    return;
  }
  const prefs = useNotificationStore.getState().preferences;
  if (prefs.dailyCheckInReminder) await scheduleDailyCheckInReminder(prefs.checkInReminderTime);
  if (prefs.doseReminders) await rescheduleAllDoses();
  if (prefs.workoutReminderEnabled) await rescheduleWorkouts(prefs.workoutReminderTime, prefs.workoutReminderDays);
  if (prefs.mealRemindersEnabled) await rescheduleAllMeals(prefs.mealReminderTimes);
  if (prefs.weeklyReportEnabled) await scheduleWeeklyReport();
  if (prefs.mealSafetyReminders) {
    const [hh, mm] = (prefs.mealSafetyReminderTime ?? '09:00').split(':').map(Number);
    await scheduleMealSafetyChecks(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0);
  }
}
