/**
 * The restore's order of operations, and what it does to the route guard.
 *
 * The decision is tested in onboardingRestore.test.ts. This file tests what
 * the decision alone cannot: a fetch that hangs, a session that vanishes while
 * the fetch is out, callers arriving together, and that whatever the restore
 * does, the app never lands in `isComplete: true, isAuthenticated: false` —
 * the state behind both 2.1(a) rejections (src/lib/routeGuard.ts).
 */
import { createOnboardingRestorer, type OnboardingRestoreDeps } from '../onboardingRestoreRunner';
import { decideRoute } from '../routeGuard';
import type { ServerProfileFetch } from '../onboardingRestore';
import type { OnboardingProfile } from '../../types';

const USER = 'user-a';

const emptyProfile: OnboardingProfile = {
  gender: null,
  ageRange: null,
  ethnicity: null,
  maritalStatus: null,
  referralSource: null,
  healthGoals: [],
  interestCategories: [],
  acceptedSafety: false,
  dataShareConsent: false,
};

const completeServerProfile = {
  bodyMetrics: { weightLbs: 180, heightInches: 70 },
  onboarding: {
    version: 1,
    gender: 'Male',
    ageRange: '30-44',
    healthGoals: ['muscle_gain'],
    completedAt: '2026-08-01T09:00:00.000Z',
  },
};

/** A small model of the three stores the restore touches. */
function world(opts: {
  fetch: () => Promise<ServerProfileFetch>;
  userId?: string | null;
  isComplete?: boolean;
  profile?: OnboardingProfile;
  timeoutMs?: number;
}) {
  const state = {
    userId: opts.userId === undefined ? USER : opts.userId,
    isComplete: opts.isComplete ?? false,
    profile: opts.profile ?? emptyProfile,
    statuses: [] as string[],
    resume: null as null | { userId: string; step: number },
    writes: 0,
    fetches: 0,
  };
  const deps: OnboardingRestoreDeps = {
    getCurrentUserId: () => state.userId,
    waitForLocalStores: async () => {},
    fetchServerProfile: () => {
      state.fetches++;
      return opts.fetch();
    },
    getLocal: () => ({ isComplete: state.isComplete, profile: state.profile }),
    getLocalBody: () => ({ weightLbs: 180, heightInches: 70 }),
    applyOnboardingPatch: (patch) => {
      state.profile = { ...state.profile, ...patch.profile };
      state.isComplete = state.isComplete || patch.isComplete;
    },
    setResumeStep: (r) => {
      state.resume = r;
    },
    setRestoreStatus: (userId, status, meta) => {
      // The whole record, including what 'settled' does NOT say on its own:
      // whether this user's server copy was actually read.
      state.statuses.push(
        `${userId}:${status}` + (status === 'settled' ? `:${meta?.serverKnown === true}` : ''),
      );
    },
    writeSnapshot: async () => {
      state.writes++;
      return true;
    },
    now: () => '2026-09-15T12:00:00.000Z',
    timeoutMs: opts.timeoutMs ?? 1_000,
  };
  return { state, restore: createOnboardingRestorer(deps) };
}

