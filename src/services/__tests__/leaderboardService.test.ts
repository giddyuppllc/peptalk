/**
 * leaderboardService — the opt-in read and write. This suite did not exist.
 *
 * The write is the dangerous half. PostgREST answers a plain `.update().eq()`
 * with 204 and `error: null` whether or not any row matched the filter, so a
 * filter that matched nothing — an RLS policy hiding the row, a profiles row
 * that was never created — reported success. "Leave the leaderboard" told the
 * user they were off it while they stayed publicly ranked, and the switch then
 * rendered the state the server had refused. Only reading the stored value
 * back distinguishes the two.
 */
const mockGetUser = jest.fn();
const mockMaybeSingleSelect = jest.fn();
const mockUpdateSelect = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingleSelect(...a) }) }),
      update: (...a: unknown[]) => {
        mockUpdate(...a);
        return {
          eq: () => ({
            select: (...s: unknown[]) => ({ maybeSingle: () => mockUpdateSelect(...s) }),
          }),
        };
      },
    }),
  },
}));

jest.mock('../telemetry', () => ({ captureException: jest.fn() }));

import {
  fetchCurrentAccountEmail,
  fetchLeaderboardOptIn,
  normalizeAccountEmail,
  saveLeaderboardOptIn,
} from '../leaderboardService';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a', email: 'A@Example.com ' } } });
  mockUpdateSelect.mockResolvedValue({ data: { leaderboard_opt_in: true }, error: null });
  mockMaybeSingleSelect.mockResolvedValue({ data: { leaderboard_opt_in: true }, error: null });
});

describe('saveLeaderboardOptIn', () => {
  it('reads the stored value back and reports what the server actually holds', async () => {
    await expect(saveLeaderboardOptIn(true)).resolves.toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ leaderboard_opt_in: true });
  });

  it('an UPDATE that matched NO row is a failure, not a success', async () => {
    // The whole bug: 204 + error null, and "Leave" reports done while the user
    // is still on the board.
    mockUpdateSelect.mockResolvedValue({ data: null, error: null });
    await expect(saveLeaderboardOptIn(false)).resolves.toBe(false);
  });

  it('a row that came back holding the OTHER value is a failure', async () => {
    mockUpdateSelect.mockResolvedValue({ data: { leaderboard_opt_in: true }, error: null });
    await expect(saveLeaderboardOptIn(false)).resolves.toBe(false);
  });

  it('confirms a real opt-out', async () => {
    mockUpdateSelect.mockResolvedValue({ data: { leaderboard_opt_in: false }, error: null });
    await expect(saveLeaderboardOptIn(false)).resolves.toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ leaderboard_opt_in: false });
  });

  it('writes nothing without a session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(saveLeaderboardOptIn(true)).resolves.toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('an error is a failure, not a shrug', async () => {
    mockUpdateSelect.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(saveLeaderboardOptIn(true)).resolves.toBe(false);
  });

  it('a throw is a failure', async () => {
    mockGetUser.mockRejectedValue(new Error('offline'));
    await expect(saveLeaderboardOptIn(true)).resolves.toBe(false);
  });

  it('only a literal true opts in', async () => {
    mockUpdateSelect.mockResolvedValue({ data: { leaderboard_opt_in: false }, error: null });
    await expect(saveLeaderboardOptIn('yes' as unknown as boolean)).resolves.toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ leaderboard_opt_in: false });
  });
});

describe('fetchLeaderboardOptIn', () => {
  it('returns the stored choice', async () => {
    await expect(fetchLeaderboardOptIn()).resolves.toBe(true);
  });

  it('only a literal true reads as opted in', async () => {
    mockMaybeSingleSelect.mockResolvedValue({ data: { leaderboard_opt_in: 'true' }, error: null });
    await expect(fetchLeaderboardOptIn()).resolves.toBe(false);
  });

  it('no row is a definite false; an error is an unknown null', async () => {
    mockMaybeSingleSelect.mockResolvedValue({ data: null, error: null });
    await expect(fetchLeaderboardOptIn()).resolves.toBe(false);
    mockMaybeSingleSelect.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await expect(fetchLeaderboardOptIn()).resolves.toBeNull();
  });

  it('signed out is unknown, not false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(fetchLeaderboardOptIn()).resolves.toBeNull();
  });
});

describe('account identity', () => {
  it('normalises an address so two spellings of one account match', () => {
    expect(normalizeAccountEmail('  A@Example.COM ')).toBe('a@example.com');
    expect(normalizeAccountEmail('   ')).toBeNull();
    expect(normalizeAccountEmail(undefined)).toBeNull();
    expect(normalizeAccountEmail(42)).toBeNull();
  });

  it('reports the signed-in address, normalised', async () => {
    await expect(fetchCurrentAccountEmail()).resolves.toBe('a@example.com');
  });

  it('reports null with no session, so a held choice keeps waiting', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(fetchCurrentAccountEmail()).resolves.toBeNull();
  });

  it('reports null when it cannot ask', async () => {
    mockGetUser.mockRejectedValue(new Error('offline'));
    await expect(fetchCurrentAccountEmail()).resolves.toBeNull();
  });
});
