/**
 * Notification Service for PepTalk
 *
 * Wraps expo-notifications with dynamic require() so the app works in Expo Go
 * where expo-notifications is NOT available on Android (removed in SDK 53).
 *
 * All functions no-op gracefully when the module is unavailable.
 * Reinstall expo-notifications + expo-device for development builds.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic module loading — safe for Expo Go
// ---------------------------------------------------------------------------

let Notifications: any = null;
let Device: any = null;

// Re-enabled with defensive load. The earlier Hermes-init crash that
// forced this off was on an older expo-notifications + RN combo; SDK
// 54 + 0.32.17 + new arch is stable in TestFlight builds. If init still
// throws on some device, we catch it and fall back to "notifications
// unavailable" — UI handles the absence cleanly via notificationsAvailable().
try {
  Notifications = require('expo-notifications');
} catch (err) {
  if (__DEV__) console.warn('[notificationService] expo-notifications failed to load:', err);
  Notifications = null;
}

try {
  Device = require('expo-device');
} catch (err) {
  if (__DEV__) console.warn('[notificationService] expo-device failed to load:', err);
  Device = null;
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

function isAvailable(): boolean {
  return Notifications != null;
}

/**
 * Public helper used by settings + banners to know whether push
 * notifications are actually functional on this build. Returns false
 * while expo-notifications is disabled (see file header for why).
 */
export function notificationsAvailable(): boolean {
  return isAvailable();
}

// ─── Configure Notification Handler ──────────────────────────────────────────

export function configureNotificationHandler(): void {
  if (!isAvailable()) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Single global response listener — fired when the user TAPS a
// notification (push or local). Routes to the screen specified in
// `data.route`, or falls back to a screen inferred from `data.type`
// / `data.kind`. Without this, tapping any notification just opens
// the app with no deep-linking, defeating every `route:` field we set
// on scheduled reminders (P0 from Wave 76.9 push audit).
let responseSub: { remove(): void } | null = null;
export function registerNotificationResponseHandler(
  router: { push: (path: string) => void },
): void {
  if (!isAvailable()) return;
  if (responseSub) responseSub.remove();
  responseSub = Notifications.addNotificationResponseReceivedListener(
    (response: any) => {
      const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
      const route =
        typeof data.route === 'string' ? data.route : null;
      if (route) {
        try { router.push(route); } catch (err) {
          if (__DEV__) console.warn('[notif] route push failed:', err, route);
        }
        return;
      }
      // Fallback: infer from category keys we set when scheduling.
      const inferredRoute = (() => {
        switch (data.type || data.kind) {
          case 'check-in': return '/(tabs)/check-in';
          case 'dose': return '/(tabs)/calendar';
          case 'workout': return '/(tabs)/workouts';
          case 'meal':
          case 'meal-safety': return '/(tabs)/nutrition';
          case 'community-reply':
          case 'community-mention':
          case 'community-like': {
            const postId = typeof data.postId === 'string' ? data.postId : null;
            return postId ? `/(tabs)/community/${postId}` : '/(tabs)/community';
          }
          default: return null;
        }
      })();
      if (inferredRoute) {
        try { router.push(inferredRoute); } catch (err) {
          if (__DEV__) console.warn('[notif] fallback route push failed:', err, inferredRoute);
        }
      }
    },
  );
}

export function unregisterNotificationResponseHandler(): void {
  responseSub?.remove();
  responseSub = null;
}

// ─── Register for Push Notifications ─────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (!isAvailable()) return null;

  if (Device && !Device.isDevice) {
    if (__DEV__) {
      if (__DEV__) console.warn('[notificationService] Push notifications require a physical device.');
    }
    return null;
  }

  if (Platform.OS === 'android') {
    // 'reminders' is the catch-all channel for scheduled notifications.
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance?.HIGH ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
      sound: 'default',
    });
    // 'motivation' is referenced by scheduleDailyMotivation below. On
    // Android 8+, posting to an unregistered channel is silently
    // dropped — register it up front to keep daily motivation pushes
    // alive on Android. Earlier audit (Wave 76.8) caught this.
    await Notifications.setNotificationChannelAsync('motivation', {
      name: 'Motivation',
      importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) {
      if (__DEV__) console.warn('[notificationService] Notification permission not granted.');
    }
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

// ─── Schedule Daily Check-In Reminder ────────────────────────────────────────

/** Stable identifier for the daily check-in reminder. Reusing this
 *  on every schedule call means iOS REPLACES the prior schedule
 *  rather than creating a duplicate — without it, the boot-time
 *  scheduler in app/_layout.tsx was creating a fresh reminder on
 *  every cold launch, resulting in 10+ duplicate 9 AM pushes after
 *  10 launches (and the "Off" toggle in profile silently failing
 *  to cancel them because cancelRemindersByTag only matched
 *  prefixed ids). Audit fix (Wave 76.8). */
export const DAILY_CHECKIN_REMINDER_ID = 'checkin-daily';

export async function scheduleDailyCheckInReminder(time: string): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);

  // Cancel any prior schedule with this identifier first. iOS replaces
  // by id but a different code path may have leaked an unprefixed id
  // before this fix shipped; the cancel guarantees idempotency.
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_CHECKIN_REMINDER_ID);
  } catch {
    /* no-op if nothing to cancel */
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    identifier: DAILY_CHECKIN_REMINDER_ID,
    content: {
      title: 'Time for your daily check-in',
      body: 'How are you feeling today? Log your mood, energy, and peptide effects.',
      sound: 'default',
      data: { type: 'check-in', route: '/(tabs)/check-in' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      hour: hours,
      minute: minutes,
      channelId: Platform.OS === 'android' ? 'reminders' : undefined,
    },
  });

  return identifier;
}

