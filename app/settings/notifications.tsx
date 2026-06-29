/**
 * Notification settings — exposes the persisted preference fields that
 * useNotificationStore has been collecting but never had a UI for.
 *
 * Toggles + time pickers for: daily check-in, dose reminders, workouts,
 * meals (breakfast/lunch/dinner), weekly report. Master "Enabled" switch
 * at the top hides everything else when off.
 *
 * Each toggle is independently persisted; we don't reschedule notifs
 * on the device here — that responsibility lives in notificationService
 * + boot effects in app/_layout.tsx so the user's choice takes effect on
 * next launch / next sync.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useNotificationStore } from '../../src/store/useNotificationStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { getPeptideById } from '../../src/data/peptides';
import {
  scheduleDoseReminder,
  scheduleWorkoutReminder,
  scheduleMealReminder,
  cancelRemindersByTag,
} from '../../src/services/notificationService';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Expo weekday numbers are 1=Sun … 7=Sat; map to the day label
// scheduleWorkoutReminder expects (mirrors app/(tabs)/profile.tsx).
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Schedule workout reminders for the given days. */
async function rescheduleWorkouts(time: string, days: number[]): Promise<void> {
  for (const day of days) {
    const dayLabel = DAY_LABELS[day - 1] ?? 'Workout';
    await scheduleWorkoutReminder(dayLabel, time);
  }
}

/** Schedule meal reminders for all configured meal types. */
async function rescheduleAllMeals(mealTimes: Record<string, string>): Promise<void> {
  for (const [meal, time] of Object.entries(mealTimes)) {
    await scheduleMealReminder(meal, time);
  }
}

/**
 * Re-schedule dose reminders for every active protocol. Mirrors the auto-
 * scheduling useDoseLogStore does on protocol activation (08:00 default,
 * anchored to the protocol start date). scheduleDoseReminder sweeps the
 * peptide's existing identifiers first, so this is idempotent.
 */
async function rescheduleAllDoses(): Promise<void> {
  const protocols = useDoseLogStore
    .getState()
    .protocols.filter((p) => p.isActive);
  for (const protocol of protocols) {
    const peptideName = getPeptideById(protocol.peptideId)?.name ?? protocol.peptideId;
    await scheduleDoseReminder(
      protocol.peptideId,
      peptideName,
      '08:00',
      protocol.frequency,
      protocol.startDate,
    );
  }
}

interface TimeRowProps {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}

