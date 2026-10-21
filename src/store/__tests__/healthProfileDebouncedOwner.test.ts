/**
 * The debounced profile upsert must name the account the profile belongs to.
 *
 * It fires 800ms after the change that scheduled it and is fire-and-forget, so
 * by the time it runs the session can be somebody else's — and the upsert
 * always writes for the LIVE session. Without the owner travelling with the
 * payload, syncHealthProfile has nothing to compare and files user A's
 * medical history under user B's user_id.
 *
 * jest.mock calls below are hoisted above these imports by babel-jest.
 */
import {
  useHealthProfileStore,
  abandonInflightServerProfile,
  syncHealthProfileFromServer,
} from '../useHealthProfileStore';

const mockSyncHealthProfile = jest.fn().mockResolvedValue(true);

jest.mock('../../services/syncService', () => ({
  syncHealthProfile: (...a: unknown[]) => mockSyncHealthProfile(...a),
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

/** A whole profile row, as the server stores it — "server wins" replaces it all. */
let serverRow: unknown;

const client = {
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { profile: serverRow, current_step: 1 }, error: null }),
        }),
      }),
    }),
  },
};

beforeEach(() => {
  jest.useRealTimers();
  useHealthProfileStore.getState().resetProfile();
  abandonInflightServerProfile();
  serverRow = { ...useHealthProfileStore.getState().profile, bodyMetrics: { weightLbs: 180 } };
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the debounced health-profile upsert', () => {
  it('names the account the fetched profile was read for', async () => {
    await syncHealthProfileFromServer('user-a', async () => client);
    jest.useFakeTimers();

    useHealthProfileStore.getState().setBodyMetrics({ weightLbs: 181 });
    jest.advanceTimersByTime(800);

    expect(mockSyncHealthProfile).toHaveBeenCalledTimes(1);
    expect(mockSyncHealthProfile.mock.calls[0][1]).toEqual({ userId: 'user-a' });
  });

  it('names nobody for a profile that was only ever typed on this device', () => {
    jest.useFakeTimers();
    useHealthProfileStore.getState().setBodyMetrics({ weightLbs: 150 });
    jest.advanceTimersByTime(800);

    expect(mockSyncHealthProfile).toHaveBeenCalledTimes(1);
    expect(mockSyncHealthProfile.mock.calls[0][1]).toEqual({ userId: null });
  });

  it('keeps naming the owner the change was made under, not the one in the store later', async () => {
    await syncHealthProfileFromServer('user-a', async () => client);
    jest.useFakeTimers();

    useHealthProfileStore.getState().setBodyMetrics({ weightLbs: 182 });
    // The wipe that a sign-out performs lands inside the debounce window.
    useHealthProfileStore.getState().resetProfile();
    jest.advanceTimersByTime(800);

    expect(mockSyncHealthProfile).toHaveBeenCalledTimes(1);
    expect(mockSyncHealthProfile.mock.calls[0][1]).toEqual({ userId: 'user-a' });
  });
});
