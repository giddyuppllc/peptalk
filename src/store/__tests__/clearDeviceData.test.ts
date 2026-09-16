/**
 * Profile → "Delete My Data" is device-only, and must stay that way.
 *
 * The dialog (and app/privacy.tsx) describe it as clearing data on this
 * device. While signed in it ALSO wiped the server: useHealthProfileStore syncs
 * through a subscription that fires on every profile change, so resetProfile()
 * looked like an edit and, 800ms later, upserted an EMPTY profile over the
 * user's health_profiles row — the copy onboarding restore and other devices
 * read back. Nothing surfaced it; the upsert succeeded.
 *
 * These tests run the real stores and the real syncService against a fake
 * Supabase client that records every write, so a write through ANY path —
 * syncRecord, syncHealthProfile, a direct .from().upsert — is caught, not just
 * the one we know about. The "a later edit DOES sync" case is the positive
 * control: it proves the harness sees a write when one happens, so the "no
 * write" assertions cannot pass vacuously.
 */

// jest.mock calls below are hoisted above these imports by babel-jest.
import * as syncService from '../../services/syncService';
import { clearDeviceData } from '../clearDeviceData';
import {
  useHealthProfileStore,
  withoutProfileSync,
  isProfileSyncSuppressed,
} from '../useHealthProfileStore';
// Registers the onboarding restore's write-path subscription (the mirror), as
// app/_layout.tsx does, so its uploads are inside what these tests watch.
import '../../services/onboardingRestore';
import { useOnboardingStore } from '../useOnboardingStore';
import { useDoseLogStore } from '../useDoseLogStore';
import { useCheckinStore } from '../useCheckinStore';
import { useJournalStore } from '../useJournalStore';
import { useMealStore } from '../useMealStore';
import { useCycleStore } from '../useCycleStore';
import { useAllergyStore } from '../useAllergyStore';
import { useLabResultsStore } from '../useLabResultsStore';
import { usePantryStore } from '../usePantryStore';
import { useBodyMapStore } from '../useBodyMapStore';
import { useWorkoutStore } from '../useWorkoutStore';
import { useAuthStore } from '../useAuthStore';
import { useLeaderboardStore } from '../useLeaderboardStore';
import { secureStorage } from '../../services/secureStorage';

type Write = { table: string; op: string; payload: unknown };

const mockWrites: Write[] = [];
const mockInvokes: { name: string; opts: unknown }[] = [];
const mockAuth = {
  session: { user: { id: 'user-a', email: 'a@example.com' }, access_token: 'tok-a' } as unknown,
  signOutError: null as null | { message: string },
  invokeError: null as null | { message: string },
};

jest.mock('../../services/supabase', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    // PostgREST hands back the affected row when .select() follows a write,
    // and nothing at all when it does not — which is the distinction
    // saveLeaderboardOptIn depends on to know the UPDATE matched a row.
    let written: unknown = null;
    const record = (op: string) => (payload?: unknown) => {
      mockWrites.push({ table, op, payload });
      written = payload ?? null;
      return chain;
    };
    Object.assign(chain, {
      upsert: record('upsert'),
      insert: record('insert'),
      update: record('update'),
      delete: record('delete'),
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: written, error: null }),
      single: () => Promise.resolve({ data: written, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    });
    return chain;
  };
  const client = {
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockAuth.session } }),
      getUser: () =>
        Promise.resolve({ data: { user: (mockAuth.session as { user?: unknown } | null)?.user ?? null } }),
      signOut: () => {
        // Mirrors auth-js: a non-401/403/404 failure returns the error and
        // leaves the stored session in place.
        if (!mockAuth.signOutError) mockAuth.session = null;
        return Promise.resolve({ error: mockAuth.signOutError });
      },
    },
    functions: {
      invoke: (name: string, opts: unknown) => {
        mockInvokes.push({ name, opts });
        return Promise.resolve({ data: null, error: mockAuth.invokeError });
      },
    },
  };
  return {
    supabase: client,
    default: client,
    sessionPersistenceHealthy: () => true,
    FUNCTION_TIMEOUT_MS: 60_000,
  };
});