// ─── Schedule Dose Reminder ──────────────────────────────────────────────────

export async function scheduleDoseReminder(
  peptideId: string,
  peptideName: string,
  time: string,
  frequency: string,
): Promise<string> {
  if (!isAvailable()) return '';

  // Stable per-peptide prefix lets cancelDoseReminders(peptideId) sweep
  // all triggers we registered for this protocol — re-activating the
  // same protocol no longer stacks duplicates (P1 from push audit).
  // Sweep first, then schedule the fresh set.
  await cancelDoseRemindersFor(peptideId);

  const [hours, minutes] = time.split(':').map(Number);
  const triggers = buildTriggersForFrequency(frequency, hours, minutes);

  const ids: string[] = [];
  for (let i = 0; i < triggers.length; i++) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${peptideName} Dose Reminder`,
        body: 'Time to take your scheduled dose.',
        sound: 'default',
        data: {
          peptideId,
          frequency,
          type: 'dose',
          route: '/(tabs)/calendar',
        },
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger: triggers[i],
      identifier: triggers.length === 1
        ? `dose-${peptideId}`
        : `dose-${peptideId}-slot-${i}`,
    });
    ids.push(id);
  }

  // Return the first id for back-compat with single-id callers.
  return ids[0] ?? '';
}

/** Cancel all dose reminders scheduled for a specific peptide. */
export async function cancelDoseRemindersFor(peptideId: string): Promise<void> {
  if (!isAvailable()) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const prefix = `dose-${peptideId}`;
  const toCancel = scheduled.filter((n: any) => {
    const id = n.identifier ?? '';
    return id === prefix || id.startsWith(`${prefix}-`);
  });
  for (const n of toCancel as any[]) {
    try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch { /* ignore */ }
  }
}

// ─── Cancel All Reminders ────────────────────────────────────────────────────

export async function cancelAllReminders(): Promise<void> {
  if (!isAvailable()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── Cancel Reminders By Tag ─────────────────────────────────────────────────

export async function cancelRemindersByTag(tag: string): Promise<void> {
  if (!isAvailable()) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(
    (n: any) => n.identifier && n.identifier.startsWith(tag),
  );

  await Promise.all(
    toCancel.map((n: any) =>
      Notifications.cancelScheduledNotificationAsync(n.identifier),
    ),
  );
}

// ─── Schedule Workout Reminder ────────────────────────────────────────────────

export async function scheduleWorkoutReminder(
  dayName: string,
  time: string,
): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);
  const weekday = dayNameToWeekday(dayName);

  const trigger =
    weekday != null
      ? {
          type: Notifications?.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly',
          weekday,
          hour: hours,
          minute: minutes,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        }
      : {
          type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
          hour: hours,
          minute: minutes,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        };

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Workout Reminder',
      body: `Time to get moving! Your ${dayName} workout is ready.`,
      sound: 'default',
      data: { type: 'workout', dayName },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger,
    identifier: `workout-${dayName.toLowerCase()}-${Date.now()}`,
  });

  return identifier;
}

// ─── Schedule Meal Reminder ──────────────────────────────────────────────────

export async function scheduleMealReminder(
  mealType: string,
  time: string,
): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${capitalize(mealType)} Reminder`,
      body: `Time to prep your ${mealType}. Stay on track with your nutrition goals!`,
      sound: 'default',
      data: { type: 'meal', mealType },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      hour: hours,
      minute: minutes,
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    identifier: `meal-${mealType.toLowerCase()}-${Date.now()}`,
  });

  return identifier;
}