const okFetch = (profile: unknown, userId = USER) => async (): Promise<ServerProfileFetch> => ({
  status: 'ok',
  userId,
  profile,
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createOnboardingRestorer', () => {
  it('restores a completed onboarding for a returning user', async () => {
    const { state, restore } = world({ fetch: okFetch(completeServerProfile) });
    await expect(restore()).resolves.toBe('complete');
    expect(state.isComplete).toBe(true);
    expect(state.profile.gender).toBe('Male');
    expect(state.statuses).toEqual([`${USER}:pending`, `${USER}:settled:true`]);
  });

  it('does nothing at all without a session', async () => {
    const { state, restore } = world({ fetch: okFetch(completeServerProfile), userId: null });
    await expect(restore()).resolves.toBe('signed-out');
    expect(state.fetches).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.statuses).toEqual([]);
  });

  it('a fetch that times out grants nothing and still settles', async () => {
    jest.useFakeTimers();
    const { state, restore } = world({ fetch: () => new Promise(() => {}), timeoutMs: 6_000 });
    const pending = restore();
    await jest.advanceTimersByTimeAsync(6_001);
    await expect(pending).resolves.toBe('fetch-failed');
    expect(state.isComplete).toBe(false);
    expect(state.resume).toBeNull();
    // settled, but the server copy is NOT known — a timeout is not an answer.
    expect(state.statuses).toEqual([`${USER}:pending`, `${USER}:settled:false`]);
  });

  it('a fetch that rejects grants nothing and still settles', async () => {
    const { state, restore } = world({ fetch: () => Promise.reject(new Error('offline')) });
    await expect(restore()).resolves.toBe('fetch-failed');
    expect(state.isComplete).toBe(false);
    expect(state.statuses.at(-1)).toBe(`${USER}:settled:false`);
  });

  it('a sign-out while the fetch is out grants nothing', async () => {
    let finish!: (f: ServerProfileFetch) => void;
    const { state, restore } = world({ fetch: () => new Promise((r) => (finish = r)) });
    const pending = restore();
    await Promise.resolve();
    state.userId = null; // signed out mid-fetch
    finish({ status: 'ok', userId: USER, profile: completeServerProfile });
    await expect(pending).resolves.toBe('signed-out');
    expect(state.isComplete).toBe(false);
  });

  it('a different account signing in while the fetch is out gets nothing from it', async () => {
    let finish!: (f: ServerProfileFetch) => void;
    const { state, restore } = world({ fetch: () => new Promise((r) => (finish = r)) });
    const pending = restore();
    await Promise.resolve();
    state.userId = 'user-b';
    finish({ status: 'ok', userId: USER, profile: completeServerProfile });
    await expect(pending).resolves.toBe('signed-out');
    expect(state.isComplete).toBe(false);
    expect(state.resume).toBeNull();
  });

  it('callers arriving together share one run', async () => {
    const { state, restore } = world({ fetch: okFetch(completeServerProfile) });
    const [a, b, c] = await Promise.all([restore(), restore(), restore()]);
    expect([a, b, c]).toEqual(['complete', 'complete', 'complete']);
    expect(state.fetches).toBe(1);
  });

  it('runs again after settling (the next sign-in must not reuse a stale answer)', async () => {
    const { state, restore } = world({ fetch: okFetch(null) });
    await restore();
    await restore();
    expect(state.fetches).toBe(2);
  });

  it('hands a partial profile to the screen as a resume step', async () => {
    const { state, restore } = world({
      fetch: okFetch({ ...completeServerProfile, onboarding: { ...completeServerProfile.onboarding, completedAt: null } }),
    });
    await expect(restore()).resolves.toBe('resume');
    expect(state.resume).toEqual({ userId: USER, step: 3 });
    expect(state.isComplete).toBe(false);
  });

  it('records a completed device\'s answers when the server lacks them', async () => {
    const { state, restore } = world({
      fetch: okFetch({ bodyMetrics: {} }),
      isComplete: true,
      profile: { ...emptyProfile, gender: 'Female', ageRange: '18-29', healthGoals: ['sleep'] },
    });
    await expect(restore()).resolves.toBe('already-complete');
    expect(state.writes).toBe(1);
  });

  it("an answer for another account does not count as knowing this user's copy", async () => {
    // The fetch came back fine — for somebody else. Nothing about THIS user's
    // server record was learned, so the mirror must stay shut.
    const { state, restore } = world({ fetch: okFetch(completeServerProfile, 'user-b') });
    await restore();
    expect(state.statuses.at(-1)).toBe(`${USER}:settled:false`);
  });

  it('settles even when applying the plan throws', async () => {
    const statuses: string[] = [];
    const throwing = createOnboardingRestorer({
      getCurrentUserId: () => USER,
      waitForLocalStores: async () => {},
      fetchServerProfile: okFetch(completeServerProfile),
      getLocal: () => {
        throw new Error('store gone');
      },
      getLocalBody: () => ({}),
      applyOnboardingPatch: () => {},
      setResumeStep: () => {},
      setRestoreStatus: (u, s, meta) => {
        statuses.push(`${u}:${s}` + (s === 'settled' ? `:${meta?.serverKnown === true}` : ''));
      },
      writeSnapshot: async () => true,
      now: () => '',
    });
    await expect(throwing()).resolves.toBe('fetch-failed');
    expect(statuses).toEqual([`${USER}:pending`, `${USER}:settled:false`]);
  });
});

describe('route guard integration: the restore never splits the two flags', () => {
  const fetches: (() => Promise<ServerProfileFetch>)[] = [
    okFetch(completeServerProfile),
    okFetch(completeServerProfile, 'user-b'),
    okFetch(null),
    okFetch({ bodyMetrics: { weightLbs: 180, heightInches: 70 } }),
    async () => ({ status: 'signed-out' }),
    async () => ({ status: 'error' }),
    () => Promise.reject(new Error('offline')),
  ];

  it('never produces isComplete: true with isAuthenticated: false', async () => {
    let restoredCompletions = 0;
    for (const fetch of fetches)
      for (const signedInAtEnd of [true, false])
        for (const startComplete of [true, false]) {
          let finish!: () => void;
          const gate = new Promise<void>((r) => (finish = r));
          const { state, restore } = world({
            isComplete: startComplete,
            fetch: async () => {
              await gate;
              return fetch();
            },
          });
          const pending = restore();
          if (!signedInAtEnd) state.userId = null;
          finish();
          await pending;

          const isAuthenticated = state.userId !== null;
          // The restore may only ever RAISE completion, and only while signed in.
          if (state.isComplete && !startComplete) {
            restoredCompletions++;
            expect(isAuthenticated).toBe(true);
          }
          if (!startComplete && !isAuthenticated) expect(state.isComplete).toBe(false);
          if (startComplete) expect(state.isComplete).toBe(true);

          // And the guard, fed the result from every route, never loops.
          for (const inOnboarding of [true, false])
            for (const inAuth of [true, false]) {
              if (inOnboarding && inAuth) continue;
              const s = { isComplete: state.isComplete, authHydrated: true, isAuthenticated, inOnboarding, inAuth };
              const target = decideRoute(s);
              if (!target) continue;
              expect(
                decideRoute({ ...s, inOnboarding: target === '/onboarding', inAuth: target === '/auth' }),
              ).toBeNull();
            }
        }
    // Positive control: the sweep must include real restores, or it proves nothing.
    expect(restoredCompletions).toBe(1);
  });

  it('a restored returning user is let straight in; an unrestored one goes to onboarding', async () => {
    const restored = world({ fetch: okFetch(completeServerProfile) });
    await restored.restore();
    expect(
      decideRoute({ isComplete: restored.state.isComplete, authHydrated: true, isAuthenticated: true, inOnboarding: false, inAuth: false }),
    ).toBeNull();

    const failed = world({ fetch: async () => ({ status: 'error' }) });
    await failed.restore();
    expect(
      decideRoute({ isComplete: failed.state.isComplete, authHydrated: true, isAuthenticated: true, inOnboarding: false, inAuth: false }),
    ).toBe('/onboarding');
  });
});
