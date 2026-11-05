/** saveCheckIn never mints a date-only id, and re-keys a legacy one. */
import { useCheckinStore } from '../useCheckinStore';

const mockSync = jest.fn().mockResolvedValue(true);
const mockDelete = jest.fn().mockResolvedValue(true);
jest.mock('../../services/syncService', () => {
  const actual = jest.requireActual('../../services/syncService');
  return {
    ...actual,
    syncRecord: (...a: unknown[]) => mockSync(...a),
    deleteRecord: (...a: unknown[]) => mockDelete(...a),
    hydrateFromServer: jest.fn(async (_t: string, local: unknown[]) => local),
    adoptLegacyDayIds: jest.fn(async (_t: string, _p: string, e: unknown[]) => e),
  };
});
jest.mock('../../services/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const base = { mood: 3, energy: 3, stress: 3, sleepQuality: 3, recovery: 3, appetite: 3 } as const;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useCheckinStore.setState({ entries: [] });
  mockSync.mockClear();
  mockDelete.mockClear();
});

it('a new check-in gets a unique, non-legacy id', () => {
  const e = useCheckinStore.getState().saveCheckIn({ ...base, date: '2026-11-03' } as never);
  expect(e.id).toMatch(/^checkin-2026-11-03-[a-z0-9]+$/);
});

it('saving the same day again keeps the same (new-style) id', () => {
  const a = useCheckinStore.getState().saveCheckIn({ ...base, date: '2026-11-03' } as never);
  const b = useCheckinStore.getState().saveCheckIn({ ...base, mood: 5, date: '2026-11-03' } as never);
  expect(b.id).toBe(a.id);
  expect(useCheckinStore.getState().entries).toHaveLength(1);
});

it('a legacy date-only id is replaced on save: old row deleted, new row synced', async () => {
  useCheckinStore.setState({
    entries: [{ id: 'checkin-2026-11-03', date: '2026-11-03', createdAt: '2026-11-03T10:00:00Z', ...base } as never],
  });
  const e = useCheckinStore.getState().saveCheckIn({ ...base, mood: 4, date: '2026-11-03' } as never);
  expect(e.id).not.toBe('checkin-2026-11-03');
  await flush();
  expect(mockDelete).toHaveBeenCalledWith('check_ins', 'checkin-2026-11-03');
  expect(mockSync).toHaveBeenCalledWith('check_ins', expect.objectContaining({ id: e.id, mood: 4 }));
});
