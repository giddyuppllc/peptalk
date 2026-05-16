import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ChatMessage } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord } from '../services/syncService';

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

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  messages: ChatMessage[]; // mirror of the active chat's messages (kept in sync)
  isTyping: boolean;
  /** Messages whose cloud sync failed. Flushed on boot + after every new message. */
  pendingSyncs: PendingSyncEntry[];

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

      newChat: () => {
        const chat = makeEmptyChat();
        set((state) => {
          const chats = [chat, ...state.chats];
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
        if (!state) return;
        if (!state.chats || state.chats.length === 0) {
          const fresh = makeEmptyChat();
          useChatStore.setState({ chats: [fresh], activeChatId: fresh.id, messages: fresh.messages });
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
        useChatStore.setState({ activeChatId, messages: activeMessages(state.chats, activeChatId) });
      },
    },
  ),
);
