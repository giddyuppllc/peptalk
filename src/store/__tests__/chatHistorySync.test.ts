/**
 * Chat history: delete must propagate, and restore must never resurrect.
 *
 * `useChatStore` wrote every message to `chat_messages` and had no way to read
 * them back, so a reinstall or a new phone lost the entire conversation
 * history that was sitting on the server the whole time.
 *
 * The restore could not simply be wired up the way useSideEffectStore's was.
 * `deleteChat` was LOCAL-ONLY — nothing ever deleted `chat_messages` rows — so
 * a naive syncFromServer would have read every deleted conversation straight
 * back on the next boot. Restoring deleted data is a worse bug than losing
 * undeleted data, so deletion had to propagate first.
 *
 * Two independent mechanisms, because either alone is insufficient:
 *   1. deleteChat issues a server delete, retried through a persisted queue —
 *      a delete performed offline must still reach the server eventually.
 *   2. a persisted tombstone suppresses the conversation locally regardless of
 *      whether that server delete ever succeeds.
 *
 * These tests exercise the store directly rather than reading its source,
 * because the failure mode here is behavioural: every individual piece can look
 * correct while the merge still puts a deleted chat back on screen.
 */

import { useChatStore } from '../useChatStore';

const mockSyncRecord = jest.fn().mockResolvedValue(true);
const mockDeleteRecordsBy = jest.fn().mockResolvedValue(true);
const mockFetchUserRecords = jest.fn().mockResolvedValue([]);