// Real syncService, every export wrapped so calls can be asserted on.
jest.mock('../../services/syncService', () => {
  const actual = jest.requireActual('../../services/syncService');
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    wrapped[key] =
      typeof value === 'function'
        ? jest.fn((...args: unknown[]) => (value as (...a: unknown[]) => unknown)(...args))
        : value;
  }
  return wrapped;
});

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../services/notificationService', () => ({
  cancelAllReminders: jest.fn().mockResolvedValue(undefined),
  cancelDoseRemindersFor: jest.fn().mockResolvedValue(undefined),
  fireCycleCompleteNudge: jest.fn().mockResolvedValue(undefined),
  scheduleDoseReminder: jest.fn().mockResolvedValue(undefined),
  isAvailable: () => false,
}));
jest.mock('../../services/pushTokenSync', () => ({
  clearPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/telemetry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));
jest.mock('../../lib/alert', () => ({ Alert: { alert: jest.fn() } }));

/** The store's own empty profile, captured before anything touches it. */
const EMPTY_PROFILE = useHealthProfileStore.getState().profile;

const SYNC_WRITERS = [
  'syncRecord',
  'syncHealthProfile',
  'insertRecord',
  'deleteRecord',
  'deleteRecordsBy',
  'batchSync',
] as const;

const realSetImmediate: (cb: () => void) => void = jest.requireActual('timers').setImmediate;

/** Let the debounce elapse and every awaited promise behind it settle. */
async function settle() {
  jest.advanceTimersByTime(5_000);
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => realSetImmediate(r));
}

function syncCalls() {
  return SYNC_WRITERS.flatMap((name) =>
    ((syncService as unknown as Record<string, jest.Mock>)[name].mock.calls).map((args) => ({ name, args })),
  );
}

function profileUpserts() {
  return mockWrites.filter((w) => w.table === 'health_profiles' && w.op === 'upsert');
}

/** A signed-in user with data on the device AND a synced server copy. */
async function seedSignedInUser() {
  mockAuth.session = { user: { id: 'user-a', email: 'a@example.com' }, access_token: 'tok-a' };
  useHealthProfileStore.getState().setBasicInfo('female', '1990-04-02');
  useHealthProfileStore.getState().addCondition('hypothyroidism');
  useOnboardingStore.setState({ isComplete: true } as never);
  useDoseLogStore.setState({ doses: [{ id: 'dose-1' }], protocols: [{ id: 'p-1' }] } as never);
  useCheckinStore.setState({ entries: [{ id: 'ci-1' }] } as never);
  useJournalStore.setState({ entries: [{ id: 'j-1' }] } as never);
  useMealStore.setState({ meals: [{ id: 'm-1' }] } as never);
  useCycleStore.setState({ periods: [{ id: 'per-1' }] } as never);
  useAllergyStore.setState({ allergens: [{ id: 'al-1' }] } as never);
  useLabResultsStore.setState({ results: [{ id: 'lab-1' }] } as never);
  usePantryStore.setState({ items: [{ id: 'pan-1' }] } as never);
  useBodyMapStore.setState({ injections: [{ id: 'inj-1' }] } as never);
  useWorkoutStore.setState({ logs: [{ id: 'w-1' }] } as never);
  // The edits above legitimately sync. Let that land, then start clean.
  await settle();
  expect(profileUpserts()).toHaveLength(1);
  mockWrites.length = 0;
  mockInvokes.length = 0;
  jest.clearAllMocks();
}

