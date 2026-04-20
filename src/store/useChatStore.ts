import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ChatMessage } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord } from '../services/syncService';
import { useSubscriptionStore } from './useSubscriptionStore';

const MAX_HISTORY = 200; // keep last 200 messages per chat
const FREE_DAILY_MESSAGE_LIMIT = 10;

const todayKey = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  messages: ChatMessage[]; // mirror of the active chat's messages (kept in sync)
  isTyping: boolean;
  dailyMessageCount: number;
  lastMessageDate: string;

  // Chat management
  newChat: () => string;
  switchChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;

  // Message operations (act on active chat)
  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
  clearChat: () => void;

  // Rate limiting
  incrementMessageCount: () => void;
  canSendMessage: () => boolean;
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
      dailyMessageCount: 0,
      lastMessageDate: '',

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

        // Cloud sync message (fire and forget)
        syncRecord('chat_messages', {
          id: message.id,
          chat_id: get().activeChatId,
          role: message.role,
          content: message.content,
          created_at: message.timestamp ?? new Date().toISOString(),
        }).catch(() => {});
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

      incrementMessageCount: () => {
        const today = todayKey();
        const { lastMessageDate, dailyMessageCount } = get();
        if (lastMessageDate !== today) {
          set({ dailyMessageCount: 1, lastMessageDate: today });
        } else {
          set({ dailyMessageCount: dailyMessageCount + 1 });
        }
      },

      canSendMessage: () => {
        const tier = useSubscriptionStore.getState().tier;
        if (tier === 'plus' || tier === 'pro') return true;

        const today = todayKey();
        const { lastMessageDate, dailyMessageCount } = get();
        if (lastMessageDate !== today) return true;
        return dailyMessageCount < FREE_DAILY_MESSAGE_LIMIT;
      },
    }),
    {
      name: 'peptalk-chat',
      version: 2,
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        dailyMessageCount: state.dailyMessageCount,
        lastMessageDate: state.lastMessageDate,
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
