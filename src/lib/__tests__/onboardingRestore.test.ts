/**
 * Restoring onboarding from the server: complete only on the server's record,
 * never for having a session. See src/lib/onboardingRestore.ts.
 */
import {
  aboutYouAnswered,
  basicsAnswered,
  isOnboardingHeightValid,
  isOnboardingWeightValid,
  isStoredHeightValid,
  parseOnboardingSnapshot,
  planOnboardingRestore,
  readBodyAnswers,
  snapshotToWrite,
  type RestorePlanInput,
  type ServerProfileFetch,
} from '../onboardingRestore';
import type { OnboardingProfile, OnboardingSnapshot } from '../../types';

const USER = 'user-a';
const NOW = '2026-09-15T12:00:00.000Z';
const DONE_AT = '2026-08-01T09:00:00.000Z';

const emptyLocal: OnboardingProfile = {
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

const fullSnapshot: OnboardingSnapshot = {
  version: 1,
  gender: 'Female',
  ageRange: '30-44',
  healthGoals: ['weight_loss', 'sleep'],
  completedAt: DONE_AT,
};

const body = { weightLbs: 150, heightInches: 65 };

const serverProfile = (over: Record<string, unknown> = {}) => ({
  bodyMetrics: body,
  onboarding: fullSnapshot,
  ...over,
});

const ok = (profile: unknown, userId = USER): ServerProfileFetch => ({ status: 'ok', userId, profile });

const input = (over: Partial<RestorePlanInput> = {}): RestorePlanInput => ({
  currentUserId: USER,
  fetch: ok(serverProfile()),
  local: { isComplete: false, profile: emptyLocal },
  localBody: body,
  nowIso: NOW,
  ...over,
});

describe('what onboarding requires', () => {
  it('weight: 50-1000 lb, as the Basics step', () => {
    expect(isOnboardingWeightValid(50)).toBe(true);
    expect(isOnboardingWeightValid(1000)).toBe(true);
    expect(isOnboardingWeightValid(49.9)).toBe(false);
    expect(isOnboardingWeightValid(1000.1)).toBe(false);
    expect(isOnboardingWeightValid(NaN)).toBe(false);
  });

  it('height: 3-8 ft, inches optional and under 12', () => {
    expect(isOnboardingHeightValid(3, NaN)).toBe(true);
    expect(isOnboardingHeightValid(8, 11)).toBe(true);
    expect(isOnboardingHeightValid(2, 11)).toBe(false);
    expect(isOnboardingHeightValid(9, 0)).toBe(false);
    expect(isOnboardingHeightValid(5, 12)).toBe(false);
    expect(isOnboardingHeightValid(5, -1)).toBe(false);
    expect(isOnboardingHeightValid(NaN, 5)).toBe(false);
  });

  it('applies the same height rule to a stored total', () => {
    expect(isStoredHeightValid(36)).toBe(true);
    expect(isStoredHeightValid(35)).toBe(false);
    expect(isStoredHeightValid(107)).toBe(true);
    expect(isStoredHeightValid(108)).toBe(false);
    expect(isStoredHeightValid(NaN)).toBe(false);
  });

  it('step 1 needs sex, age AND a goal', () => {
    const a = { gender: 'Male' as const, ageRange: '18-29' as const, healthGoals: ['energy' as const] };
    expect(aboutYouAnswered(a)).toBe(true);
    expect(aboutYouAnswered({ ...a, gender: null })).toBe(false);
    expect(aboutYouAnswered({ ...a, ageRange: null })).toBe(false);
    expect(aboutYouAnswered({ ...a, healthGoals: [] })).toBe(false);
  });

  it('step 2 needs weight AND height', () => {
    expect(basicsAnswered(body)).toBe(true);
    expect(basicsAnswered({ weightLbs: 150 })).toBe(false);
    expect(basicsAnswered({ heightInches: 65 })).toBe(false);
    expect(basicsAnswered({ weightLbs: 20, heightInches: 65 })).toBe(false);
    expect(basicsAnswered(null)).toBe(false);
  });
});

describe('parseOnboardingSnapshot', () => {
  it('reads a well-formed snapshot', () => {
    expect(parseOnboardingSnapshot(serverProfile())).toEqual({ status: 'ok', snapshot: fullSnapshot });
  });

  it('is absent when there is no row, no key or junk', () => {
    for (const p of [null, undefined, 'x', [], {}, { onboarding: null }, { onboarding: 'x' }]) {
      expect(parseOnboardingSnapshot(p).status).toBe('absent');
    }
  });

  it('refuses a snapshot from a newer build rather than guessing at it', () => {
    expect(parseOnboardingSnapshot({ onboarding: { ...fullSnapshot, version: 2 } }).status).toBe('unsupported');
  });

  it('drops values onboarding cannot produce', () => {
    const parsed = parseOnboardingSnapshot({
      onboarding: {
        version: 1,
        gender: 'male',
        ageRange: '12-17',
        healthGoals: ['sleep', 'fly', 7, 'sleep'],
        completedAt: 'not a date',
      },
    });
    expect(parsed).toEqual({
      status: 'ok',
      snapshot: { version: 1, gender: null, ageRange: null, healthGoals: ['sleep'], completedAt: null },
    });
  });

  it('readBodyAnswers ignores non-numbers', () => {
    expect(readBodyAnswers({ bodyMetrics: { weightLbs: '150', heightInches: 65 } })).toEqual({ heightInches: 65 });
    expect(readBodyAnswers(null)).toEqual({});
  });
});

describe('planOnboardingRestore', () => {
  it('full server profile → complete, with the server answers', () => {
    const plan = planOnboardingRestore(input());
    expect(plan.decision).toBe('complete');
    expect(plan.onboardingPatch).toEqual({
      profile: { gender: 'Female', ageRange: '30-44', healthGoals: ['weight_loss', 'sleep'] },
      isComplete: true,
    });
    expect(plan.resumeStep).toBeNull();
  });

  it('every answer but no completion record → resume at step 3, not complete', () => {
    // The disclaimer on step 3 is stored nowhere else. Answers alone are not
    // proof it was accepted.
    const plan = planOnboardingRestore(
      input({ fetch: ok(serverProfile({ onboarding: { ...fullSnapshot, completedAt: null } })) }),
    );
    expect(plan.decision).toBe('resume');
    expect(plan.resumeStep).toBe(3);
    expect(plan.onboardingPatch?.isComplete).toBe(false);
  });

  it('step 1 answered, no height → resume at step 2', () => {
    const plan = planOnboardingRestore(
      input({
        fetch: ok(serverProfile({ bodyMetrics: { weightLbs: 150 } })),
        localBody: { weightLbs: 150 },
      }),
    );
    expect(plan.decision).toBe('resume');
    expect(plan.resumeStep).toBe(2);
    expect(plan.onboardingPatch).toEqual({
      profile: { gender: 'Female', ageRange: '30-44', healthGoals: ['weight_loss', 'sleep'] },
      isComplete: false,
    });
  });

  it('completion needs the body metrics on the SERVER row, not only on this device', () => {
    const plan = planOnboardingRestore(
      input({ fetch: ok(serverProfile({ bodyMetrics: {} })), localBody: body }),
    );
    expect(plan.decision).toBe('resume');
    expect(plan.onboardingPatch?.isComplete).toBe(false);
  });

  it('partial step 1 → resume at step 1 with what exists', () => {
    const plan = planOnboardingRestore(
      input({ fetch: ok(serverProfile({ onboarding: { ...fullSnapshot, healthGoals: [], completedAt: null } })) }),
    );
    expect(plan.decision).toBe('resume');
    expect(plan.resumeStep).toBe(1);
    expect(plan.onboardingPatch).toEqual({ profile: { gender: 'Female', ageRange: '30-44' }, isComplete: false });
  });

  it('empty profile → normal onboarding (a fresh sign-up)', () => {
    for (const profile of [null, {}, { bodyMetrics: {} }]) {
      const plan = planOnboardingRestore(input({ fetch: ok(profile), localBody: {} }));
      expect(plan).toEqual({ decision: 'fresh', onboardingPatch: null, resumeStep: null, snapshotWrite: null });
    }
  });

  it('a legacy profile with body metrics but no answers is still normal onboarding', () => {
    const plan = planOnboardingRestore(input({ fetch: ok({ bodyMetrics: body }) }));
    expect(plan.decision).toBe('fresh');
    expect(plan.onboardingPatch).toBeNull();
  });

  it('fetch error → no grant, no change', () => {
    expect(planOnboardingRestore(input({ fetch: { status: 'error' } }))).toEqual({
      decision: 'fetch-failed',
      onboardingPatch: null,
      resumeStep: null,
      snapshotWrite: null,
    });
  });

  it('signed out → no change, whatever the server returned', () => {
    expect(planOnboardingRestore(input({ currentUserId: null })).decision).toBe('signed-out');
    expect(planOnboardingRestore(input({ currentUserId: null })).onboardingPatch).toBeNull();
    expect(planOnboardingRestore(input({ fetch: { status: 'signed-out' } })).onboardingPatch).toBeNull();
  });

  it('a fetch that answered for a different account changes nothing', () => {
    const plan = planOnboardingRestore(input({ fetch: ok(serverProfile(), 'user-b') }));
    expect(plan.decision).toBe('signed-out');
    expect(plan.onboardingPatch).toBeNull();
  });

  it('a snapshot from a newer build is neither restored nor overwritten', () => {
    const plan = planOnboardingRestore(
      input({
        fetch: ok(serverProfile({ onboarding: { ...fullSnapshot, version: 9 } })),
        local: { isComplete: true, profile: { ...emptyLocal, gender: 'Male', ageRange: '18-29', healthGoals: ['energy'] } },
      }),
    );
    expect(plan).toEqual({ decision: 'unsupported-snapshot', onboardingPatch: null, resumeStep: null, snapshotWrite: null });
  });

  it('never overwrites answers typed on this device during a resume', () => {
    const local = { ...emptyLocal, gender: 'Male' as const };
    const plan = planOnboardingRestore(
      input({
        local: { isComplete: false, profile: local },
        fetch: ok(serverProfile({ onboarding: { ...fullSnapshot, completedAt: null } })),
      }),
    );
    expect(plan.onboardingPatch?.profile.gender).toBeUndefined();
    expect(plan.onboardingPatch?.profile.ageRange).toBe('30-44');
  });

  it('resumes from local answers alone when the server has no row yet', () => {
    // Email-confirmation signup: answered on this device, then the link.
    const local = { ...emptyLocal, gender: 'Male' as const, ageRange: '18-29' as const, healthGoals: ['energy' as const] };
    const plan = planOnboardingRestore(input({ fetch: ok(null), local: { isComplete: false, profile: local } }));
    expect(plan.decision).toBe('resume');
    expect(plan.resumeStep).toBe(3);
    expect(plan.onboardingPatch).toBeNull();
  });

  describe('already complete on this device', () => {
    const localDone = {
      isComplete: true,
      profile: { ...emptyLocal, gender: 'Male' as const, ageRange: '45-60' as const, healthGoals: ['longevity' as const] },
    };

    it('is left alone', () => {
      const plan = planOnboardingRestore(input({ local: localDone }));
      expect(plan.decision).toBe('already-complete');
      expect(plan.onboardingPatch).toBeNull();
      expect(plan.resumeStep).toBeNull();
    });

    it('records its answers when the server has none, so the next device can restore', () => {
      const plan = planOnboardingRestore(input({ local: localDone, fetch: ok({ bodyMetrics: body }) }));
      expect(plan.snapshotWrite).toEqual({
        version: 1,
        gender: 'Male',
        ageRange: '45-60',
        healthGoals: ['longevity'],
        completedAt: NOW,
      });
    });
  });
});

describe('snapshotToWrite', () => {
  const done = { isComplete: true, profile: { ...emptyLocal, gender: 'Female' as const, ageRange: '30-44' as const, healthGoals: ['weight_loss' as const, 'sleep' as const] } };

  it('writes nothing for an incomplete onboarding', () => {
    expect(snapshotToWrite({ ...done, isComplete: false }, null, NOW)).toBeNull();
  });

  it('never records completion for a flag with no answers behind it', () => {
    // The old Sign Up tab and login path set isComplete while asking nothing.
    expect(snapshotToWrite({ isComplete: true, profile: emptyLocal }, null, NOW)).toBeNull();
    expect(snapshotToWrite({ isComplete: true, profile: { ...done.profile, healthGoals: [] } }, null, NOW)).toBeNull();
  });

  it('writes nothing when the server already matches, goal order aside', () => {
    expect(snapshotToWrite(done, { ...fullSnapshot, healthGoals: ['sleep', 'weight_loss'] }, NOW)).toBeNull();
  });

  it('updates changed answers and keeps the original completion time', () => {
    const next = snapshotToWrite({ ...done, profile: { ...done.profile, ageRange: '45-60' } }, fullSnapshot, NOW);
    expect(next).toEqual({ ...fullSnapshot, ageRange: '45-60', completedAt: DONE_AT });
  });

  it('repairs a server copy with no completion time', () => {
    expect(snapshotToWrite(done, { ...fullSnapshot, completedAt: null }, NOW)?.completedAt).toBe(NOW);
  });
});

describe('the invariant, swept', () => {
  // Across every fetch outcome, session and local state: completion is only
  // ever granted with a live session, for the account the fetch answered for,
  // on a server record carrying completedAt.
  const fetches: ServerProfileFetch[] = [
    { status: 'error' },
    { status: 'signed-out' },
    ok(null),
    ok({}),
    ok(serverProfile()),
    ok(serverProfile({ onboarding: { ...fullSnapshot, completedAt: null } })),
    ok(serverProfile({ bodyMetrics: {} })),
    ok(serverProfile(), 'user-b'),
  ];
  const users = [USER, null];
  const locals = [
    { isComplete: false, profile: emptyLocal },
    { isComplete: true, profile: emptyLocal },
    { isComplete: false, profile: { ...emptyLocal, gender: 'Male' as const } },
  ];

  it('grants completion only on real server evidence', () => {
    let grants = 0;
    for (const fetch of fetches)
      for (const currentUserId of users)
        for (const local of locals)
          for (const localBody of [body, {}]) {
            const plan = planOnboardingRestore({ currentUserId, fetch, local, localBody, nowIso: NOW });
            if (!plan.onboardingPatch?.isComplete) continue;
            grants++;
            expect(currentUserId).toBe(USER);
            expect(fetch.status).toBe('ok');
            if (fetch.status !== 'ok') continue;
            expect(fetch.userId).toBe(currentUserId);
            const parsed = parseOnboardingSnapshot(fetch.profile);
            expect(parsed.status === 'ok' && parsed.snapshot.completedAt).toBeTruthy();
            expect(local.isComplete).toBe(false);
          }
    // Positive control: a sweep that never reaches a grant proves nothing.
    // Exactly one fetch (full profile, right user) times two incomplete locals
    // times two local bodies.
    expect(grants).toBe(4);
  });

  it('never lowers a completion that already exists', () => {
    for (const fetch of fetches) {
      const plan = planOnboardingRestore(input({ fetch, local: locals[1] }));
      expect(plan.onboardingPatch).toBeNull();
    }
  });
});
