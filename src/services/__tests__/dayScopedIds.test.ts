/**
 * check_ins / cycle_day_logs ids must not be date-only.
 *
 * `checkin-<date>` is the primary key across ALL users, so only the first user
 * to check in on a given day could sync; everyone else's upsert hit another
 * user's row and was refused by RLS. Production 2026-11-05: 16 check-ins in
 * total, one per calendar day, from 281 accounts.
 */
import { adoptLegacyDayIds, adoptLegacyIds, isLegacyDayId, newDayScopedId } from '../syncService';

const mockState = {
  userId: 'user-b' as string | null,
  ownedIds: [] as string[],
  error: null as unknown,
};

jest.mock('../supabase', () => {
  const chain = (ids: string[]) => ({
    data: mockState.error ? null : ids.filter((id) => mockState.ownedIds.includes(id)).map((id) => ({ id })),
    error: mockState.error,
  });
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: mockState.userId ? { user: { id: mockState.userId } } : null } }) },
      from: () => ({
        select: () => ({
          eq: () => ({ in: async (_c: string, ids: string[]) => chain(ids) }),
        }),
      }),
    },
  };
});

beforeEach(() => {
  mockState.userId = 'user-b';
  mockState.ownedIds = [];
  mockState.error = null;
});

describe('day-scoped ids', () => {
  it('new ids are unique per call and never date-only', () => {
    const a = newDayScopedId('checkin', '2026-11-03');
    const b = newDayScopedId('checkin', '2026-11-03');
    expect(a).not.toBe(b);
    expect(a.startsWith('checkin-2026-11-03-')).toBe(true);
    expect(isLegacyDayId('checkin', a)).toBe(false);
    expect(isLegacyDayId('checkin', 'checkin-2026-11-03')).toBe(true);
    expect(isLegacyDayId('cyclelog', 'cyclelog-2026-08-12')).toBe(true);
  });

  it('re-keys and pushes legacy entries the server never accepted for this user', async () => {
    const push = jest.fn().mockResolvedValue(true);
    const entries = [
      { id: 'checkin-2026-11-03', date: '2026-11-03' }, // refused: user A owns it
      { id: 'checkin-2026-11-04-abc12345', date: '2026-11-04' }, // already new-style
    ];
    const out = await adoptLegacyDayIds('check_ins', 'checkin', entries, push);
    expect(out[0].id).not.toBe('checkin-2026-11-03');
    expect(out[0].id.startsWith('checkin-2026-11-03-')).toBe(true);
    expect(out[1]).toBe(entries[1]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].id).toBe(out[0].id);
  });

  it('leaves a legacy id alone when it is this user\'s own server row (no duplicate day)', async () => {
    mockState.ownedIds = ['checkin-2026-11-03'];
    const push = jest.fn();
    const entries = [{ id: 'checkin-2026-11-03', date: '2026-11-03' }];
    expect(await adoptLegacyDayIds('check_ins', 'checkin', entries, push)).toBe(entries);
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing without a session or when the server errors', async () => {
    const push = jest.fn();
    const entries = [{ id: 'checkin-2026-11-03', date: '2026-11-03' }];
    mockState.userId = null;
    expect(await adoptLegacyDayIds('check_ins', 'checkin', entries, push)).toBe(entries);
    mockState.userId = 'user-b';
    mockState.error = { message: 'boom' };
    expect(await adoptLegacyDayIds('check_ins', 'checkin', entries, push)).toBe(entries);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('connected_integrations legacy ids (int-<source>)', () => {
  it('re-keys an unowned int-apple_health row and leaves an owned one', async () => {
    const isLegacy = (id: string) => /^int-[a-z_]+$/.test(id);
    const push = jest.fn().mockResolvedValue(true);
    mockState.ownedIds = ['int-health_connect'];
    const out = await adoptLegacyIds(
      'connected_integrations' as never,
      [
        { id: 'int-apple_health', source: 'apple_health' },
        { id: 'int-health_connect', source: 'health_connect' },
      ],
      isLegacy,
      (e) => `int-${e.source}-x1`,
      push,
    );
    expect(out.map((e) => e.id)).toEqual(['int-apple_health-x1', 'int-health_connect']);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
