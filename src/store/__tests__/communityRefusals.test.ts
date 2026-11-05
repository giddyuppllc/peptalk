import { useCommunityStore } from '../useCommunityStore';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }));
jest.mock('../../services/secureStorage', () => ({ secureStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
}));

/** What supabase-js returns for a 4xx: an error whose context is the Response. */
const refused = (body: object) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { text: async () => JSON.stringify(body) } },
});

beforeEach(() => {
  mockInvoke.mockReset();
  useCommunityStore.setState({ reactionsByTarget: {}, followedUserIds: [] } as never);
});

test('a refused reaction is reported, and the cache is not changed', async () => {
  mockInvoke.mockResolvedValue(refused({ error: 'Set a community handle first', needsUsername: true }));
  const res = await useCommunityStore.getState().toggleReaction({ postId: 'p1', kind: 'like' as never }, false);
  expect(res).toEqual({ ok: false, error: 'Set a community handle first' });
  expect(useCommunityStore.getState().reactionsByTarget.p1).toBeUndefined();
});

test('a refused follow is reported, and the user is not marked followed', async () => {
  mockInvoke.mockResolvedValue(refused({ error: 'Cannot follow yourself' }));
  const res = await useCommunityStore.getState().followUser('u2');
  expect(res).toEqual({ ok: false, error: 'Cannot follow yourself' });
  expect(useCommunityStore.getState().followedUserIds).toEqual([]);
});

test('an accepted follow is recorded', async () => {
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  expect((await useCommunityStore.getState().followUser('u2')).ok).toBe(true);
  expect(useCommunityStore.getState().followedUserIds).toEqual(['u2']);
});
