jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
const mockDeleteEq = jest.fn(async (_c: string, _v: string) => ({ error: null }));
const mockFrom = jest.fn((_t: string) => ({ delete: () => ({ eq: mockDeleteEq }) }));
jest.mock('../supabase', () => ({ supabase: { from: (t: string) => mockFrom(t), auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }));

const unsubscribe = jest.fn(async () => true);
let sub: { endpoint: string; unsubscribe: typeof unsubscribe } | null = { endpoint: 'https://push.example/abc', unsubscribe };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } },
});

let removeThisBrowserSubscription: () => Promise<void>;
beforeAll(() => {
  jest.isolateModules(() => { removeThisBrowserSubscription = require('../webPush').removeThisBrowserSubscription; });
});
beforeEach(() => { jest.clearAllMocks(); });

test('sign-out deletes this browser\'s subscription row and unsubscribes it', async () => {
  await removeThisBrowserSubscription();
  expect(mockFrom).toHaveBeenCalledWith('web_push_subscriptions');
  expect(mockDeleteEq).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
  expect(unsubscribe).toHaveBeenCalled();
  // Reminder schedules are not touched — the user's other devices keep them.
  expect(mockFrom).not.toHaveBeenCalledWith('web_dose_reminders');
});

test('no subscription in this browser → nothing to do', async () => {
  sub = null;
  await removeThisBrowserSubscription();
  expect(mockFrom).not.toHaveBeenCalled();
});