// ─── Schedule Weekly Report ──────────────────────────────────────────────────

export async function scheduleWeeklyReport(): Promise<string> {
  if (!isAvailable()) return '';

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Weekly Progress Report',
      body: 'Your weekly summary is ready. See how you did this week!',
      sound: 'default',
      data: { type: 'weekly-report' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications?.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly',
      weekday: 1, // Sunday (Expo uses 1 = Sunday)
      hour: 19,
      minute: 0,
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    identifier: `weekly-report-${Date.now()}`,
  });

  return identifier;
}

// ─── Reschedule All From Plan ────────────────────────────────────────────────

export async function rescheduleAllFromPlan(
  reminders: Array<{ type: string; time: string; dayOfWeek?: number }>,
): Promise<string[]> {
  if (!isAvailable()) return [];

  // Cancel everything first
  await Notifications.cancelAllScheduledNotificationsAsync();

  const identifiers: string[] = [];

  for (const reminder of reminders) {
    const [hours, minutes] = reminder.time.split(':').map(Number);
    const isWeekly = reminder.dayOfWeek != null;

    const trigger = isWeekly
      ? {
          type: Notifications?.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly',
          weekday: reminder.dayOfWeek!,
          hour: hours,
          minute: minutes,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        }
      : {
          type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
          hour: hours,
          minute: minutes,
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        };

    const title = reminderTitle(reminder.type);
    const body = reminderBody(reminder.type);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: { type: reminder.type },
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      },
      trigger,
      identifier: `plan-${reminder.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });

    identifiers.push(id);
  }

  return identifiers;
}

// ─── Cancel All ──────────────────────────────────────────────────────────────

export async function cancelAll(): Promise<void> {
  if (!isAvailable()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── Mid-day macro deficit nudge (Master Refactor Plan v3.1 §6.4) ────────────

/**
 * Fire a one-off local notification when an enabled macro is tracking
 * meaningfully short past midday. Called from the foreground sync
 * handler in app/_layout.tsx — content is computed at fire time so the
 * deficit reflects what the user has actually logged today (a daily
 * pre-scheduled notification can't do that).
 *
 * Single-fire per day per macro: keyed by `macro_nudge_<kind>_<YYYY-MM-DD>`.
 * If we have already fired today, no-op.
 */
const NUDGE_THRESHOLD_PCT = 0.6; // fire when < 60% of target
const NUDGE_AFTER_HOUR = 14; // local time (14:00 = 2pm)

export async function checkMidDayMacroDeficit(args: {
  totalsByMacro: {
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  targetsByMacro: {
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  prefs: {
    proteinDeficitNudge: boolean;
    carbsDeficitNudge: boolean;
    fatDeficitNudge: boolean;
    fiberDeficitNudge: boolean;
  };
}): Promise<void> {
  if (!isAvailable()) return;
  const now = new Date();
  if (now.getHours() < NUDGE_AFTER_HOUR) return;

  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const macros: Array<{
    key: 'protein' | 'carbs' | 'fat' | 'fiber';
    label: string;
    enabled: boolean;
  }> = [
    { key: 'protein', label: 'Protein', enabled: args.prefs.proteinDeficitNudge },
    { key: 'carbs', label: 'Carbs', enabled: args.prefs.carbsDeficitNudge },
    { key: 'fat', label: 'Fat', enabled: args.prefs.fatDeficitNudge },
    { key: 'fiber', label: 'Fiber', enabled: args.prefs.fiberDeficitNudge },
  ];

  for (const m of macros) {
    if (!m.enabled) continue;
    const target = args.targetsByMacro[m.key];
    const current = args.totalsByMacro[m.key];
    if (!target || target <= 0) continue;
    if (current >= target * NUDGE_THRESHOLD_PCT) continue;
    const id = `macro_nudge_${m.key}_${dateKey}`;
    // Check if we already fired today by looking at delivered + scheduled.
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      if (scheduled?.some?.((n: any) => n.identifier === id)) continue;
    } catch {
      /* no-op */
    }
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: `${m.label} is low today`,
          body: `Let's focus on getting more ${m.label.toLowerCase()} in your next meals.`,
          sound: 'default',
          data: { type: 'macro_nudge', macro: m.key, route: '/(tabs)/nutrition' },
          ...(Platform.OS === 'android' && { channelId: 'reminders' }),
        },
        trigger: null, // immediate
      });
    } catch (err) {
      if (__DEV__)
        // eslint-disable-next-line no-console
        console.warn(`[notif] macro nudge ${m.key} failed:`, err);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns an array of OS triggers for the given protocol frequency.
 * Multi-day cadences (biw, tiw, biweekly) produce multiple weekly
 * triggers — the caller schedules one notification per element.
 *
 * Earlier this function returned a single trigger and silently fell
 * through to 'daily' for every cadence except 'weekly', meaning
 * every-other-day, twice-weekly, and biweekly protocols fired EVERY
 * DAY. P1 from Wave 76.9 push audit.
 */
function buildTriggersForFrequency(
  frequency: string,
  hours: number,
  minutes: number,
): any[] {
  const dailyType = Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily';
  const weeklyType = Notifications?.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly';
  const channelId = Platform.OS === 'android' ? 'reminders' : undefined;
  const wk = (weekday: number) => ({
    type: weeklyType,
    weekday,
    hour: hours,
    minute: minutes,
    channelId,
  });

  // Expo weekday convention: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat.
  switch (frequency) {
    case 'daily':
      return [{ type: dailyType, hour: hours, minute: minutes, channelId }];
    case 'weekly':
    case 'biweekly': // every 2 wks — OS can't model exactly; fire same weekday weekly
      return [wk(2)]; // Mon
    case 'biw': // bi-weekly = TWICE per week (Mon + Thu)
    case 'twice_weekly':
      return [wk(2), wk(5)];
    case 'tiw': // tri-weekly = THREE times per week (Mon + Wed + Fri)
    case 'thrice_weekly':
    case 'triweekly':
      return [wk(2), wk(4), wk(6)];
    case 'eod':
    case 'every_other_day':
      // OS doesn't model every-other-day natively. Approximate as
      // Mon/Wed/Fri/Sun (4×/week) which is close to 3.5×/week target.
      return [wk(1), wk(2), wk(4), wk(6)];
    default:
      // Unknown frequency — fall back to daily and log so we notice.
      if (__DEV__) console.warn('[notif] unknown frequency, defaulting to daily:', frequency);
      return [{ type: dailyType, hour: hours, minute: minutes, channelId }];
  }
}

// Back-compat shim — old callers got a single trigger. Returns the
// first trigger so existing single-trigger schedule sites keep working
// during migration. New call sites should use buildTriggersForFrequency.
function buildTriggerForFrequency(frequency: string, hours: number, minutes: number): any {
  return buildTriggersForFrequency(frequency, hours, minutes)[0];
}

/** Convert a day name (e.g. "Monday") to Expo weekday number (1=Sun … 7=Sat). */
function dayNameToWeekday(dayName: string): number | null {
  const map: Record<string, number> = {
    sunday: 1,
    monday: 2,
    tuesday: 3,
    wednesday: 4,
    thursday: 5,
    friday: 6,
    saturday: 7,
  };
  return map[dayName.toLowerCase()] ?? null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function reminderTitle(type: string): string {
  switch (type) {
    case 'workout':
      return 'Workout Reminder';
    case 'breakfast':
    case 'lunch':
    case 'dinner':
    case 'meal':
      return `${capitalize(type)} Reminder`;
    case 'check-in':
      return 'Daily Check-In';
    case 'dose':
      return 'Dose Reminder';
    case 'weekly-report':
      return 'Weekly Progress Report';
    default:
      return 'PepTalk Reminder';
  }
}

function reminderBody(type: string): string {
  switch (type) {
    case 'workout':
      return 'Time to get moving! Your workout is ready.';
    case 'breakfast':
      return 'Start your day right — time to prep breakfast!';
    case 'lunch':
      return 'Lunch time! Stay fueled and on track.';
    case 'dinner':
      return 'Dinner time! Keep your nutrition goals going.';
    case 'meal':
      return 'Time to prep your next meal.';
    case 'check-in':
      return 'How are you feeling today? Log your mood and energy.';
    case 'dose':
      return 'Time to take your scheduled dose.';
    case 'weekly-report':
      return 'Your weekly summary is ready. See how you did!';
    case 'motivation':
      return getRandomMotivation();
    default:
      return 'You have a PepTalk reminder.';
  }
}

// ─── Motivational Messages ──────────────────────────────────────────────────

const MOTIVATIONAL_MESSAGES = [
  "You're showing up for yourself today. That's the hardest part, and you've already done it.",
  "Progress isn't always visible. Trust the process — your body is rebuilding right now.",
  "Small daily choices compound into massive results. Keep going.",
  "Your consistency is your superpower. Every check-in, every meal, every workout matters.",
  "Recovery is productive. Rest days are growth days.",
  "You're not just tracking data — you're building a healthier future.",
  "The best investment you'll ever make is in your own health. Keep investing.",
  "Drink your water. Move your body. Feed it well. You've got this.",
  "Every rep, every meal, every good night's sleep brings you closer to your goals.",
  "Your body is a reflection of what you consistently do. Stay the course.",
  "You don't need to be perfect. You just need to keep showing up.",
  "Think about where you were 30 days ago. Now imagine 30 days from now. Keep going.",
  "The fact that you're using this app means you care about your health. That already puts you ahead.",
  "Today is a new opportunity to move toward the person you want to become.",
  "Health isn't a destination — it's how you travel. Enjoy the journey.",
];

function getRandomMotivation(): string {
  return MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
}

// ─── Schedule Daily Check-In Reminder ──────────────────────────────────────

export async function scheduleCheckInReminder(time: string = '20:00'): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily Check-In',
      body: 'How are you feeling today? Take 30 seconds to log your mood, energy, and recovery.',
      sound: 'default',
      data: { type: 'check-in', route: '/(tabs)/check-in' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      hour: hours,
      minute: minutes,
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    identifier: `checkin-daily-${Date.now()}`,
  });

  return identifier;
}

