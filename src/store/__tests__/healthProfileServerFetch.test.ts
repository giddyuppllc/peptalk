/**
 * syncHealthProfileFromServer must say what it found.
 *
 * The onboarding restore decides on this result, so "the user has no row" and
 * "could not ask" must not look alike. The old version ignored `error`, which
 * made a PostgREST failure read exactly like an empty profile.
 *
 * jest.mock calls below are hoisted above the import by babel-jest.
 */
import {
  useHealthProfileStore,
  syncHealthProfileFromServer as realSync,
} from '../useHealthProfileStore';

const mockGetUser = jest.fn();
const mockMaybeSingle = jest.fn();

const client = {
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a) }),
      }),
    }),
  },
};
const syncHealthProfileFromServer = () => realSync(async () => client);

jest.mock('../../services/syncService', () => ({
  syncHealthProfile: jest.fn().mockResolvedValue(true),
  syncRecord: jest.fn().mockResolvedValue(true),
  getCurrentUserId: jest.fn().mockResolvedValue('user-a'),
  deleteRecord: jest.fn().mockResolvedValue(undefined),
  deleteRecordsBy: jest.fn().mockResolvedValue(true),
  fetchUserRecords: jest.fn().mockResolvedValue([]),
  hydrateFromServer: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const row = { bodyMetrics: { weightLbs: 170 }, onboarding: { version: 1 } };

beforeEach(() => {
  jest.clearAllMocks();
  useHealthProfileStore.getState().resetProfile();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
  mockMaybeSingle.mockResolvedValue({ data: { profile: row, current_step: 2 }, error: null });
});

describe('syncHealthProfileFromServer', () => {
  it('returns the row and applies it (server wins)', async () => {
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'ok', userId: 'user-a', profile: row });
    expect(useHealthProfileStore.getState().profile).toEqual(row);
  });

  it('no row is ok with a null profile, and leaves local state alone', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const before = useHealthProfileStore.getState().profile;
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'ok', userId: 'user-a', profile: null });
    expect(useHealthProfileStore.getState().profile).toBe(before);
  });

  it('a query error is an error, not an empty profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'error' });
  });

  it('no session is signed-out', async () => {
    const missing = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: missing });
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'signed-out' });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('an auth failure that is not "no session" is an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' }) });
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'error' });
  });

  it('a throw is an error', async () => {
    mockGetUser.mockRejectedValue(new Error('offline'));
    await expect(syncHealthProfileFromServer()).resolves.toEqual({ status: 'error' });
  });

  it('concurrent callers share one request', async () => {
    const results = await Promise.all([
      syncHealthProfileFromServer(),
      syncHealthProfileFromServer(),
      syncHealthProfileFromServer(),
    ]);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('asks again once the previous request has finished', async () => {
    await syncHealthProfileFromServer();
    await syncHealthProfileFromServer();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });
});
