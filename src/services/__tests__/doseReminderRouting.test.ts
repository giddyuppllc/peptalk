/**
 * Native triggers still come out exactly as before the cadence moved to
 * supabase/functions/_shared/doseCadence.ts, and on web the same calls route
 * to the server-scheduled web push path.
 */
const mockPlatform = { OS: 'ios' as string };
jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null, expoConfig: {} } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
const mockSchedule = jest.fn(async (req: { identifier: string }) => req.identifier);
jest.mock(
  'expo-notifications',
  () => ({
    SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date' },
    scheduleNotificationAsync: (req: { identifier: string }) => mockSchedule(req),
    getAllScheduledNotificationsAsync: jest.fn(async () => []),
    cancelScheduledNotificationAsync: jest.fn(),
  }),
  { virtual: true },
);
jest.mock('expo-device', () => ({}), { virtual: true });
const mockWeb = {
  webPushSupported: jest.fn(() => true),
  saveWebDoseReminder: jest.fn(async () => 'web-dose-bpc-157'),
  deleteWebDoseReminder: jest.fn(async () => undefined),
  deleteAllWebDoseReminders: jest.fn(async () => undefined),
};
jest.mock('../webPush', () => mockWeb);

// required (not imported) so it loads after the mock state above exists
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scheduleDoseReminder, cancelRemindersByTag, cancelDoseRemindersFor, notificationsAvailable } =
  require('../notificationService') as typeof import('../notificationService');

beforeEach(() => {
  mockPlatform.OS = 'ios';
  mockSchedule.mockClear();
  Object.values(mockWeb).forEach((f) => f.mockClear());
});

const triggers = () => mockSchedule.mock.calls.map((c) => (c[0] as any).trigger);

describe('native triggers (unchanged by the shared cadence)', () => {
  it('daily', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '08:30', 'daily', '2026-11-04');
    expect(triggers()).toEqual([{ type: 'daily', hour: 8, minute: 30, channelId: undefined }]);
  });

  it('weekly on the start weekday (Wed = Expo 4)', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'weekly', '2026-11-04');
    expect(triggers()).toEqual([{ type: 'weekly', weekday: 4, hour: 9, minute: 0, channelId: undefined }]);
  });

  it('twice weekly: start weekday and +3 (Mon, Thu = Expo 2, 5)', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'biw', '2026-11-02');
    expect(triggers().map((t: any) => t.weekday)).toEqual([2, 5]);
  });

  it('three times weekly wraps the week (Fri, Sun, Tue = Expo 6, 1, 3)', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'tiw', '2026-11-06');
    expect(triggers().map((t: any) => t.weekday)).toEqual([6, 1, 3]);
  });

  it('no anchor falls back to Monday (Expo 2)', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'weekly');
    expect(triggers().map((t: any) => t.weekday)).toEqual([2]);
  });

  it('native never touches the web path', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'daily');
    expect(mockWeb.saveWebDoseReminder).not.toHaveBeenCalled();
  });
});

describe('web routing', () => {
  beforeEach(() => {
    mockPlatform.OS = 'web';
  });

  it('availability follows web push support', () => {
    expect(notificationsAvailable()).toBe(true);
    mockWeb.webPushSupported.mockReturnValueOnce(false);
    expect(notificationsAvailable()).toBe(false);
  });

  it('scheduling saves the server schedule with the same arguments, no OS scheduler', async () => {
    await scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'weekly', '2026-11-04');
    expect(mockWeb.saveWebDoseReminder).toHaveBeenCalledWith('bpc-157', 'BPC-157', '09:00', 'weekly', '2026-11-04');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('the dose toggle off (cancel "dose-") deletes every web dose reminder; other tags do nothing', async () => {
    await cancelRemindersByTag('dose-');
    expect(mockWeb.deleteAllWebDoseReminders).toHaveBeenCalledTimes(1);
    await cancelRemindersByTag('workout');
    expect(mockWeb.deleteAllWebDoseReminders).toHaveBeenCalledTimes(1);
  });

  it('deactivating a protocol deletes that peptide\'s web reminder', async () => {
    await cancelDoseRemindersFor('bpc-157');
    expect(mockWeb.deleteWebDoseReminder).toHaveBeenCalledWith('bpc-157');
  });
});
