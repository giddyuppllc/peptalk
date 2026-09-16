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
  abandonInflightServerProfile,
  healthProfileOwnerId,
  syncHealthProfileFromServer as realSync,
} from '../useHealthProfileStore';

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockMaybeSingle = jest.fn();

const client = {
  supabase: {
    auth: {
      getUser: (...a: unknown[]) => mockGetUser(...a),
      getSession: (...a: unknown[]) => mockGetSession(...a),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a) }),
      }),
    }),
  },
};
const syncHealthProfileFromServer = (userId: string | null = 'user-a') =>
  realSync(userId, async () => client);

/** Who the local session says is signed in, as the store's live check reads it. */
const signedInAs = (id: string | null) =>
  mockGetSession.mockResolvedValue({ data: { session: id ? { user: { id } } : null }, error: null });

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
  abandonInflightServerProfile();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
  signedInAs('user-a');
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

  it('concurrent callers FOR THE SAME ACCOUNT share one request', async () => {
    const results = await Promise.all([
      syncHealthProfileFromServer('user-a'),
      syncHealthProfileFromServer('user-a'),
      syncHealthProfileFromServer('user-a'),
    ]);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('a DIFFERENT account never inherits the in-flight request', async () => {
    // A's fetch is still out. B asks. Sharing here is what put A's profile in
    // front of B, so B must get a request of its own.
    let releaseA!: (v: unknown) => void;
    mockMaybeSingle.mockReturnValueOnce(new Promise((r) => (releaseA = r)));
    const a = syncHealthProfileFromServer('user-a');

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-b' } }, error: null });
    signedInAs('user-b');
    mockMaybeSingle.mockResolvedValue({ data: { profile: { bodyMetrics: { weightLbs: 210 } } }, error: null });
    const b = await syncHealthProfileFromServer('user-b');

    expect(b).toEqual({ status: 'ok', userId: 'user-b', profile: { bodyMetrics: { weightLbs: 210 } } });
    releaseA({ data: { profile: row }, error: null });
    await a;
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  it("does not write A's profile into B's store when the session changed mid-fetch", async () => {
    // The exact sequence: A's fetch hangs, A signs out, B signs in, and A's
    // answer finally lands. It must reach nothing.
    let release!: (v: unknown) => void;
    mockMaybeSingle.mockReturnValueOnce(new Promise((r) => (release = r)));
    const pending = syncHealthProfileFromServer('user-a');

    const untouched = useHealthProfileStore.getState().profile;
    signedInAs('user-b'); // A signed out, B signed in
    release({ data: { profile: row, current_step: 2 }, error: null });

    await expect(pending).resolves.toEqual({ status: 'ok', userId: 'user-a', profile: row });
    expect(useHealthProfileStore.getState().profile).toBe(untouched);
    expect(healthProfileOwnerId()).toBeNull();
  });

  it('a late reply to a timed-out fetch writes nothing once the session moved on', async () => {
    // withTimeout abandons the request rather than aborting it, so the reply
    // still arrives. Its lateness is not what makes it safe — this check is.
    let release!: (v: unknown) => void;
    mockMaybeSingle.mockReturnValueOnce(new Promise((r) => (release = r)));
    const pending = syncHealthProfileFromServer('user-a');
    const untouched = useHealthProfileStore.getState().profile;

    signedInAs(null); // signed out while the request was abandoned
    release({ data: { profile: row }, error: null });
    await pending;

    expect(useHealthProfileStore.getState().profile).toBe(untouched);
  });

  it('records the account a row was read for, so the debounced upsert can name it', async () => {
    await syncHealthProfileFromServer('user-a');
    expect(healthProfileOwnerId()).toBe('user-a');
    useHealthProfileStore.getState().resetProfile();
    expect(healthProfileOwnerId()).toBeNull();
  });

  it('a caller that names no account gets nothing applied when the session is unreadable', async () => {
    mockGetSession.mockRejectedValue(new Error('storage gone'));
    const untouched = useHealthProfileStore.getState().profile;
    await syncHealthProfileFromServer(null);
    expect(useHealthProfileStore.getState().profile).toBe(untouched);
  });

  it('asks again once the previous request has finished', async () => {
    await syncHealthProfileFromServer();
    await syncHealthProfileFromServer();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  it('abandoning the shared request makes the next caller start a new one', async () => {
    let release!: (v: unknown) => void;
    mockMaybeSingle.mockReturnValueOnce(new Promise((r) => (release = r)));
    const first = syncHealthProfileFromServer('user-a');
    abandonInflightServerProfile(); // sign-out / device wipe
    const second = syncHealthProfileFromServer('user-a');
    release({ data: { profile: row }, error: null });
    await Promise.all([first, second]);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });
});