function TimeRow({ label, value, onCommit }: TimeRowProps) {
  const t = useTheme();
  const [draft, setDraft] = useState(value);

  const handleBlur = () => {
    const trimmed = draft.trim();
    if (TIME_REGEX.test(trimmed)) {
      onCommit(trimmed);
    } else {
      // Revert to last good value rather than show an error — most users
      // will fix it via re-tap; the silent revert avoids a modal in their face.
      setDraft(value);
    }
  };

  return (
    <View style={[styles.timeRow, { borderColor: t.cardBorder }]}>
      <Text style={[styles.timeLabel, { color: t.text }]}>{label}</Text>
      <TextInput
        style={[styles.timeInput, { color: t.text, borderColor: t.cardBorder }]}
        value={draft}
        onChangeText={setDraft}
        onBlur={handleBlur}
        placeholder="HH:MM"
        placeholderTextColor={t.textSecondary}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        maxLength={5}
        accessibilityLabel={`${label} time, 24 hour format`}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const prefs = useNotificationStore((s) => s.preferences);
  const setEnabled = useNotificationStore((s) => s.setEnabled);
  const setDailyCheckInReminder = useNotificationStore((s) => s.setDailyCheckInReminder);
  const setCheckInReminderTime = useNotificationStore((s) => s.setCheckInReminderTime);
  const setDoseReminders = useNotificationStore((s) => s.setDoseReminders);
  const setWorkoutReminderEnabled = useNotificationStore((s) => s.setWorkoutReminderEnabled);
  const setWorkoutReminderTime = useNotificationStore((s) => s.setWorkoutReminderTime);
  const setMealRemindersEnabled = useNotificationStore((s) => s.setMealRemindersEnabled);
  const setMealReminderTime = useNotificationStore((s) => s.setMealReminderTime);
  const toggleWeeklyReport = useNotificationStore((s) => s.toggleWeeklyReport);
  const setMealSafetyReminders = useNotificationStore((s) => s.setMealSafetyReminders);
  const setMealSafetyReminderTime = useNotificationStore((s) => s.setMealSafetyReminderTime);

  // Persist the dose-reminder flag AND make it take effect immediately:
  // (re)schedule reminders for active protocols when turned on, cancel the
  // scheduled-dose identifiers when turned off. Consistent with the
  // profile-tab dose toggle. The `dose-` (hyphen) prefix matches the
  // scheduled-dose identifiers without sweeping the `dose_missed_*` nudges.
  const handleToggleDose = async (value: boolean) => {
    setDoseReminders(value);
    if (value && prefs.enabled) {
      await rescheduleAllDoses();
    } else {
      await cancelRemindersByTag('dose-');
    }
  };

  // Persist the workout-reminder flag AND make it take effect immediately:
  // (re)schedule the per-day workout pings when turned on, sweep the
  // `workout-*` identifiers when turned off. Consistent with the dose
  // toggle above and the profile-tab workout toggle.
  const handleToggleWorkout = async (value: boolean) => {
    setWorkoutReminderEnabled(value);
    if (value && prefs.enabled) {
      await rescheduleWorkouts(prefs.workoutReminderTime, prefs.workoutReminderDays);
    } else {
      await cancelRemindersByTag('workout');
    }
  };

  // Persist the meal-reminder flag AND make it take effect immediately:
  // (re)schedule breakfast/lunch/dinner pings when turned on, cancel them
  // when turned off. We sweep the per-meal `meal-<type>-` prefixes
  // individually so we never touch the separate `meal-safety-` reminders.
  const handleToggleMeals = async (value: boolean) => {
    setMealRemindersEnabled(value);
    if (value && prefs.enabled) {
      await rescheduleAllMeals(prefs.mealReminderTimes);
    } else {
      // Meal ids are `meal-breakfast`/`meal-lunch`/`meal-dinner` (no trailing
      // dash); cancelRemindersByTag matches by startsWith, so the tag must NOT
      // carry a trailing dash or nothing gets cancelled.
      await cancelRemindersByTag('meal-breakfast');
      await cancelRemindersByTag('meal-lunch');
      await cancelRemindersByTag('meal-dinner');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Master switch */}
        <GlassCard style={styles.section}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: t.text }]}>Enable notifications</Text>
              <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                Master switch. When off, none of the reminders below fire.
              </Text>
            </View>
            <Switch
              value={prefs.enabled}
              onValueChange={setEnabled}
              trackColor={{ true: t.primary + '88', false: t.cardBorder }}
              thumbColor={prefs.enabled ? t.primary : '#fff'}
            />
          </View>
        </GlassCard>

        {prefs.enabled && (
          <>
            {/* Check-in */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Daily check-in reminder</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Nudge to log your mood, energy, and recovery.
                  </Text>
                </View>
                <Switch
                  value={prefs.dailyCheckInReminder}
                  onValueChange={setDailyCheckInReminder}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.dailyCheckInReminder ? t.primary : '#fff'}
                />
              </View>
              {prefs.dailyCheckInReminder && (
                <TimeRow
                  label="Time of day"
                  value={prefs.checkInReminderTime}
                  onCommit={setCheckInReminderTime}
                />
              )}
            </GlassCard>

            {/* Dose reminders */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Dose reminders</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Active protocols you've started fire reminders at their scheduled time
                    plus vial-expiry and cycle-end alerts.
                  </Text>
                </View>
                <Switch
                  value={prefs.doseReminders}
                  onValueChange={handleToggleDose}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.doseReminders ? t.primary : '#fff'}
                />
              </View>
            </GlassCard>

            {/* Workouts */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Workout reminders</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Remind you to train on your scheduled days.
                  </Text>
                </View>
                <Switch
                  value={prefs.workoutReminderEnabled}
                  onValueChange={handleToggleWorkout}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.workoutReminderEnabled ? t.primary : '#fff'}
                />
              </View>
              {prefs.workoutReminderEnabled && (
                <TimeRow
                  label="Time of day"
                  value={prefs.workoutReminderTime}
                  onCommit={setWorkoutReminderTime}
                />
              )}
            </GlassCard>

            {/* Meals */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Meal reminders</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Nudge to log breakfast, lunch, and dinner.
                  </Text>
                </View>
                <Switch
                  value={prefs.mealRemindersEnabled}
                  onValueChange={handleToggleMeals}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.mealRemindersEnabled ? t.primary : '#fff'}
                />
              </View>
              {prefs.mealRemindersEnabled && (
                <>
                  <TimeRow
                    label="Breakfast"
                    value={prefs.mealReminderTimes.breakfast}
                    onCommit={(v) => setMealReminderTime('breakfast', v)}
                  />
                  <TimeRow
                    label="Lunch"
                    value={prefs.mealReminderTimes.lunch}
                    onCommit={(v) => setMealReminderTime('lunch', v)}
                  />
                  <TimeRow
                    label="Dinner"
                    value={prefs.mealReminderTimes.dinner}
                    onCommit={(v) => setMealReminderTime('dinner', v)}
                  />
                </>
              )}
            </GlassCard>

            {/* Weekly report */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Weekly health report</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Sundays at 9 AM — recap of your week's check-ins, doses, workouts, and trends.
                  </Text>
                </View>
                <Switch
                  value={prefs.weeklyReportEnabled}
                  onValueChange={toggleWeeklyReport}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.weeklyReportEnabled ? t.primary : '#fff'}
                />
              </View>
            </GlassCard>

            {/* Food-safety reminder */}
            <GlassCard style={styles.section}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>Food-safety check</Text>
                  <Text style={[styles.rowSub, { color: t.textSecondary }]}>
                    Daily reminder to glance at your kitchen — meal preps that
                    are past their safe fridge window (or pantry items
                    expiring soon).
                  </Text>
                </View>
                <Switch
                  value={prefs.mealSafetyReminders}
                  onValueChange={setMealSafetyReminders}
                  trackColor={{ true: t.primary + '88', false: t.cardBorder }}
                  thumbColor={prefs.mealSafetyReminders ? t.primary : '#fff'}
                />
              </View>
              {prefs.mealSafetyReminders && (
                <TimeRow
                  label="Reminder time"
                  value={prefs.mealSafetyReminderTime}
                  onCommit={setMealSafetyReminderTime}
                />
              )}
            </GlassCard>

            <Text style={[styles.disclaimer, { color: t.textSecondary }]}>
              Notifications fire in your device's local timezone. If you travel,
              they follow you automatically.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 60,
    gap: Spacing.sm,
  },
  section: { padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: FontSizes.sm, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  timeLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  timeInput: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 80,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 15,
    fontStyle: 'italic',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
});
