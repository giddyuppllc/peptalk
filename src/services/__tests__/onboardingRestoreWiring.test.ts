/**
 * The restore wired to the real stores: the write path that lets the NEXT
 * device restore, and what a restored completion does to the stores.
 *
 * The decision and the sequencing are tested purely in src/lib/__tests__. This
 * file exercises the zustand stores themselves, because the failure modes here
 * are behavioural — a snapshot that never reaches the upsert, a mirror that
 * writes while signed out, macro targets that stay at the defaults.
 *
 * jest.mock calls below are hoisted above these imports by babel-jest.
 */
import { restoreOnboardingFromServer, clearOnboardingRestore } from '../onboardingRestore';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useHealthProfileStore, withoutProfileSync } from '../../store/useHealthProfileStore';
import { useMealStore, DEFAULT_TARGETS } from '../../store/useMealStore';
import type { OnboardingProfile } from '../../types';

const mockSyncHealthProfile = jest.fn().mockResolvedValue(true);
const mockServerFetch = jest.fn();
const mockAuth = { isAuthenticated: true, user: { id: 'user-a' } as { id: string } | null };

jest.mock('../syncService', () => ({
  syncHealthProfile: (...a: unknown[]) => mockSyncHealthProfile(...a),
  syncRecord: jest.fn().mockResolvedValue(true),
  getCurrentUserId: jest.fn().mockResolvedValue('user-a'),
  deleteRecord: jest.fn().mockResolvedValue(undefined),
  deleteRecordsBy: jest.fn().mockResolvedValue(true),
  fetchUserRecords: jest.fn().mockResolvedValue([]),
  hydrateFromServer: jest.fn().mockResolvedValue([]),
}));

jest.mock('../secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../telemetry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('../../store/useAuthStore', () => ({
  useAuthStore: { getState: () => mockAuth },
}));

jest.mock('../../store/useHealthProfileStore', () => {
  const actual = jest.requireActual('../../store/useHealthProfileStore');
  return { ...actual, syncHealthProfileFromServer: () => mockServerFetch() };
});

const empty: OnboardingProfile = {
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

const answered: OnboardingProfile = {
  ...empty,
  gender: 'Female',
  ageRange: '30-44',
  healthGoals: ['weight_loss'],
};

const serverRow = {
  bodyMetrics: { weightLbs: 160, heightInches: 66 },
  lifestyle: { activityLevel: 'moderate', exerciseTypes: [], stressSources: [], smokingStatus: 'never', alcoholFrequency: 'rarely' },
  onboarding: { version: 1, ...answered, completedAt: '2026-08-01T09:00:00.000Z' },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncHealthProfile.mockResolvedValue(true);
  mockAuth.isAuthenticated = true;
  mockAuth.user = { id: 'user-a' };
  useOnboardingStore.setState({
    profile: empty,
    isComplete: false,
    hasHydrated: true,
    restore: { userId: null, status: 'idle' },
    resumeStep: null,
  });
  useHealthProfileStore.getState().resetProfile();
  useMealStore.setState({ targets: DEFAULT_TARGETS });
});

