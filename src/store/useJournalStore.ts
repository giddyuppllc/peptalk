import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { JournalCategory, JournalEntry } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';
import { useSubscriptionStore } from './useSubscriptionStore';

const uid = () =>
  `journal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const FREE_WEEKLY_ENTRY_LIMIT = 3;

/** Get the Monday-based week start date string (YYYY-MM-DD). */
const getWeekStart = (): string => {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return toDateKey(monday);
};

interface JournalInput {
  date?: string;
  time?: string;
  category: JournalCategory;
  title: string;
  content: string;
  tags?: string[];
  relatedPeptideIds?: string[];
  mood?: 1 | 2 | 3 | 4 | 5;
}

interface JournalStore {
  entries: JournalEntry[];
  weeklyEntryCount: number;
  weekStartDate: string;

  /** Creates a journal entry. Returns the created entry, or `null` if the
   *  free-tier weekly cap is hit. Check-and-increment is atomic so rapid
   *  double-taps can't exceed the limit. */
  addEntry: (input: JournalInput) => JournalEntry | null;
  updateEntry: (id: string, updates: Partial<JournalInput>) => void;
  deleteEntry: (id: string) => void;
  getEntriesByDate: (date: string) => JournalEntry[];
  getEntriesByCategory: (category: JournalCategory) => JournalEntry[];
  getEntriesInRange: (start: string, end: string) => JournalEntry[];
  searchEntries: (query: string) => JournalEntry[];
  clearAll: () => void;
  incrementEntryCount: () => void;
  canCreateEntry: () => boolean;
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      entries: [],
      weeklyEntryCount: 0,
      weekStartDate: '',

      addEntry: (input) => {
        // Atomic: determine tier, reconcile week boundary, and check the
        // cap inside the same set() so two rapid taps can't both slip past.
        const currentWeekStart = getWeekStart();
        let tier: 'free' | 'plus' | 'pro' = 'free';
        try {
          const { useSubscriptionStore } = require('./useSubscriptionStore');
          tier = useSubscriptionStore.getState().tier ?? 'free';
        } catch {
          tier = 'free';
        }

        const { weekStartDate, weeklyEntryCount, entries } = get();
        const weekReset = weekStartDate !== currentWeekStart;
        const effectiveCount = weekReset ? 0 : weeklyEntryCount;

        if (tier === 'free' && effectiveCount >= FREE_WEEKLY_ENTRY_LIMIT) {
          return null;
        }

        const entry: JournalEntry = {
          id: uid(),
          date: input.date ?? toDateKey(new Date()),
          time: input.time ?? nowTime(),
          category: input.category,
          title: input.title.trim(),
          content: input.content.trim(),
          tags: input.tags ?? [],
          relatedPeptideIds: input.relatedPeptideIds,
          mood: input.mood,
          createdAt: new Date().toISOString(),
        };

        set({
          entries: [entry, ...entries],
          weeklyEntryCount: effectiveCount + 1,
          weekStartDate: currentWeekStart,
        });

        syncRecord('journal_entries', {
          id: entry.id,
          date: entry.date,
          title: entry.title,
          content: entry.content,
          tags: entry.tags,
        });

        return entry;
      },

      updateEntry: (id, updates) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...(updates.title !== undefined && { title: updates.title.trim() }),
                  ...(updates.content !== undefined && { content: updates.content.trim() }),
                  ...(updates.category !== undefined && { category: updates.category }),
                  ...(updates.tags !== undefined && { tags: updates.tags }),
                  ...(updates.relatedPeptideIds !== undefined && { relatedPeptideIds: updates.relatedPeptideIds }),
                  ...(updates.mood !== undefined && { mood: updates.mood }),
                }
              : e
          ),
        }));
      },

      deleteEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }));
        deleteRecord('journal_entries', id);
      },

      getEntriesByDate: (date) => {
        return get().entries.filter((e) => e.date === date);
      },

      getEntriesByCategory: (category) => {
        return get().entries.filter((e) => e.category === category);
      },

      getEntriesInRange: (start, end) => {
        return get().entries.filter((e) => e.date >= start && e.date <= end);
      },

      searchEntries: (query) => {
        const lower = query.toLowerCase();
        return get().entries.filter(
          (e) =>
            e.title.toLowerCase().includes(lower) ||
            e.content.toLowerCase().includes(lower) ||
            e.tags.some((t) => t.toLowerCase().includes(lower))
        );
      },

      clearAll: () => set({ entries: [], weeklyEntryCount: 0, weekStartDate: '' }),

      incrementEntryCount: () => {
        const currentWeekStart = getWeekStart();
        const { weekStartDate, weeklyEntryCount } = get();
        if (weekStartDate !== currentWeekStart) {
          // New week — reset counter
          set({ weeklyEntryCount: 1, weekStartDate: currentWeekStart });
        } else {
          set({ weeklyEntryCount: weeklyEntryCount + 1 });
        }
      },

      canCreateEntry: () => {
        const tier = useSubscriptionStore.getState().tier;
        if (tier !== 'free') return true;

        const currentWeekStart = getWeekStart();
        const { weekStartDate, weeklyEntryCount } = get();
        if (weekStartDate !== currentWeekStart) return true; // new week, count resets
        return weeklyEntryCount < FREE_WEEKLY_ENTRY_LIMIT;
      },
    }),
    {
      name: 'peptalk-journal',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        entries: state.entries,
        weeklyEntryCount: state.weeklyEntryCount,
        weekStartDate: state.weekStartDate,
      }),
    },
  ),
);
