jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../notificationService', () => ({
  notificationsAvailable: () => true,
  registerForPushNotifications: jest.fn(async () => 'ExponentPushToken[abc]'),
}));

import { writeToken, isMissingFunction } from '../pushTokenSync';

function client(rpcResult: { error: unknown }) {
  const upsert = jest.fn(async () => ({ error: null }));
  const rpc = jest.fn(async () => rpcResult);
  return { rpc, upsert, c: { rpc, from: () => ({ upsert }) } };
}

test('the device token is claimed for the signed-in user through the RPC', async () => {
  const { c, rpc, upsert } = client({ error: null });
  expect(await writeToken(c, 'user-b', 'ExponentPushToken[abc]', 'android')).toBeNull();
  expect(rpc).toHaveBeenCalledWith('claim_push_token', { p_token: 'ExponentPushToken[abc]', p_platform: 'android' });
  expect(upsert).not.toHaveBeenCalled();
});

test('before the migration, it falls back to the plain upsert', async () => {
  const { c, upsert } = client({ error: { code: 'PGRST202', message: 'Could not find the function' } });
  expect(await writeToken(c, 'user-b', 'ExponentPushToken[abc]', 'ios')).toBeNull();
  expect(upsert).toHaveBeenCalled();
});

test('a real RPC error is returned, not masked by the fallback', async () => {
  const { c, upsert } = client({ error: { code: '42501', message: 'not signed in' } });
  expect(await writeToken(c, 'u', 'ExponentPushToken[abc]', 'ios')).toEqual({ code: '42501', message: 'not signed in' });
  expect(upsert).not.toHaveBeenCalled();
});

test('isMissingFunction', () => {
  expect(isMissingFunction({ code: '42883' })).toBe(true);
  expect(isMissingFunction({ code: '42501' })).toBe(false);
  expect(isMissingFunction(null)).toBe(false);
});