function expectDeviceEmpty() {
  expect(useHealthProfileStore.getState().profile).toBe(EMPTY_PROFILE);
  expect(useHealthProfileStore.getState().currentStep).toBe(0);
  expect(useOnboardingStore.getState().isComplete).toBe(false);
  expect(useDoseLogStore.getState().doses).toEqual([]);
  expect(useDoseLogStore.getState().protocols).toEqual([]);
  expect(useCheckinStore.getState().entries).toEqual([]);
  expect(useJournalStore.getState().entries).toEqual([]);
  expect(useMealStore.getState().meals).toEqual([]);
  expect(useCycleStore.getState().periods).toEqual([]);
  expect(useAllergyStore.getState().allergens).toEqual([]);
  expect(useLabResultsStore.getState().results).toEqual([]);
  expect(usePantryStore.getState().items).toEqual([]);
  expect(useBodyMapStore.getState().injections).toEqual([]);
  expect(useWorkoutStore.getState().logs).toEqual([]);
}

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  mockWrites.length = 0;
  mockInvokes.length = 0;
  mockAuth.signOutError = null;
  mockAuth.invokeError = null;
  jest.clearAllMocks();
  await seedSignedInUser();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Delete My Data (clearDeviceData) is device-only', () => {
  it('clears every local store', async () => {
    clearDeviceData();
    await settle();
    expectDeviceEmpty();
  });

  it('makes no server write while signed in', async () => {
    clearDeviceData();
    await settle();
    expect(mockWrites).toEqual([]);
    expect(mockInvokes).toEqual([]);
    expect(syncCalls()).toEqual([]);
  });

  it('a real profile edit afterwards DOES sync (positive control)', async () => {
    clearDeviceData();
    await settle();
    expect(profileUpserts()).toHaveLength(0);

    useHealthProfileStore.getState().setBasicInfo('male', '1985-01-15');
    await settle();

    expect(syncService.syncHealthProfile).toHaveBeenCalledTimes(1);
    const upserts = profileUpserts();
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toMatchObject({
      user_id: 'user-a',
      profile: { biologicalSex: 'male', dateOfBirth: '1985-01-15' },
    });
  });

  it('does not drop an edit made just before the wipe', async () => {
    useHealthProfileStore.getState().addMedication('levothyroxine');
    clearDeviceData(); // inside the 800ms debounce
    await settle();

    const upserts = profileUpserts();
    expect(upserts).toHaveLength(1);
    const sent = (upserts[0].payload as { profile: { medical: { medications: string[] } } }).profile;
    expect(sent.medical.medications).toContain('levothyroxine');
    expectDeviceEmpty();
  });

  it('suppression is scoped: nested calls unwind and sync resumes', async () => {
    withoutProfileSync(() =>
      withoutProfileSync(() => useHealthProfileStore.getState().setBasicInfo('male', '1970-01-01')),
    );
    await settle();
    expect(profileUpserts()).toHaveLength(0);

    useHealthProfileStore.getState().setBasicInfo('female', '1971-02-02');
    await settle();
    expect(profileUpserts()).toHaveLength(1);
  });
});

describe('sign-out wipe', () => {
  it('does not upsert an empty profile when the server revoke fails and the session survives', async () => {
    useAuthStore.setState({ user: { id: 'user-a' } as never, isAuthenticated: true });
    mockAuth.signOutError = { message: 'upstream 503' };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await useAuthStore.getState().logout();
    await settle();
    warn.mockRestore();

    expect(useHealthProfileStore.getState().profile).toBe(EMPTY_PROFILE);
    expect(profileUpserts()).toEqual([]);
  });
});

