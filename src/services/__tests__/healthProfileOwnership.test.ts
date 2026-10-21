/**
 * syncHealthProfile must refuse to file one account's profile under another's.
 *
 * The upsert always targets the LIVE session — it reads the user id itself and
 * ignores whatever is in the payload. That is correct for an ordinary edit and
 * catastrophic for a deferred one: the health store's cloud sync fires 800ms
 * after the change that scheduled it, and a sign-out plus a sign-in fit inside
 * that window comfortably. The profile that reaches the upsert is then user
 * A's, and the user_id it is written under is user B's — replacing B's whole
 * `profile` JSON with A's medical history, medications and allergies.
 *
 * The caller names the owner; a session that has moved on makes this refuse.
 *
 * jest.mock calls below are hoisted above this import by babel-jest.
 */
import { syncHealthProfile } from '../syncService';

const mockGetSession = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a) }),
  },
}));

const profile = { medical: { medications: ['semaglutide'], allergies: ['penicillin'] } };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-b' } } } });
  mockUpsert.mockResolvedValue({ error: null });
});

describe('syncHealthProfile ownership assertion', () => {
  it("refuses when the named owner is not who is signed in now", async () => {
    await expect(syncHealthProfile(profile, { userId: 'user-a' })).resolves.toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('writes when the named owner is the signed-in account', async () => {
    await expect(syncHealthProfile(profile, { userId: 'user-b' })).resolves.toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ user_id: 'user-b', profile });
  });

  it('an unnamed owner still writes — a device-only profile asserts nothing', async () => {
    await expect(syncHealthProfile(profile)).resolves.toBe(true);
    await expect(syncHealthProfile(profile, { userId: null })).resolves.toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it('no session writes nothing, named or not', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(syncHealthProfile(profile, { userId: 'user-b' })).resolves.toBe(false);
    await expect(syncHealthProfile(profile)).resolves.toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('the other extras still reach the row', async () => {
    await syncHealthProfile(profile, { userId: 'user-b', setup_complete: true, current_step: 3 });
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ setup_complete: true, current_step: 3 });
    // The assertion is not a column.
    expect(mockUpsert.mock.calls[0][0]).not.toHaveProperty('userId');
  });
});
