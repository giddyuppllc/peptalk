import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ChatMessage } from '../types';
import { secureStorage } from '../services/secureStorage';
import {
  syncRecord,
  deleteRecordsBy,
  fetchUserRecords,
  getCurrentUserId,
} from '../services/syncService';

/**
 * Debounced setItem wrapper around secureStorage. The chat store
 * partializes the full chats[] tree, and the streaming chat flow fires
 * `updateMessage` on every SSE text_delta — that's 30-50+ writes for
 * a typical Aimee response, each encrypted via expo-secure-store /
 * react-native-encrypted-storage. The marginal cost adds visible jank
 * on the chat screen (perf audit P0).
 *
 * Coalescing the writes inside a 400 ms window collapses an entire
 * streaming turn into ~1 write at the end. Reads are not debounced —
 * they go straight through (hot path on screen mount).
 *
 * If the user backgrounds or kills the app while a write is pending,
 * Zustand re-emits the whole state on next launch, so worst case is
 * losing < 400 ms of in-flight token writes — equivalent to the
 * stream having been a hair shorter.
 */
const PERSIST_DEBOUNCE_MS = 400;

function createDebouncedStorage() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;
  return {
    async getItem(key: string): Promise<string | null> {
      // Flush any in-flight write before reading so a hot reload
      // doesn't return stale data.
      if (pending) {
        const { key: pk, value: pv } = pending;
        pending = null;
        if (timer) clearTimeout(timer);
        timer = null;
        await secureStorage.setItem(pk, pv);
      }
      return secureStorage.getItem(key);
    },
    setItem(key: string, value: string): void {
      pending = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending) {
          const { key: pk, value: pv } = pending;
          pending = null;
          timer = null;
          // Fire-and-forget — Zustand's persist doesn't await the
          // result anyway, and a failed write surfaces in the next
          // attempt.
          void secureStorage.setItem(pk, pv);
        }
      }, PERSIST_DEBOUNCE_MS);
    },
    async removeItem(key: string): Promise<void> {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await secureStorage.removeItem(key);
    },
  };
}

const debouncedChatStorage = createDebouncedStorage();

const MAX_HISTORY = 200; // keep last 200 messages per chat
// Bound the outer chats array too. Heavy users were creating many
// threads with no upper limit, so the persisted store kept growing
// toward the secure-store budget. 100 chats × 200 messages × ~2KB ≈
// 40MB worst case, but typical usage is far below.
const MAX_CHATS = 100;

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messages: ChatMessage[];
}

