jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }));
jest.mock('../../services/syncService', () => ({ syncRecord: jest.fn(async () => true), fetchUserRecords: jest.fn(async () => []), getCurrentUserId: jest.fn(async () => null), insertRecord: jest.fn(async () => true), deleteRecordsBy: jest.fn(async () => true) }));
jest.mock('../../services/secureStorage', () => ({ secureStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));

import { messageFromServerRow } from '../useChatStore';

test('cloud bot rows (app-written fallback/canned) come back tagged local; model replies do not', () => {
  expect(messageFromServerRow({ id: '1', role: 'bot', content: 'Here are some peptides…', created_at: null }).source).toBe('local');
  expect(messageFromServerRow({ id: '2', role: 'assistant' as never, content: 'Model reply', created_at: null }).source).toBeUndefined();
  expect(messageFromServerRow({ id: '3', role: 'user', content: 'hi', created_at: null }).source).toBeUndefined();
});