// ─── Schedule Daily Motivation ─────────────────────────────────────────────

export async function scheduleDailyMotivation(time: string = '08:00'): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PepTalk',
      body: getRandomMotivation(),
      sound: 'default',
      data: { type: 'motivation' },
      ...(Platform.OS === 'android' && { channelId: 'motivation' }),
    },
    trigger: {
      type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      hour: hours,
      minute: minutes,
      ...(Platform.OS === 'android' && { channelId: 'motivation' }),
    },
    identifier: `motivation-daily-${Date.now()}`,
  });

  return identifier;
}

// ─── Schedule Health Goal Reminder ─────────────────────────────────────────

export async function scheduleGoalReminder(
  goalName: string,
  message: string,
  time: string,
  frequency: 'daily' | 'weekly' = 'daily',
  dayOfWeek?: number,
): Promise<string> {
  if (!isAvailable()) return '';

  const [hours, minutes] = time.split(':').map(Number);
  const trigger = frequency === 'weekly' && dayOfWeek != null
    ? {
        type: Notifications?.SchedulableTriggerInputTypes?.WEEKLY ?? 'weekly',
        weekday: dayOfWeek,
        hour: hours,
        minute: minutes,
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      }
    : {
        type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
        hour: hours,
        minute: minutes,
        ...(Platform.OS === 'android' && { channelId: 'reminders' }),
      };

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: goalName,
      body: message,
      sound: 'default',
      data: { type: 'goal', goalName },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger,
    identifier: `goal-${goalName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
  });

  return identifier;
}

// ─── Schedule Meal Safety Checks ───────────────────────────────────────────

/**
 * Schedule a daily 9am local-time reminder that the app will check the
 * user's meal preps for approaching expiry. This only schedules the
 * wake-up; the actual "which preps" decision happens when the app
 * opens and reads the meal store. Safe to call multiple times —
 * cancels any prior instance first.
 *
 * No-op until expo-notifications is re-enabled (see file header).
 */
export async function scheduleMealSafetyChecks(hour: number = 9, minute: number = 0): Promise<string> {
  if (!isAvailable()) return '';

  // Cancel any previous food-safety reminders so we don't stack duplicates
  await cancelRemindersByTag('meal-safety-');

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Food safety check',
      body: 'Tap to see which meal preps are expiring or need to be frozen.',
      sound: 'default',
      data: { type: 'meal-safety', route: '/(tabs)/nutrition' },
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    trigger: {
      type: Notifications?.SchedulableTriggerInputTypes?.DAILY ?? 'daily',
      hour,
      minute,
      ...(Platform.OS === 'android' && { channelId: 'reminders' }),
    },
    identifier: `meal-safety-daily-${Date.now()}`,
  });

  return identifier;
}

// ─── Get All Scheduled Reminders ───────────────────────────────────────────

export async function getScheduledReminders(): Promise<Array<{
  id: string;
  type: string;
  title: string;
  body: string;
  trigger: any;
}>> {
  if (!isAvailable()) return [];

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map((n: any) => ({
      id: n.identifier,
      type: n.content?.data?.type ?? 'unknown',
      title: n.content?.title ?? '',
      body: n.content?.body ?? '',
      trigger: n.trigger,
    }));
  } catch {
    return [];
  }
}