describe('Delete Account (unchanged)', () => {
  it('calls delete-user with the session token, then signs out and wipes the device', async () => {
    useAuthStore.setState({ user: { id: 'user-a' } as never, isAuthenticated: true });

    await useAuthStore.getState().deleteAccount();
    await settle();

    expect(mockInvokes).toHaveLength(1);
    expect(mockInvokes[0]).toEqual({
      name: 'delete-user',
      opts: { headers: { Authorization: 'Bearer tok-a' } },
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expectDeviceEmpty();
  });

  it('keeps local data when delete-user fails, so the user can retry', async () => {
    useAuthStore.setState({ user: { id: 'user-a' } as never, isAuthenticated: true });
    mockAuth.invokeError = { message: 'function unreachable' };

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('function unreachable');
    await settle();

    expect(mockInvokes.map((i) => i.name)).toEqual(['delete-user']);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useHealthProfileStore.getState().profile.biologicalSex).toBe('female');
    expect(useDoseLogStore.getState().doses).toHaveLength(1);
  });
});

describe('the onboarding restore mirror (merged with feat/onboarding-server-restore)', () => {
  // The mirror is a second upload path: a useOnboardingStore subscription that
  // upserts health_profiles directly, outside the health store's debounced
  // sync. withoutProfileSync must cover it too.
  const answered = {
    gender: 'Female',
    ageRange: '30-44',
    healthGoals: ['weight_loss'],
  } as const;

  function signedInWithSettledRestore() {
    useAuthStore.setState({ user: { id: 'user-a' } as never, isAuthenticated: true });
    useOnboardingStore.setState((s) => ({
      profile: { ...s.profile, ...answered, healthGoals: [...answered.healthGoals] },
      isComplete: true,
      // serverKnown: the restore actually read this user's server copy. The
      // mirror requires it — 'settled' alone is also what a timeout looks like.
      restore: { userId: 'user-a', status: 'settled', serverKnown: true },
    }) as never);
  }

  it('the mirror is live in this harness (positive control): a completed edit upserts', async () => {
    signedInWithSettledRestore();
    await settle();
    expect(profileUpserts().length).toBeGreaterThan(0);
    const last = profileUpserts().at(-1)!.payload as { profile: { onboarding?: { gender?: string } } };
    expect(last.profile.onboarding?.gender).toBe('Female');
  });

  it('Delete My Data with the restore settled writes nothing, through any path', async () => {
    signedInWithSettledRestore();
    await settle();
    mockWrites.length = 0;
    jest.clearAllMocks();

    clearDeviceData();
    await settle();

    expect(mockWrites).toEqual([]);
    expect(syncCalls()).toEqual([]);
    expectDeviceEmpty();
  });

  it('every onboarding and health-profile change in Delete My Data is made local-only', () => {
    const seen: boolean[] = [];
    const unsubOnboarding = useOnboardingStore.subscribe(() => seen.push(isProfileSyncSuppressed()));
    const unsubHealth = useHealthProfileStore.subscribe(() => seen.push(isProfileSyncSuppressed()));
    try {
      clearDeviceData();
    } finally {
      unsubOnboarding();
      unsubHealth();
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every(Boolean)).toBe(true);
    expect(isProfileSyncSuppressed()).toBe(false);
  });

  it('leaves the restore idle, so re-answering onboarding cannot overwrite the server', async () => {
    // The wipe is device-only, and the user is routed back through onboarding
    // on the same live session. If the restore stayed 'settled' the mirror
    // treated those re-typed answers as an ordinary edit and uploaded them
    // over the server record the wipe was never supposed to touch.
    signedInWithSettledRestore();
    await settle();

    clearDeviceData();
    await settle();
    expect(useOnboardingStore.getState().restore).toEqual({
      userId: null,
      status: 'idle',
      serverKnown: false,
    });

    mockWrites.length = 0;
    jest.clearAllMocks();

    // The user answers onboarding again on the wiped device.
    useOnboardingStore.setState((s) => ({
      profile: { ...s.profile, ...answered, healthGoals: [...answered.healthGoals] },
      isComplete: true,
    }) as never);
    await settle();

    expect(profileUpserts()).toHaveLength(0);
    expect(syncCalls()).toEqual([]);
  });

  it('the sign-out wipe resets onboarding local-only while the session is still live', async () => {
    signedInWithSettledRestore();
    await settle();
    const seen: boolean[] = [];
    const unsub = useOnboardingStore.subscribe((s, p) => {
      if (s.isComplete !== p.isComplete) seen.push(isProfileSyncSuppressed());
    });
    mockAuth.signOutError = { message: 'upstream 503' };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await useAuthStore.getState().logout();
      await settle();
    } finally {
      warn.mockRestore();
      unsub();
    }
    expect(seen).toEqual([true]);
    expect(useOnboardingStore.getState().isComplete).toBe(false);
  });
});