describe('write path — the answers reach the server when onboarding completes', () => {
  const settle = () => useOnboardingStore.getState().setRestoreStatus('user-a', 'settled');

  it('mirrors the answers with a completion time and upserts them', async () => {
    settle();
    useOnboardingStore.setState({ profile: answered });
    useOnboardingStore.getState().completeOnboarding();
    await flush();

    const snap = useHealthProfileStore.getState().profile.onboarding;
    expect(snap).toMatchObject({ version: 1, gender: 'Female', ageRange: '30-44', healthGoals: ['weight_loss'] });
    expect(typeof snap?.completedAt).toBe('string');
    expect(mockSyncHealthProfile).toHaveBeenCalledTimes(1);
    expect((mockSyncHealthProfile.mock.calls[0][0] as { onboarding: unknown }).onboarding).toEqual(snap);
  });

  it('updates the server copy when a completed user edits their answers', async () => {
    settle();
    useOnboardingStore.setState({ profile: answered, isComplete: true });
    await flush();
    const first = useHealthProfileStore.getState().profile.onboarding;
    useOnboardingStore.getState().setGender('Male');
    await flush();
    const second = useHealthProfileStore.getState().profile.onboarding;
    expect(second?.gender).toBe('Male');
    expect(second?.completedAt).toBe(first?.completedAt);
  });

  it('writes nothing while the restore for this user is still out', async () => {
    useOnboardingStore.getState().setRestoreStatus('user-a', 'pending');
    useOnboardingStore.setState({ profile: answered, isComplete: true });
    await flush();
    expect(useHealthProfileStore.getState().profile.onboarding).toBeUndefined();
    expect(mockSyncHealthProfile).not.toHaveBeenCalled();
  });

  it('writes nothing when signed out', async () => {
    settle();
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    useOnboardingStore.setState({ profile: answered, isComplete: true });
    await flush();
    expect(mockSyncHealthProfile).not.toHaveBeenCalled();
  });

  it('writes nothing for a device-local change (withoutProfileSync), and resumes after it', async () => {
    settle();
    // A change that WOULD mirror (complete + every answer), made local-only.
    withoutProfileSync(() => useOnboardingStore.setState({ profile: answered, isComplete: true }));
    await flush();
    expect(useHealthProfileStore.getState().profile.onboarding).toBeUndefined();
    expect(mockSyncHealthProfile).not.toHaveBeenCalled();

    // Positive control: the next ordinary edit mirrors, so the silence above
    // was the suppression and not a harness that cannot see a write.
    useOnboardingStore.getState().setGender('Male');
    await flush();
    expect(useHealthProfileStore.getState().profile.onboarding?.gender).toBe('Male');
    expect(mockSyncHealthProfile).toHaveBeenCalledTimes(1);
  });

  it('never records a completion flag that has no answers behind it', async () => {
    settle();
    useOnboardingStore.getState().completeOnboarding();
    await flush();
    expect(useHealthProfileStore.getState().profile.onboarding).toBeUndefined();
    expect(mockSyncHealthProfile).not.toHaveBeenCalled();
  });
});

describe('restoreOnboardingFromServer against the real stores', () => {
  // As the real fetch does: "server wins" lands the row in the health store.
  const serverWins = () =>
    mockServerFetch.mockImplementation(async () => {
      useHealthProfileStore.setState({ profile: { ...useHealthProfileStore.getState().profile, ...serverRow } as never });
      return { status: 'ok', userId: 'user-a', profile: serverRow };
    });

  it('a returning user is restored complete, with macro targets computed', async () => {
    serverWins();
    await expect(restoreOnboardingFromServer()).resolves.toBe('complete');
    const ob = useOnboardingStore.getState();
    expect(ob.isComplete).toBe(true);
    expect(ob.profile.gender).toBe('Female');
    expect(ob.restore).toEqual({ userId: 'user-a', status: 'settled' });
    expect(useMealStore.getState().targets).not.toEqual(DEFAULT_TARGETS);
  });

  it('leaves targets the user already set on this device alone', async () => {
    const custom = { ...DEFAULT_TARGETS, calories: 1750 };
    useMealStore.setState({ targets: custom });
    serverWins();
    await expect(restoreOnboardingFromServer()).resolves.toBe('complete');
    expect(useMealStore.getState().targets).toEqual(custom);
  });

  it('a failed fetch grants nothing', async () => {
    mockServerFetch.mockResolvedValue({ status: 'error' });
    await expect(restoreOnboardingFromServer()).resolves.toBe('fetch-failed');
    expect(useOnboardingStore.getState().isComplete).toBe(false);
    expect(useOnboardingStore.getState().restore.status).toBe('settled');
  });

  it('signed out: no fetch, no change', async () => {
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    await expect(restoreOnboardingFromServer()).resolves.toBe('signed-out');
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().isComplete).toBe(false);
  });

  it('clearOnboardingRestore forgets a settled run and its resume point', () => {
    useOnboardingStore.setState({
      restore: { userId: 'user-a', status: 'settled' },
      resumeStep: { userId: 'user-a', step: 2 },
    });
    clearOnboardingRestore();
    expect(useOnboardingStore.getState().restore).toEqual({ userId: null, status: 'idle' });
    expect(useOnboardingStore.getState().resumeStep).toBeNull();
  });
});
