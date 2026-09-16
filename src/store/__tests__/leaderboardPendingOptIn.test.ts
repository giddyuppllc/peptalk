/**
 * The held onboarding opt-in, and the opt-in read that raced the user.
 *
 * PRIVACY: `pendingOptIn` was a bare boolean with no account attached, applied
 * to whoever was signed in when the flush ran. A signs up on the
 * email-confirmation path and never confirms; B signs in on the same install;
 * B is put on the public leaderboard having never been asked. Being listed is
 * visible to strangers, so "whose choice was this" has to be answerable.
 *
 * RACE: loadOptIn ran on mount and set whatever came back. A toggle made while
 * that read was out was overwritten by it — the switch showed OFF while the
 * user was still publicly ranked.
 */
const mockSave = jest.fn();
const mockFetchOptIn = jest.fn();
const mockFetchEmail = jest.fn();

jest.mock('../../services/leaderboardService', () => ({
  fetchCurrentAccountEmail: (...a: unknown[]) => mockFetchEmail(...a),
  fetchLeaderboardOptIn: (...a: unknown[]) => mockFetchOptIn(...a),
  saveLeaderboardOptIn: (...a: unknown[]) => mockSave(...a),
  // Pure, and the real one is covered in leaderboardService.test.ts.
  normalizeAccountEmail: (e: unknown) =>
    typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null,
  fetchLeaderboard: jest.fn().mockResolvedValue({ ok: false }),
  fetchShoutouts: jest.fn().mockResolvedValue({ ok: false }),
  fetchMyMetrics: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import { useLeaderboardStore } from '../useLeaderboardStore';

const store = () => useLeaderboardStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  store().clearAll();
  mockSave.mockResolvedValue(true);
  mockFetchOptIn.mockResolvedValue(false);
  mockFetchEmail.mockResolvedValue(null);
});

describe('an opt-in that could not be written is bound to the account that made it', () => {
  it('holds the signup address when there is no session to write with', async () => {
    mockSave.mockResolvedValue(false); // no session
    await store().recordOnboardingChoice(true, '  Ann@Example.COM ');
    expect(store().pendingOptIn).toBe(true);
    expect(store().pendingOptInEmail).toBe('ann@example.com');
  });

  it('flushes for the account it was made for', async () => {
    mockSave.mockResolvedValue(false);
    await store().recordOnboardingChoice(true, 'ann@example.com');
    mockSave.mockResolvedValue(true);
    mockFetchEmail.mockResolvedValue('ann@example.com');

    await store().flushPendingOptIn();
    expect(mockSave).toHaveBeenLastCalledWith(true);
    expect(store().optIn).toBe(true);
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });

  it('NEVER flushes for a different account — the reported leak', async () => {
    mockSave.mockResolvedValue(false);
    await store().recordOnboardingChoice(true, 'ann@example.com'); // A, never confirms
    mockSave.mockClear();
    mockSave.mockResolvedValue(true);
    mockFetchEmail.mockResolvedValue('bob@example.com'); // B signs in on this install

    await store().flushPendingOptIn();

    expect(mockSave).not.toHaveBeenCalled();
    expect(store().optIn).toBeNull();
    // And it is dropped, so it cannot surface for a third person later.
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });

  it('keeps waiting while nobody is signed in', async () => {
    mockSave.mockResolvedValue(false);
    await store().recordOnboardingChoice(true, 'ann@example.com');
    mockSave.mockClear();
    mockFetchEmail.mockResolvedValue(null);

    await store().flushPendingOptIn();
    expect(mockSave).not.toHaveBeenCalled();
    expect(store().pendingOptIn).toBe(true);
    expect(store().pendingOptInEmail).toBe('ann@example.com');
  });

  it('drops an unattributable choice rather than applying it to whoever is here', async () => {
    // What an older build persisted: a bare boolean with no address.
    useLeaderboardStore.setState({ pendingOptIn: true, pendingOptInEmail: null });
    mockFetchEmail.mockResolvedValue('bob@example.com');

    await store().flushPendingOptIn();
    expect(mockSave).not.toHaveBeenCalled();
    expect(store().pendingOptIn).toBeNull();
  });

  it('holds nothing when the account cannot be named', async () => {
    mockSave.mockResolvedValue(false);
    await store().recordOnboardingChoice(true, '');
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });

  it('writes straight through when there IS a session, holding nothing', async () => {
    mockSave.mockResolvedValue(true);
    await store().recordOnboardingChoice(true, 'ann@example.com');
    expect(mockSave).toHaveBeenCalledWith(true);
    expect(store().optIn).toBe(true);
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });

  it('choosing off holds nothing and writes nothing', async () => {
    await store().recordOnboardingChoice(false, 'ann@example.com');
    expect(mockSave).not.toHaveBeenCalled();
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });

  it('an explicit switch in Profile supersedes a held choice, address and all', async () => {
    useLeaderboardStore.setState({ pendingOptIn: true, pendingOptInEmail: 'ann@example.com' });
    await expect(store().setOptIn(false)).resolves.toBe(true);
    expect(store().pendingOptIn).toBeNull();
    expect(store().pendingOptInEmail).toBeNull();
  });
});

describe('the opt-in read must not clobber a fresher choice', () => {
  it('a read that lands after the user toggled is ignored', async () => {
    let answerTheRead!: (v: boolean) => void;
    mockFetchOptIn.mockReturnValue(new Promise((r) => (answerTheRead = r)));
    const reading = store().loadOptIn();

    // The user turns it ON while the mount read is still out.
    await expect(store().setOptIn(true)).resolves.toBe(true);
    expect(store().optIn).toBe(true);

    answerTheRead(false); // the stale server value finally arrives
    await reading;

    expect(store().optIn).toBe(true);
  });

  it('a read still in flight while a save is running is ignored', async () => {
    let finishSave!: (v: boolean) => void;
    mockSave.mockReturnValue(new Promise((r) => (finishSave = r)));
    const saving = store().setOptIn(true);

    mockFetchOptIn.mockResolvedValue(false);
    await store().loadOptIn();
    expect(store().optIn).toBeNull();

    finishSave(true);
    await saving;
    expect(store().optIn).toBe(true);
  });

  it('an ordinary read still updates the switch (positive control)', async () => {
    mockFetchOptIn.mockResolvedValue(true);
    await store().loadOptIn();
    expect(store().optIn).toBe(true);
  });

  it('a read in flight does not repopulate a cleared store', async () => {
    let answerTheRead!: (v: boolean) => void;
    mockFetchOptIn.mockReturnValue(new Promise((r) => (answerTheRead = r)));
    const reading = store().loadOptIn();
    store().clearAll();
    answerTheRead(true);
    await reading;
    expect(store().optIn).toBeNull();
  });
});
