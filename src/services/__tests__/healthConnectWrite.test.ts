/**
 * Health Connect write-back (Android).
 *
 * The published privacy policy said "Android Health Connect — same as
 * HealthKit", but the facade's writers were a hard `if (!isIOS) return false`.
 * The check-in screen called writeWeightToHealth on Android, got false, and
 * nothing was ever written. Nobody noticed because a silent false looks
 * exactly like "the user didn't connect Health Connect".
 *
 * Two things are pinned here:
 *   1. the writer actually inserts a Weight record, in pounds, and reports
 *      failure when nothing lands;
 *   2. the permission request asks for the WRITE scope even when the read
 *      scopes are already granted — the original code returned early on
 *      `existing.length > 0`, which would starve write-permission forever for
 *      every existing user.
 */

const mockInsertRecords = jest.fn();
const mockRequestPermission = jest.fn();
const mockGetGrantedPermissions = jest.fn();

jest.mock(
  'react-native-health-connect',
  () => ({
    getSdkStatus: jest.fn().mockResolvedValue(3), // SDK_AVAILABLE
    initialize: jest.fn().mockResolvedValue(true),
    insertRecords: (...a: unknown[]) => mockInsertRecords(...a),
    requestPermission: (...a: unknown[]) => mockRequestPermission(...a),
    getGrantedPermissions: (...a: unknown[]) => mockGetGrantedPermissions(...a),
    readRecords: jest.fn().mockResolvedValue({ records: [] }),
  }),
  { virtual: true },
);

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const READ_TYPES = ['Steps', 'SleepSession', 'HeartRate', 'ActiveCaloriesBurned', 'Weight', 'BodyFat'];

// Fresh module per test — the service caches its init promise at module scope.
const loadService = () => {
  let mod: typeof import('../healthConnectService');
  jest.isolateModules(() => {
    mod = require('../healthConnectService');
  });
  return mod!;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertRecords.mockResolvedValue(['record-id-1']);
  mockRequestPermission.mockResolvedValue([]);
  mockGetGrantedPermissions.mockResolvedValue([]);
});

describe('saveWeightToHealthConnect', () => {
  it('writes a Weight record in pounds and reports success', async () => {
    const { saveWeightToHealthConnect } = loadService();
    const when = new Date('2026-08-24T12:00:00.000Z');

    await expect(saveWeightToHealthConnect(184.2, when)).resolves.toBe(true);

    expect(mockInsertRecords).toHaveBeenCalledTimes(1);
    const [records] = mockInsertRecords.mock.calls[0] as [any[]];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      recordType: 'Weight',
      time: when.toISOString(),
      weight: { value: 184.2, unit: 'pounds' },
    });
  });

  it('reports failure when Health Connect accepts nothing', async () => {
    const { saveWeightToHealthConnect } = loadService();
    mockInsertRecords.mockResolvedValue([]); // no ids back = nothing landed
    await expect(saveWeightToHealthConnect(180)).resolves.toBe(false);
  });

  it('reports failure when the insert throws', async () => {
    const { saveWeightToHealthConnect } = loadService();
    mockInsertRecords.mockRejectedValue(new Error('permission denied'));
    await expect(saveWeightToHealthConnect(180)).resolves.toBe(false);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses to write a nonsense weight (%p) and does not call the SDK',
    async (bad) => {
      const { saveWeightToHealthConnect } = loadService();
      await expect(saveWeightToHealthConnect(bad as number)).resolves.toBe(false);
      expect(mockInsertRecords).not.toHaveBeenCalled();
    },
  );
});

describe('requestHealthConnectPermissions', () => {
  it('requests the WRITE scope even when every READ scope is already granted', async () => {
    const { requestHealthConnectPermissions } = loadService();
    // Exactly the state of every existing Android user before this change.
    mockGetGrantedPermissions.mockResolvedValue(
      READ_TYPES.map((recordType) => ({ accessType: 'read', recordType })),
    );
    mockRequestPermission.mockResolvedValue([
      ...READ_TYPES.map((recordType) => ({ accessType: 'read', recordType })),
      { accessType: 'write', recordType: 'Weight' },
    ]);

    await expect(requestHealthConnectPermissions()).resolves.toBe(true);

    // The old code returned true here without prompting at all.
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    const [requested] = mockRequestPermission.mock.calls[0] as [any[]];
    expect(requested).toEqual(
      expect.arrayContaining([{ accessType: 'write', recordType: 'Weight' }]),
    );
  });

  it('skips the prompt only when read AND write are already held', async () => {
    const { requestHealthConnectPermissions } = loadService();
    mockGetGrantedPermissions.mockResolvedValue([
      ...READ_TYPES.map((recordType) => ({ accessType: 'read', recordType })),
      { accessType: 'write', recordType: 'Weight' },
    ]);

    await expect(requestHealthConnectPermissions()).resolves.toBe(true);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
