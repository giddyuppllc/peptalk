import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { NotificationPreferences } from '../types';

// ─── Store Interface ─────────────────────────────────────────────────────────

interface NotificationStore {
  /** Whether persist has finished rehydrating. The boot-time
   *  scheduler at app/_layout.tsx MUST gate any
   *  scheduleNotificationAsync call on this — otherwise the in-memory
   *  defaults (e.g. dailyCheckInReminder=true) schedule notifications
   *  the user previously turned OFF, because the actual preferences
   *  haven't been loaded from secureStorage yet. */
  hasHydrated: boolean;
  preferences: NotificationPreferences;
  pushToken: string | null;
  setEnabled: (enabled: boolean) => void;
  setDailyCheckInReminder: (enabled: boolean) => void;
  setCheckInReminderTime: (time: string) => void;
  setDoseReminders: (enabled: boolean) => void;
  setPushToken: (token: string) => void;
  setWorkoutReminderEnabled: (enabled: boolean) => void;
  setWorkoutReminder: (time: string, days: number[]) => void;
  setWorkoutReminderTime: (time: string) => void;
  setMealRemindersEnabled: (enabled: boolean) => void;
  setMealReminderTime: (meal: string, time: string) => void;
  toggleWeeklyReport: () => void;
  setMealSafetyReminders: (enabled: boolean) => void;
  setMealSafetyReminderTime: (time: string) => void;
}

// ─── Default Preferences ─────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  dailyCheckInReminder: true,
  checkInReminderTime: '09:00',
  doseReminders: true,
  workoutReminderEnabled: false,
  workoutReminderTime: '08:00',
  workoutReminderDays: [2, 4, 6], // Mon, Wed, Fri
  mealRemindersEnabled: false,
  mealReminderTimes: { breakfast: '07:00', lunch: '12:00', dinner: '18:00' },
  weeklyReportEnabled: false,
  // §6.4 — protein nudge on by default; others off.
  proteinDeficitNudge: true,
  carbsDeficitNudge: false,
  fatDeficitNudge: false,
  fiberDeficitNudge: false,
  // Food-safety reminder — daily 09:00 by default; safety feature, not paywall.
  mealSafetyReminders: true,
  mealSafetyReminderTime: '09:00',
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      // ── Initial State ──────────────────────────────────────────────────────
      hasHydrated: false,
      preferences: { ...DEFAULT_PREFERENCES },
      pushToken: null,

      // ── Actions ────────────────────────────────────────────────────────────

      setEnabled: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, enabled },
        })),

      setDailyCheckInReminder: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, dailyCheckInReminder: enabled },
        })),

      setCheckInReminderTime: (time: string) =>
        set((state) => ({
          preferences: { ...state.preferences, checkInReminderTime: time },
        })),

      setDoseReminders: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, doseReminders: enabled },
        })),

      setPushToken: (token: string) =>
        set({ pushToken: token }),

      setWorkoutReminderEnabled: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, workoutReminderEnabled: enabled },
        })),

      setWorkoutReminder: (time: string, days: number[]) =>
        set((state) => ({
          preferences: { ...state.preferences, workoutReminderTime: time, workoutReminderDays: days },
        })),

      setWorkoutReminderTime: (time: string) =>
        set((state) => ({
          preferences: { ...state.preferences, workoutReminderTime: time },
        })),

      setMealRemindersEnabled: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, mealRemindersEnabled: enabled },
        })),

      setMealReminderTime: (meal: string, time: string) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            mealReminderTimes: { ...state.preferences.mealReminderTimes, [meal]: time },
          },
        })),

      toggleWeeklyReport: () =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            weeklyReportEnabled: !state.preferences.weeklyReportEnabled,
          },
        })),

      setMealSafetyReminders: (enabled: boolean) =>
        set((state) => ({
          preferences: { ...state.preferences, mealSafetyReminders: enabled },
        })),

      setMealSafetyReminderTime: (time: string) =>
        set((state) => ({
          preferences: { ...state.preferences, mealSafetyReminderTime: time },
        })),
    }),
    {
      name: 'peptalk-notifications',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        preferences: state.preferences,
        pushToken: state.pushToken,
      }),
      onRehydrateStorage: () => (state) => {
        // Ensure all preference keys exist after rehydration (handles
        // migrations when new fields are added in future updates).
        useNotificationStore.setState({
          hasHydrated: true,
          preferences: state
            ? { ...DEFAULT_PREFERENCES, ...state.preferences }
            : { ...DEFAULT_PREFERENCES },
        });
      },
    },
  ),
);