jest.mock('../../services/syncService', () => ({
  syncRecord: (...a: unknown[]) => mockSyncRecord(...a),
  deleteRecord: jest.fn().mockResolvedValue(undefined),
  deleteRecordsBy: (...a: unknown[]) => mockDeleteRecordsBy(...a),
  fetchUserRecords: (...a: unknown[]) => mockFetchUserRecords(...a),
  hydrateFromServer: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));


const row = (id: string, chatId: string, role: 'user' | 'assistant', content: string, ts: string) => ({
  id, chat_id: chatId, role, content, created_at: ts,
});

function reset() {
  useChatStore.setState({
    chats: [],
    activeChatId: null,
    messages: [],
    pendingSyncs: [],
    pendingDeletions: [],
    deletedChatIds: [],
    isTyping: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteRecordsBy.mockResolvedValue(true);
  mockFetchUserRecords.mockResolvedValue([]);
  reset();
});

describe('deleteChat propagates to the server', () => {
  it('deletes every row sharing the chat_id, not one row by primary key', async () => {
    const id = useChatStore.getState().newChat();
    useChatStore.getState().deleteChat(id);
    await Promise.resolve();

    expect(mockDeleteRecordsBy).toHaveBeenCalledWith('chat_messages', 'chat_id', id);
  });

  it('records a tombstone even when the server delete succeeds', () => {
    const id = useChatStore.getState().newChat();
    useChatStore.getState().deleteChat(id);
    expect(useChatStore.getState().deletedChatIds).toContain(id);
  });

  it('keeps the deletion queued when the server rejects it', async () => {
    mockDeleteRecordsBy.mockResolvedValue(false);
    const id = useChatStore.getState().newChat();
    useChatStore.getState().deleteChat(id);
    await Promise.resolve();
    await Promise.resolve();

    const queued = useChatStore.getState().pendingDeletions;
    expect(queued.some((d) => d.kind === 'chat' && d.id === id)).toBe(true);
  });

  it('clears the queue entry once the server confirms', async () => {
    const id = useChatStore.getState().newChat();
    useChatStore.getState().deleteChat(id);
    await Promise.resolve();
    await Promise.resolve();

    const queued = useChatStore.getState().pendingDeletions;
    expect(queued.some((d) => d.kind === 'chat' && d.id === id)).toBe(false);
  });
});

describe('syncFromServer restores history', () => {
  it('rebuilds a conversation that exists only on the server', async () => {
    mockFetchUserRecords.mockResolvedValue([
      row('m2', 'chat-remote', 'assistant', 'Sure — 250 mcg.', '2026-08-01T10:00:01.000Z'),
      row('m1', 'chat-remote', 'user', 'What dose should I take?', '2026-08-01T10:00:00.000Z'),
    ]);

    await useChatStore.getState().syncFromServer();

    const chat = useChatStore.getState().chats.find((c) => c.id === 'chat-remote');
    expect(chat).toBeDefined();
    expect(chat!.messages.map((m) => m.id)).toEqual(['m1', 'm2']); // chronological
  });

  it('derives a title for a conversation it has never seen', async () => {
    mockFetchUserRecords.mockResolvedValue([
      row('m1', 'chat-remote', 'user', 'What dose should I take?', '2026-08-01T10:00:00.000Z'),
    ]);
    await useChatStore.getState().syncFromServer();
    const chat = useChatStore.getState().chats.find((c) => c.id === 'chat-remote')!;
    expect(chat.title).toBe('What dose should I take?');
  });

  it('never overwrites a title the user typed', async () => {
    useChatStore.setState({
      chats: [{
        id: 'chat-1', title: 'My cutting stack',
        createdAt: '2026-08-01T09:00:00.000Z', lastMessageAt: '2026-08-01T09:00:00.000Z',
        messages: [],
      }],
      activeChatId: 'chat-1',
    });
    mockFetchUserRecords.mockResolvedValue([
      row('m1', 'chat-1', 'user', 'totally different opening line', '2026-08-01T10:00:00.000Z'),
    ]);

    await useChatStore.getState().syncFromServer();

    expect(useChatStore.getState().chats.find((c) => c.id === 'chat-1')!.title)
      .toBe('My cutting stack');
  });

  it('keeps local messages the server has not seen yet', async () => {
    useChatStore.setState({
      chats: [{
        id: 'chat-1', title: 'New Chat',
        createdAt: '2026-08-01T09:00:00.000Z', lastMessageAt: '2026-08-01T09:00:00.000Z',
        messages: [{ id: 'local-only', role: 'user', content: 'queued offline', timestamp: '2026-08-01T11:00:00.000Z' }],
      }],
      activeChatId: 'chat-1',
    });
    mockFetchUserRecords.mockResolvedValue([
      row('m1', 'chat-1', 'user', 'synced earlier', '2026-08-01T10:00:00.000Z'),
    ]);

    await useChatStore.getState().syncFromServer();

    const ids = useChatStore.getState().chats.find((c) => c.id === 'chat-1')!.messages.map((m) => m.id);
    expect(ids).toContain('local-only');
    expect(ids).toContain('m1');
  });

  it('leaves the store alone when the server has nothing', async () => {
    const id = useChatStore.getState().newChat();
    mockFetchUserRecords.mockResolvedValue([]);
    await useChatStore.getState().syncFromServer();
    expect(useChatStore.getState().chats.some((c) => c.id === id)).toBe(true);
  });
});

describe('a deleted conversation never comes back', () => {
  it('is suppressed even when the server still returns its rows', async () => {
    // The exact scenario the tombstone exists for: the server delete failed
    // (offline), so the rows are still there when the restore runs.
    mockDeleteRecordsBy.mockResolvedValue(false);
    useChatStore.setState({
      chats: [{
        id: 'chat-doomed', title: 'Private',
        createdAt: '2026-08-01T09:00:00.000Z', lastMessageAt: '2026-08-01T09:00:00.000Z',
        messages: [{ id: 'm1', role: 'user', content: 'delete me', timestamp: '2026-08-01T09:00:00.000Z' }],
      }],
      activeChatId: 'chat-doomed',
    });

    useChatStore.getState().deleteChat('chat-doomed');
    await Promise.resolve();

    mockFetchUserRecords.mockResolvedValue([
      row('m1', 'chat-doomed', 'user', 'delete me', '2026-08-01T09:00:00.000Z'),
    ]);
    await useChatStore.getState().syncFromServer();

    expect(useChatStore.getState().chats.some((c) => c.id === 'chat-doomed')).toBe(false);
  });

  it('stays suppressed across repeated restores', async () => {
    useChatStore.setState({ deletedChatIds: ['chat-doomed'] });
    mockFetchUserRecords.mockResolvedValue([
      row('m1', 'chat-doomed', 'user', 'delete me', '2026-08-01T09:00:00.000Z'),
    ]);
    await useChatStore.getState().syncFromServer();
    await useChatStore.getState().syncFromServer();
    expect(useChatStore.getState().chats.some((c) => c.id === 'chat-doomed')).toBe(false);
  });
});

describe('sustainability', () => {
  it('bounds how many conversations are held after a restore', async () => {
    const rows = [];
    for (let i = 0; i < 80; i++) {
      rows.push(row(`m${i}`, `chat-${i}`, 'user', `msg ${i}`, `2026-08-01T10:${String(i).padStart(2, '0')}:00.000Z`));
    }
    mockFetchUserRecords.mockResolvedValue(rows);
    await useChatStore.getState().syncFromServer();
    expect(useChatStore.getState().chats.length).toBeLessThanOrEqual(50);
  });

  it('asks the server for a bounded window rather than all history', async () => {
    await useChatStore.getState().syncFromServer();
    const opts = mockFetchUserRecords.mock.calls[0][1];
    expect(opts.limit).toBeGreaterThan(0);
    expect(opts.orderBy).toBe('created_at');
    expect(opts.ascending).toBe(false);
  });

  it('caps tombstones so they cannot grow without bound', () => {
    const many = Array.from({ length: 600 }, (_, i) => `chat-${i}`);
    useChatStore.setState({ deletedChatIds: many });
    const id = useChatStore.getState().newChat();
    useChatStore.getState().deleteChat(id);
    expect(useChatStore.getState().deletedChatIds.length).toBeLessThanOrEqual(500);
    expect(useChatStore.getState().deletedChatIds).toContain(id);
  });
});
