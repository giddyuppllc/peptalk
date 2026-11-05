/** Reminders are unavailable on web: the expo-notifications web scheduler is a stub. */
import { notificationsAvailable, scheduleDoseReminder, cancelRemindersByTag } from '../notificationService';

jest.mock('react-native', () => ({ Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { appOwnership: null, expoConfig: {} } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
const mockSchedule = jest.fn(() => {
  throw new Error('UnavailabilityError: scheduleNotificationAsync is not available on web');
});
const mockGetAll = jest.fn(() => {
  throw new Error('UnavailabilityError');
});
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: mockSchedule, getAllScheduledNotificationsAsync: mockGetAll }), { virtual: true });
jest.mock('expo-device', () => ({}), { virtual: true });

it('reports unavailable on web and never calls the throwing web stub', async () => {
  expect(notificationsAvailable()).toBe(false);
  await expect(scheduleDoseReminder('bpc-157', 'BPC-157', '09:00', 'daily')).resolves.toBe('');
  await expect(cancelRemindersByTag('protocol-bpc-157-')).resolves.toBeUndefined();
  expect(mockSchedule).not.toHaveBeenCalled();
  expect(mockGetAll).not.toHaveBeenCalled();
});
