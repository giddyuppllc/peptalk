import { protocolAlertsFor, scheduleProtocolAlerts, cancelProtocolAlerts, VIAL_LIFE_DAYS } from '../protocolAlerts';

const mockScheduled: { identifier: string }[] = [];
const mockSchedule = jest.fn(async (n: { identifier: string }) => { mockScheduled.push({ identifier: n.identifier }); });
const mockCancel = jest.fn(async (_id: string) => {});
const mockWebSave = jest.fn(async (..._a: unknown[]) => true);
const mockWebDelete = jest.fn(async (..._a: unknown[]) => {});
let mockOS = 'ios';
jest.mock('react-native', () => ({ Platform: { get OS() { return mockOS; } } }));
jest.mock('../notificationService', () => ({ notificationsAvailable: () => true }));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (n: { identifier: string }) => mockSchedule(n),
  getAllScheduledNotificationsAsync: async () => [
    { identifier: 'protocol-bpc-157-vial-expiry' },
    { identifier: 'protocol-bpc-157-cycle-end' },
    { identifier: 'dose-bpc-157' },
    { identifier: 'protocol-tb-500-cycle-end' },
  ],
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}), { virtual: true });
jest.mock('../webPush', () => ({
  saveWebOneShot: (...a: unknown[]) => mockWebSave(...a),
  deleteWebOneShotsByPrefix: (...a: unknown[]) => mockWebDelete(...a),
}));

beforeEach(() => { mockScheduled.length = 0; jest.clearAllMocks(); mockOS = 'ios'; });

test('vial expiry 28 days after start and cycle end on the end date, both 9 AM, original wording', () => {
  const [vial, cycle] = protocolAlertsFor({ peptideId: 'bpc-157', peptideName: 'BPC-157', startDate: '2026-11-05', endDate: '2027-01-28', weeks: 12 });
  expect(vial.identifier).toBe('protocol-bpc-157-vial-expiry');
  expect([vial.fireAt.getFullYear(), vial.fireAt.getMonth(), vial.fireAt.getDate(), vial.fireAt.getHours()]).toEqual([2026, 11, 3, 9]);
  expect(vial.title).toBe('BPC-157 vial expiring');
  expect(vial.body).toContain(`${VIAL_LIFE_DAYS} days old today`);
  expect(cycle.identifier).toBe('protocol-bpc-157-cycle-end');
  expect([cycle.fireAt.getMonth(), cycle.fireAt.getDate(), cycle.fireAt.getHours()]).toEqual([0, 28, 9]);
  expect(cycle.body).toContain('planned 12-week cycle ends today');
});

test('no end date → no cycle-end alert', () => {
  expect(protocolAlertsFor({ peptideId: 'x', peptideName: 'X', startDate: '2026-11-05' })).toHaveLength(1);
});

test('native schedules local notifications and skips past times', async () => {
  const alerts = protocolAlertsFor({ peptideId: 'bpc-157', peptideName: 'BPC-157', startDate: '2026-11-05', endDate: '2027-01-28' });
  await scheduleProtocolAlerts(alerts, new Date('2026-12-10T00:00:00'));
  expect(mockScheduled.map((n) => n.identifier)).toEqual(['protocol-bpc-157-cycle-end']);
});

test('web saves server-sent one-shots instead', async () => {
  mockOS = 'web';
  const alerts = protocolAlertsFor({ peptideId: 'bpc-157', peptideName: 'BPC-157', startDate: '2026-11-05', endDate: '2027-01-28' });
  await scheduleProtocolAlerts(alerts, new Date('2026-11-05T10:00:00'));
  expect(mockWebSave).toHaveBeenCalledTimes(2);
  expect(mockSchedule).not.toHaveBeenCalled();
});

test('cancel removes only that protocol\'s alerts (native) / by prefix (web)', async () => {
  await cancelProtocolAlerts('bpc-157');
  expect(mockCancel.mock.calls.map((c) => c[0])).toEqual(['protocol-bpc-157-vial-expiry', 'protocol-bpc-157-cycle-end']);
  mockOS = 'web';
  await cancelProtocolAlerts('bpc-157');
  expect(mockWebDelete).toHaveBeenCalledWith('protocol-bpc-157-');
});
