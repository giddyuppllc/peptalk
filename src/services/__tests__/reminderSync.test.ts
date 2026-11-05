jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const calls: string[] = [];
jest.mock('../notificationService', () => ({
  scheduleDoseReminder: jest.fn(async (id: string) => { calls.push(`dose:${id}`); }),
  scheduleWorkoutReminder: jest.fn(async (d: string) => { calls.push(`workout:${d}`); }),
  scheduleMealReminder: jest.fn(async (m: string) => { calls.push(`meal:${m}`); }),
  scheduleDailyCheckInReminder: jest.fn(async () => { calls.push('checkin'); }),
  scheduleWeeklyReport: jest.fn(async () => { calls.push('weekly'); }),
  scheduleMealSafetyChecks: jest.fn(async () => { calls.push('safety'); }),
  cancelAll: jest.fn(async () => { calls.push('cancelAll'); }),
}));
const prefs: any = {
  enabled: true, dailyCheckInReminder: true, checkInReminderTime: '09:00', doseReminders: true,
  workoutReminderEnabled: true, workoutReminderTime: '08:00', workoutReminderDays: [2, 4],
  mealRemindersEnabled: false, mealReminderTimes: { breakfast: '07:00' },
  weeklyReportEnabled: false, mealSafetyReminders: true, mealSafetyReminderTime: '09:30',
};
jest.mock('../../store/useNotificationStore', () => ({ useNotificationStore: { getState: () => ({ preferences: prefs }) } }));
jest.mock('../../store/useDoseLogStore', () => ({
  useDoseLogStore: { getState: () => ({ protocols: [
    { peptideId: 'bpc-157', isActive: true, frequency: 'daily', startDate: '2026-11-01' },
    { peptideId: 'tb-500', isActive: false, frequency: 'daily', startDate: '2026-10-01' },
  ] }) },
}));
jest.mock('../protocolAlerts', () => ({
  protocolAlertsFor: (p: { peptideId: string }) => [{ identifier: `protocol-${p.peptideId}-vial-expiry` }],
  scheduleProtocolAlerts: async (a: { identifier: string }[]) => { a.forEach((x) => calls.push(`alert:${x.identifier}`)); },
}));
jest.mock('../../data/peptides', () => ({ getPeptideById: () => ({ name: 'BPC-157' }) }));

import { applyMasterSwitch } from '../reminderSync';

beforeEach(() => { calls.length = 0; });

test('master off cancels every scheduled local reminder and schedules nothing', async () => {
  await applyMasterSwitch(false);
  expect(calls).toEqual(['cancelAll']);
});

test('master on restores only the categories that are on', async () => {
  await applyMasterSwitch(true);
  expect(calls).toEqual(['checkin', 'dose:bpc-157', 'alert:protocol-bpc-157-vial-expiry', 'workout:Mon', 'workout:Wed', 'safety']);
});