const newChatId = () => `chat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const makeEmptyChat = (): Chat => {
  const now = new Date().toISOString();
  return {
    id: newChatId(),
    title: 'New Chat',
    createdAt: now,
    lastMessageAt: now,
    messages: [],
  };
};

/** Derive a title from the first user message (~32 chars, single-line) */
const deriveTitle = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const clean = firstUser.content.replace(/\s+/g, ' ').trim();
  if (clean.length <= 32) return clean;
  return clean.slice(0, 30).trim() + '…';
};

/** Message ids whose sync to Supabase has not yet succeeded. */
interface PendingSyncEntry {
  messageId: string;
  chatId: string | null;
  attempts: number;
}

/**
 * A deletion the user performed locally that the server has not yet confirmed.
 *
 * Without this queue a delete performed offline is simply lost, and the next
 * boot's syncFromServer reads the rows straight back — the user deletes a
 * conversation, reopens the app, and it is there again. `kind` distinguishes a
 * whole conversation (every row sharing a chat_id) from a single message.
 */
interface PendingDeletionEntry {
  kind: 'chat' | 'message';
  id: string;
  attempts: number;
}

/**
 * Cap on retained tombstones. A tombstone is normally dropped the moment the
 * server confirms the delete, so this list stays near-empty; the cap is a
 * backstop so a permanently offline device cannot grow it without bound.
 */
const MAX_TOMBSTONES = 500;

/** Accounts whose tombstones are retained while signed out. Bounded so a
 *  shared device cannot accumulate state for unlimited accounts. */
const MAX_ARCHIVED_ACCOUNTS = 5;

/** Most recent conversations kept when restoring. Bounds both the query and
 *  the amount of history rehydrated into memory on a cold boot. */
const RESTORE_CHAT_LIMIT = 50;
/** Rows pulled per restore. Chat history is the fastest-growing table here. */
const RESTORE_MESSAGE_LIMIT = 2000;

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  messages: ChatMessage[]; // mirror of the active chat's messages (kept in sync)
  isTyping: boolean;
  /** Messages whose cloud sync failed. Flushed on boot + after every new message. */
  pendingSyncs: PendingSyncEntry[];
  /** Deletions awaiting server confirmation. Retried by flushPendingSyncs. */
  pendingDeletions: PendingDeletionEntry[];
  /** Chat ids deleted locally. A restore must never re-create these, even if
   *  the server delete has not landed yet. */
  deletedChatIds: string[];
  /**
   * Tombstones and unconfirmed deletions belonging to accounts that are not
   * currently signed in, keyed by user id.
   *
   * Sign-out cannot simply discard this state. If it does, a chat deleted
   * offline — where the server delete has not landed yet — comes back the next
   * time that user signs in, because the restore reads the server and no
   * tombstone survives to suppress it. Keying by account gets both properties
   * at once: one user's deletions never apply to another's session, and a
   * user's own deletions survive their own sign-out.
   *
   * Only opaque chat ids are retained — never message content.
   */
  archivedDeletions: Record<string, { tombstones: string[]; pending: PendingDeletionEntry[] }>;
  /** Which account the active tombstone list belongs to. */
  tombstoneOwnerId: string | null;
  /** Merge server-held history into the local store. Safe to call repeatedly. */
  syncFromServer: () => Promise<void>;
  /**
   * True once async storage rehydration completes. Callers that depend
   * on `pendingSyncs` (the boot flush in `_layout.tsx`) must wait on
   * this — otherwise they see an empty array because rehydration
   * hasn't filled it yet, and silently fail to drain queued offline
   * messages.
   */
  hasHydrated: boolean;

  // Chat management
  newChat: () => string;
  switchChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;

  // Message operations (act on active chat)
  addMessage: (message: ChatMessage) => void;
  /** Patch an existing message in-place. Used for streaming updates where the
   *  initial empty assistant bubble gets text/tool results filled in as the
   *  SSE stream arrives. The patch is shallow-merged. */
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /** Remove a single message by id (used when an SSE stream fails
   *  before yielding any event — we need to drop the empty
   *  placeholder bubble so the fallback reply doesn't render
   *  alongside an empty one). */
  removeMessage: (id: string) => void;
  setTyping: (typing: boolean) => void;
  clearChat: () => void;
  /**
   * Hard reset for logout — wipes EVERY chat thread + the pending-sync
   * queue. `clearChat` only drops the active thread and leaves
   * pendingSyncs intact, which means a queued offline message from
   * user A would be replayed on user B's auth after re-login on the
   * same device. P0 cross-user data leak. 2026-05-17 fix.
   */
  resetForLogout: (ownerUserId?: string | null) => void;

  /**
   * Retry any previously-failed message syncs. Call on app boot and after
   * network comes back. Drops entries that have exceeded max attempts so
   * the queue can't grow unbounded.
   *
   * Note: rate limiting is enforced by the aimee-chat edge function via
   * the service-role-only `ai_usage_log` table — there is deliberately no
   * client-side quota here because a client counter would be trivially
   * bypassed (clear chat history, edit device clock, etc.) and doesn't
   * protect anything the server isn't already protecting.
   */
  flushPendingSyncs: () => Promise<void>;
}

const MAX_SYNC_ATTEMPTS = 5;

/** Sync a single message record. Returns the boolean success from
 *  syncRecord so the retry queue can decide whether to re-enqueue. */
async function syncChatMessage(
  message: ChatMessage,
  chatId: string | null,
): Promise<boolean> {
  try {
    return await syncRecord('chat_messages', {
      id: message.id,
      chat_id: chatId,
      role: message.role,
      content: message.content,
      created_at: message.timestamp ?? new Date().toISOString(),
    });
  } catch (err) {
    if (__DEV__) console.warn('[useChatStore] syncChatMessage threw:', err);
    return false;
  }
}

/** Helper: compute the `messages` mirror from chats + activeChatId */
const activeMessages = (chats: Chat[], activeChatId: string | null): ChatMessage[] => {
  if (!activeChatId) return [];
  return chats.find((c) => c.id === activeChatId)?.messages ?? [];
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      messages: [],
      isTyping: false,
      pendingSyncs: [],
      pendingDeletions: [],
      deletedChatIds: [],
      archivedDeletions: {},
      tombstoneOwnerId: null,
      hasHydrated: false,

      newChat: () => {
        const chat = makeEmptyChat();
        set((state) => {
          // Newest chats win; drop the oldest tail past MAX_CHATS.
          const chats = [chat, ...state.chats].slice(0, MAX_CHATS);
          return {
            chats,
            activeChatId: chat.id,
            messages: chat.messages,
          };
        });
        return chat.id;
      },

      switchChat: (id) => {
        set((state) => {
          const target = state.chats.find((c) => c.id === id);
          if (!target) return state;
          return {
            activeChatId: id,
            messages: target.messages,
          };
        });
      },

      deleteChat: (id) => {
        // Deleting a conversation has to reach the server, or the restore
        // added alongside this would read it straight back on the next boot.
        // The tombstone is recorded FIRST and independently of whether the
        // network call succeeds: a delete performed offline must still be
        // honoured locally forever, and the queued retry closes the loop on
        // the server when connectivity returns.
        set((state) => ({
          deletedChatIds: [...state.deletedChatIds, id].slice(-MAX_TOMBSTONES),
          pendingDeletions: [
            ...state.pendingDeletions.filter((d) => !(d.kind === 'chat' && d.id === id)),
            { kind: 'chat' as const, id, attempts: 0 },
          ],
        }));
        void deleteRecordsBy('chat_messages', 'chat_id', id).then((ok) => {
          if (!ok) return; // stays queued for flushPendingSyncs
          set((state) => ({
            pendingDeletions: state.pendingDeletions.filter(
              (d) => !(d.kind === 'chat' && d.id === id),
            ),
          }));
        });

        set((state) => {
          const remaining = state.chats.filter((c) => c.id !== id);
          // If we just deleted the last chat, spawn a fresh empty one
          if (remaining.length === 0) {
            const fresh = makeEmptyChat();
            return {
              chats: [fresh],
              activeChatId: fresh.id,
              messages: fresh.messages,
            };
          }
          let nextActive = state.activeChatId;
          if (state.activeChatId === id) {
            nextActive = remaining[0].id;
          }
          return {
            chats: remaining,
            activeChatId: nextActive,
            messages: activeMessages(remaining, nextActive),
          };
        });
      },

      renameChat: (id, title) => {
        set((state) => ({
          chats: state.chats.map((c) => (c.id === id ? { ...c, title } : c)),
        }));
      },

      addMessage: (message) => {
        set((state) => {
          let chats = state.chats;
          let activeChatId = state.activeChatId;

          // Ensure we have an active chat
          if (!activeChatId || !chats.find((c) => c.id === activeChatId)) {
            const fresh = makeEmptyChat();
            chats = [fresh, ...chats];
            activeChatId = fresh.id;
          }

          const now = new Date().toISOString();
          const nextChats = chats.map((c) => {
            if (c.id !== activeChatId) return c;
            const nextMessages = [...c.messages, message].slice(-MAX_HISTORY);
            const nextTitle = c.title === 'New Chat' ? deriveTitle(nextMessages) : c.title;
            return {
              ...c,
              messages: nextMessages,
              title: nextTitle,
              lastMessageAt: now,
            };
          });

          return {
            chats: nextChats,
            activeChatId,
            messages: activeMessages(nextChats, activeChatId),
          };
        });

        // Cloud sync with retry queue: try once now, and if that fails,
        // persist to `pendingSyncs` so we can retry on the next message
        // or app boot. This is why chat history doesn't diverge across
        // devices when the network flakes during a send.
        const chatId = get().activeChatId;
        (async () => {
          const ok = await syncChatMessage(message, chatId);
          if (!ok) {
            set((st) => ({
              pendingSyncs: [
                ...st.pendingSyncs,
                { messageId: message.id, chatId, attempts: 1 },
              ],
            }));
          }
          // Either way, opportunistically try to drain the backlog —
          // network might have just come back.
          void get().flushPendingSyncs();
        })();
      },

      updateMessage: (id, patch) => {
        // Streaming updates land here repeatedly per token. We
        // intentionally skip cloud sync on update — only the final
        // assistant message gets synced server-side. Local mirror only.
        //
        // Fast-path: 99% of streaming updates target the ACTIVE chat.
        // Walk that chat first (O(1) lookup); only fall back to a
        // full-chats scan if the id isn't in the active chat. The
        // earlier "scan all chats every time" implementation was the
        // hot loop in the perf audit (O(N×M) array clones per token
        // — N chats, M messages). Combined with the streaming-pause
        // in the storage layer below, this turns each token into
        // one map+spread, not N.
        set((state) => {
          const activeChatId = state.activeChatId;

          // Fast path — active chat.
          if (activeChatId) {
            const activeIdx = state.chats.findIndex((c) => c.id === activeChatId);
            if (activeIdx >= 0) {
              const chat = state.chats[activeIdx];
              const msgIdx = chat.messages.findIndex((m) => m.id === id);
              if (msgIdx >= 0) {
                const nextMessages = [...chat.messages];
                nextMessages[msgIdx] = { ...nextMessages[msgIdx], ...patch };
                const nextChat = { ...chat, messages: nextMessages };
                const nextChats = [...state.chats];
                nextChats[activeIdx] = nextChat;
                return {
                  ...state,
                  chats: nextChats,
                  messages: nextMessages,
                };
              }
            }
          }

          // Slow path — message belongs to a backgrounded chat. Falls
          // through here when the user switched conversations mid-
          // stream; we still update the right chat so the bubble
          // unfreezes when they switch back.
          let foundChatId: string | null = null;
          const nextChats = state.chats.map((c) => {
            if (c.id === activeChatId) return c; // already checked
            const idx = c.messages.findIndex((m) => m.id === id);
            if (idx < 0) return c;
            foundChatId = c.id;
            const merged: ChatMessage = { ...c.messages[idx], ...patch };
            const nextMessages = [...c.messages];
            nextMessages[idx] = merged;
            return { ...c, messages: nextMessages };
          });
          if (!foundChatId) return state;
          return {
            ...state,
            chats: nextChats,
            messages: activeChatId
              ? activeMessages(nextChats, activeChatId)
              : state.messages,
          };
        });
      },

      removeMessage: (id) => {
        // Same contract as deleteChat: a message removed locally must not come
        // back when history is restored. Queued on failure rather than lost.
        set((state) => ({
          pendingDeletions: [
            ...state.pendingDeletions.filter((d) => !(d.kind === 'message' && d.id === id)),
            { kind: 'message' as const, id, attempts: 0 },
          ],
        }));
        // deleteRecordsBy, not deleteRecord: the latter returns void and
        // swallows the error, so the queue entry would be cleared on a failed
        // delete exactly as if it had succeeded.
        void deleteRecordsBy('chat_messages', 'id', id).then((ok) => {
          if (!ok) return; // stays queued for flushPendingSyncs
          set((state) => ({
            pendingDeletions: state.pendingDeletions.filter(
              (d) => !(d.kind === 'message' && d.id === id),
            ),
          }));
        });

        set((state) => {
          let foundChatId: string | null = null;
          const nextChats = state.chats.map((c) => {
            if (!c.messages.some((m) => m.id === id)) return c;
            foundChatId = c.id;
            return { ...c, messages: c.messages.filter((m) => m.id !== id) };
          });
          if (!foundChatId) return state;
          return {
            ...state,
            chats: nextChats,
            messages: state.activeChatId
              ? activeMessages(nextChats, state.activeChatId)
              : state.messages,
          };
        });
      },

      setTyping: (isTyping) => set({ isTyping }),

      clearChat: () => {
        const { activeChatId } = get();
        if (!activeChatId) {
          const fresh = makeEmptyChat();
          set({ chats: [fresh], activeChatId: fresh.id, messages: fresh.messages });
          return;
        }
        // Delete the active chat — if it was the last one, a fresh one gets spawned
        get().deleteChat(activeChatId);
      },

      resetForLogout: (ownerUserId) => {
        // Wipe EVERYTHING — every chat thread, every queued sync, the
        // active id, the messages mirror. Critical for shared-device
        // privacy: without this, user A's pendingSyncs would be sent
        // under user B's auth after re-login.
        const fresh = makeEmptyChat();
        set({
          chats: [fresh],
          activeChatId: fresh.id,
          messages: fresh.messages,
          pendingSyncs: [],
          isTyping: false,
        });

        // Deletions are ARCHIVED under the outgoing account, not discarded.
        //
        // Discarding them is the intuitive move — it is what every other store
        // here does on logout — but it quietly breaks deletion: a chat deleted
        // while offline still exists on the server, and with no surviving
        // tombstone the next sign-in reads it straight back. Keying the state
        // by account keeps both guarantees: it never applies to a different
        // user's session, and it is waiting when its owner returns.
        set((state) => {
          const owner = ownerUserId ?? state.tombstoneOwnerId;
          if (!owner || (state.deletedChatIds.length === 0 && state.pendingDeletions.length === 0)) {
            return { deletedChatIds: [], pendingDeletions: [], tombstoneOwnerId: null };
          }
          const prior = state.archivedDeletions[owner];
          const archivedDeletions = {
            ...state.archivedDeletions,
            [owner]: {
              tombstones: Array.from(
                new Set([...(prior?.tombstones ?? []), ...state.deletedChatIds]),
              ).slice(-MAX_TOMBSTONES),
              pending: [...(prior?.pending ?? []), ...state.pendingDeletions],
            },
          };
          // Bound how many accounts are retained on a shared device.
          const keys = Object.keys(archivedDeletions);
          if (keys.length > MAX_ARCHIVED_ACCOUNTS) {
            for (const k of keys.slice(0, keys.length - MAX_ARCHIVED_ACCOUNTS)) {
              delete archivedDeletions[k];
            }
          }
          return {
            archivedDeletions,
            deletedChatIds: [],
            pendingDeletions: [],
            tombstoneOwnerId: null,
          };
        });
      },

      flushPendingSyncs: async () => {
        const queue = get().pendingSyncs;
        if (queue.length === 0) return;

        // Short-circuit when offline. Walking the queue serially with
        // syncRecord against a dead connection burns CPU + retry budget
        // (each entry's attempts counter ticks up toward MAX_SYNC_ATTEMPTS
        // and the message gets dropped permanently after enough failures).
        // The reconnect listener in app/_layout.tsx re-calls this when the
        // device comes back online.
        try {
          const { isCurrentlyOnline } = await import('../hooks/useNetworkStatus');
          const online = await isCurrentlyOnline();
          if (!online) {
            if (__DEV__) console.log('[useChatStore] flushPendingSyncs offline — skipping');
            return;
          }
        } catch {
          // NetInfo unavailable (Expo Go / web / jest) — fall through and
          // let syncRecord fail naturally if the network really is down.
        }

        // Retry unconfirmed deletions BEFORE replaying writes. Order matters:
        // if a message write and its own deletion are both queued, replaying
        // the write first would re-insert a row the user already deleted.
        const delQueue = get().pendingDeletions;
        if (delQueue.length > 0) {
          const stillDeleting: PendingDeletionEntry[] = [];
          for (const d of delQueue) {
            const ok =
              d.kind === 'chat'
                ? await deleteRecordsBy('chat_messages', 'chat_id', d.id)
                : await deleteRecordsBy('chat_messages', 'id', d.id);
            if (ok) continue;
            const attempts = d.attempts + 1;
            // Deliberately NOT dropped at MAX_SYNC_ATTEMPTS the way writes are.
            // Abandoning a write loses one message; abandoning a delete leaves
            // data on the server the user asked to remove. The tombstone keeps
            // it invisible locally either way, and the retry costs one request
            // per boot.
            stillDeleting.push({ ...d, attempts });
          }
          set({ pendingDeletions: stillDeleting });
        }

        // Look up the message bodies from the local chat store. If the
        // message was deleted (clearChat), drop it from the queue.
        const allMessages = new Map<string, { message: ChatMessage; chatId: string | null }>();
        for (const c of get().chats) {
          for (const m of c.messages) {
            allMessages.set(m.id, { message: m, chatId: c.id });
          }
        }

        const stillFailing: PendingSyncEntry[] = [];
        for (const entry of queue) {
          const hit = allMessages.get(entry.messageId);
          if (!hit) continue; // message gone — drop silently

          // Prefer the chatId recorded at queue time; fall back to the
          // current owning chat if unknown.
          const chatId = entry.chatId ?? hit.chatId;
          const ok = await syncChatMessage(hit.message, chatId);
          if (ok) continue;

          const attempts = entry.attempts + 1;
          if (attempts >= MAX_SYNC_ATTEMPTS) {
            if (__DEV__) {
              console.warn(
                '[useChatStore] giving up on message sync after',
                attempts,
                'attempts:',
                entry.messageId,
              );
            }
            continue;
          }
          stillFailing.push({ messageId: entry.messageId, chatId, attempts });
        }

        set({ pendingSyncs: stillFailing });
      },

      syncFromServer: async () => {
        // Chat history is the fastest-growing table in the app, so this reads a
        // bounded window (newest first) rather than the whole history, and
        // keeps a bounded number of conversations in memory.
        type Row = {
          id: string;
          chat_id: string | null;
          role: ChatMessage['role'];
          content: string;
          created_at: string | null;
        };

        // Adopt this account's archived tombstones before reading anything.
        // Without this the restore below would happily rebuild a conversation
        // the user deleted before their last sign-out.
        const uid = await getCurrentUserId();
        if (uid) {
          const st = get();
          if (st.tombstoneOwnerId !== uid) {
            const archived = st.archivedDeletions[uid];
            const rest = { ...st.archivedDeletions };
            delete rest[uid];
            set({
              tombstoneOwnerId: uid,
              deletedChatIds: Array.from(
                new Set([...st.deletedChatIds, ...(archived?.tombstones ?? [])]),
              ).slice(-MAX_TOMBSTONES),
              pendingDeletions: [...st.pendingDeletions, ...(archived?.pending ?? [])],
              archivedDeletions: rest,
            });
          }
        }

        let rows: Row[] = [];
        try {
          rows = await fetchUserRecords<Row>('chat_messages', {
            orderBy: 'created_at',
            ascending: false,
            limit: RESTORE_MESSAGE_LIMIT,
          });
        } catch (e) {
          if (__DEV__) console.warn('[useChatStore] syncFromServer failed:', e);
          return;
        }
        if (rows.length === 0) return;

        const state = get();
        const tombstoned = new Set(state.deletedChatIds);
        const localById = new Map(state.chats.map((c) => [c.id, c]));

        // Group server rows into conversations, dropping anything the user
        // deleted here. This is the belt-and-braces half of the delete: even if
        // the server delete never succeeds, a deleted conversation can never
        // reappear on this device.
        const grouped = new Map<string, ChatMessage[]>();
        for (const r of rows) {
          const chatId = r.chat_id;
          if (!chatId || tombstoned.has(chatId) || !r.id) continue;
          const msg: ChatMessage = {
            id: r.id,
            role: r.role,
            content: r.content ?? '',
            timestamp: r.created_at ?? new Date().toISOString(),
          };
          const bucket = grouped.get(chatId);
          if (bucket) bucket.push(msg);
          else grouped.set(chatId, [msg]);
        }
        if (grouped.size === 0) return;

        const restored: Chat[] = [];
        for (const [chatId, serverMsgs] of grouped) {
          const local = localById.get(chatId);
          // Merge by message id, local first so anything the server has not
          // seen yet (queued writes, in-flight streams) survives the merge.
          const byId = new Map<string, ChatMessage>();
          for (const m of local?.messages ?? []) byId.set(m.id, m);
          for (const m of serverMsgs) if (!byId.has(m.id)) byId.set(m.id, m);
          const messages = Array.from(byId.values()).sort((a, b) =>
            a.timestamp < b.timestamp ? -1 : 1,
          );
          const lastMessageAt = messages[messages.length - 1]?.timestamp ?? new Date().toISOString();
          restored.push({
            id: chatId,
            // A title the user typed is theirs — never overwrite it with a
            // derived one. Only a conversation with no local copy gets its
            // title reconstructed, using the same helper the app already uses
            // for new chats and for the legacy migration.
            title: local && local.title !== 'New Chat' ? local.title : deriveTitle(messages),
            createdAt: local?.createdAt ?? messages[0]?.timestamp ?? lastMessageAt,
            lastMessageAt,
            messages,
          });
          localById.delete(chatId);
        }

        // Local-only conversations (never synced, or created offline) are kept.
        for (const leftover of localById.values()) {
          if (!tombstoned.has(leftover.id)) restored.push(leftover);
        }

        const chats = restored
          .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
          .slice(0, RESTORE_CHAT_LIMIT);
        if (chats.length === 0) return;

        // Keep the user where they were. Only move if the active chat is gone.
        const activeChatId =
          state.activeChatId && chats.some((c) => c.id === state.activeChatId)
            ? state.activeChatId
            : chats[0].id;

        set({ chats, activeChatId, messages: activeMessages(chats, activeChatId) });
      },
    }),
    {
      name: 'peptalk-chat',
      version: 2,
      // Debounced storage layer — collapses streaming-token write
      // storms into one encrypted write per ~400 ms instead of 30+
      // writes per turn. See createDebouncedStorage at top of file.
      storage: createJSONStorage(() => debouncedChatStorage),
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        pendingSyncs: state.pendingSyncs,
        // Both MUST persist. A tombstone that does not survive a restart is
        // not a tombstone — the next boot's syncFromServer would read the
        // deleted conversation straight back, which is the exact failure this
        // whole mechanism exists to prevent.
        pendingDeletions: state.pendingDeletions,
        deletedChatIds: state.deletedChatIds,
        archivedDeletions: state.archivedDeletions,
        tombstoneOwnerId: state.tombstoneOwnerId,
      }),
      migrate: (persisted: any, version) => {
        // v1 → v2: wrap legacy flat messages[] into a single Chat
        if (version < 2 && persisted && Array.isArray(persisted.messages)) {
          const legacyMessages: ChatMessage[] = persisted.messages;
          if (legacyMessages.length > 0) {
            const legacyChat: Chat = {
              id: newChatId(),
              title: deriveTitle(legacyMessages),
              createdAt: legacyMessages[0]?.timestamp ?? new Date().toISOString(),
              lastMessageAt: legacyMessages[legacyMessages.length - 1]?.timestamp ?? new Date().toISOString(),
              messages: legacyMessages,
            };
            return {
              ...persisted,
              chats: [legacyChat],
              activeChatId: legacyChat.id,
              messages: undefined,
            };
          }
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        // Ensure there's always at least one chat after hydration, and sync the messages mirror
        if (!state) {
          useChatStore.setState({ hasHydrated: true });
          return;
        }
        if (!state.chats || state.chats.length === 0) {
          const fresh = makeEmptyChat();
          useChatStore.setState({
            chats: [fresh],
            activeChatId: fresh.id,
            messages: fresh.messages,
            hasHydrated: true,
          });
          return;
        }
        // Defensive sweep — any message persisted with `streaming: true`
        // came from a stream that was interrupted (force-quit, network
        // drop, OS suspend) before the `done` event fired. Leaving it
        // streaming makes the bubble render with a forever-blinking
        // caret on next launch. Also drop empty bot bubbles that
        // carry no toolResults / pendingActions — those are dead
        // placeholders from a stream that threw before yielding any
        // event.
        for (const chat of state.chats) {
          chat.messages = chat.messages.filter((m: ChatMessage) => {
            if (m.role !== 'bot') return true;
            const hasContent = typeof m.content === 'string' && m.content.trim().length > 0;
            const hasCards =
              (m.toolResults && m.toolResults.length > 0) ||
              (m.pendingActions && m.pendingActions.length > 0);
            return hasContent || hasCards;
          });
          for (const m of chat.messages) {
            if (m.streaming) m.streaming = false;
          }
        }
        const activeChatId = (!state.activeChatId || !state.chats.find((c: Chat) => c.id === state.activeChatId))
          ? state.chats[0].id
          : state.activeChatId;
        useChatStore.setState({
          activeChatId,
          messages: activeMessages(state.chats, activeChatId),
          hasHydrated: true,
        });
      },
    },
  ),
);