describe('the leaderboard opt-in held on the device (merged with feat/leaderboard)', () => {
  // useLeaderboardStore persists exactly one thing: an onboarding opt-in that
  // could not be written yet. flushPendingOptIn writes it on the next
  // authenticated boot. A wipe of the device must take it too.
  const LEADERBOARD_KEY = 'peptalk-leaderboard-v1';

  function optInUpdates() {
    return mockWrites.filter(
      (w) => w.table === 'profiles' && w.op === 'update' && 'leaderboard_opt_in' in (w.payload as object),
    );
  }

  /** The last value the persist middleware wrote for the leaderboard store. */
  function persistedLeaderboard(): { pendingOptIn?: unknown; pendingOptInEmail?: unknown } | null {
    const calls = (secureStorage.setItem as jest.Mock).mock.calls.filter(([key]) => key === LEADERBOARD_KEY);
    if (calls.length === 0) return null;
    return JSON.parse(calls[calls.length - 1][1] as string).state;
  }

  function holdPendingOptIn() {
    // Bound to the account that made it — a bare boolean is no longer flushed
    // to anyone, because it could not be attributed to an account.
    useLeaderboardStore.setState({
      pendingOptIn: true,
      pendingOptInEmail: 'a@example.com',
      optIn: null,
    });
    (secureStorage.setItem as jest.Mock).mockClear();
    mockWrites.length = 0;
  }

  it('a held opt-in IS flushed to profiles on an authenticated boot (positive control)', async () => {
    holdPendingOptIn();
    await useLeaderboardStore.getState().flushPendingOptIn();
    expect(optInUpdates()).toHaveLength(1);
    expect(optInUpdates()[0].payload).toEqual({ leaderboard_opt_in: true });
    expect(useLeaderboardStore.getState().pendingOptIn).toBeNull();
  });

  it('a choice held for one account is never written for another', async () => {
    // A signs up on the email-confirmation path and never confirms. B signs in
    // on the same install. B was silently put on the public leaderboard.
    useLeaderboardStore.setState({
      pendingOptIn: true,
      pendingOptInEmail: 'ann@example.com',
      optIn: null,
    });
    mockAuth.session = { user: { id: 'user-b', email: 'b@example.com' }, access_token: 'tok-b' };
    mockWrites.length = 0;

    await useLeaderboardStore.getState().flushPendingOptIn();

    expect(optInUpdates()).toEqual([]);
    expect(useLeaderboardStore.getState().optIn).toBeNull();
    expect(useLeaderboardStore.getState().pendingOptIn).toBeNull();
  });

  it('Delete My Data clears it, in memory and in storage, and nothing is flushed after', async () => {
    holdPendingOptIn();
    clearDeviceData();
    await settle();

    expect(useLeaderboardStore.getState().pendingOptIn).toBeNull();
    expect(persistedLeaderboard()).toEqual({ pendingOptIn: null, pendingOptInEmail: null });

    await useLeaderboardStore.getState().flushPendingOptIn();
    expect(optInUpdates()).toEqual([]);
    expect(mockWrites).toEqual([]);
  });

  it('sign-out clears it, in memory and in storage, and nothing is flushed after', async () => {
    useAuthStore.setState({ user: { id: 'user-a' } as never, isAuthenticated: true });
    holdPendingOptIn();

    await useAuthStore.getState().logout();
    await settle();

    expect(useLeaderboardStore.getState().pendingOptIn).toBeNull();
    expect(persistedLeaderboard()).toEqual({ pendingOptIn: null, pendingOptInEmail: null });

    // A session for someone else on this device must not receive the choice.
    mockAuth.session = { user: { id: 'user-b', email: 'b@example.com' }, access_token: 'tok-b' };
    mockWrites.length = 0;
    await useLeaderboardStore.getState().flushPendingOptIn();
    expect(optInUpdates()).toEqual([]);
  });
});
