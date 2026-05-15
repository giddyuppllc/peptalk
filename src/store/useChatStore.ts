import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ChatMessage } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord } from '../services/syncService';

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
        // Streaming updates land here repeatedly per token. We intentionally
        // skip cloud sync on update — only the final assistant message gets
        // synced on the streaming endpoint's server side (chat_messages
        // insert is done by the edge function). Local mirror only.
        set((state) => {
          const activeChatId = state.activeChatId;
          if (!activeChatId) return state;
          const nextChats = state.chats.map((c) => {
            if (c.id !== activeChatId) return c;
            const idx = c.messages.findIndex((m) => m.id === id);
            if (idx < 0) return c;
            const merged: ChatMessage = { ...c.messages[idx], ...patch };
            const nextMessages = [...c.messages];
            nextMessages[idx] = merged;
            return { ...c, messages: nextMessages };
          });
          return {
            ...state,
            chats: nextChats,
            messages: activeMessages(nextChats, activeChatId),
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
      storage: createJSONStorage(() => secureStorage),
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
        const activeChatId = (!state.activeChatId || !state.chats.find((c: Chat) => c.id === state.activeChatId))
          ? state.chats[0].id
          : state.activeChatId;
        useChatStore.setState({ activeChatId, messages: activeMessages(state.chats, activeChatId) });
      },
    },
  ),
);
