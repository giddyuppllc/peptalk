import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { JournalCategory, JournalEntry } from '../types';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';
import { useSubscriptionStore } from './useSubscriptionStore';
import { STORE_LIMITS, capNewestFirst } from '../utils/storeLimits';

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
  /**
   * Entry IDs whose Supabase upsert failed (offline, transient
   * network, RLS race). Mirrors useDoseLogStore / useWorkoutStore /
   * useChatStore. Flushed on boot + reconnect.
   */
  pendingSyncs: string[];
  flushPendingSyncs: () => Promise<void>;

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
  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      entries: [],
      weeklyEntryCount: 0,
      weekStartDate: '',
      pendingSyncs: [],

      flushPendingSyncs: async () => {
        const ids = get().pendingSyncs;
        if (ids.length === 0) return;
        const stillFailing: string[] = [];
        for (const id of ids) {
          const entry = get().entries.find((e) => e.id === id);
          if (!entry) continue;
          const ok = await syncRecord('journal_entries', {
            id: entry.id,
            date: entry.date,
            title: entry.title,
            category: entry.category,
            content: entry.content,
            tags: entry.tags,
            related_peptide_ids: entry.relatedPeptideIds ?? [],
            mood: entry.mood ?? null,
          });
          if (!ok) stillFailing.push(id);
        }
        set({ pendingSyncs: stillFailing });
      },

      addEntry: (input) => {
        // Atomic: determine tier, reconcile week boundary, and check the
        // cap inside the same set() so two rapid taps can't both slip past.
        //
        // 2026-05-17 race fix: previously read tier without checking the
        // subscription store's `hasHydrated` flag. On cold boot the store
        // returns 'free' as default before AsyncStorage rehydrates, so a
        // Pro user's first write after launch was silently rejected.
        // Now we skip the cap entirely until hydration completes — the
        // cost of one extra entry slipping through during the ~100ms
        // hydration window is far less than the cost of silently
        // dropping a paid user's write.
        const currentWeekStart = getWeekStart();
        let tier: 'free' | 'plus' | 'pro' = 'free';
        let hydrated = false;
        try {
          const { useSubscriptionStore } = require('./useSubscriptionStore');
          const subState = useSubscriptionStore.getState();
          hydrated = subState.hasHydrated === true;
          tier = subState.tier ?? 'free';
        } catch {
          tier = 'free';
        }

        const { weekStartDate, weeklyEntryCount, entries } = get();
        const weekReset = weekStartDate !== currentWeekStart;
        const effectiveCount = weekReset ? 0 : weeklyEntryCount;

        if (hydrated && tier === 'free' && effectiveCount >= FREE_WEEKLY_ENTRY_LIMIT) {
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
          entries: capNewestFirst([entry, ...entries], STORE_LIMITS.JOURNAL_ENTRIES),
          weeklyEntryCount: effectiveCount + 1,
          weekStartDate: currentWeekStart,
        });

        syncRecord('journal_entries', {
          id: entry.id,
          date: entry.date,
          title: entry.title,
          category: entry.category,
          content: entry.content,
          tags: entry.tags,
          related_peptide_ids: entry.relatedPeptideIds ?? [],
          mood: entry.mood ?? null,
          // Persist the true local timestamp so time-of-day survives a
          // reinstall / device switch — previously syncFromServer hardcoded
          // 00:00 because nothing wrote the real time to the row.
          created_at: entry.createdAt,
        }).then((ok) => {
          if (!ok) {
            set((state) => ({
              pendingSyncs: state.pendingSyncs.includes(entry.id)
                ? state.pendingSyncs
                : [...state.pendingSyncs, entry.id],
            }));
          }
        }).catch(() => {
          set((state) => ({
            pendingSyncs: state.pendingSyncs.includes(entry.id)
              ? state.pendingSyncs
              : [...state.pendingSyncs, entry.id],
          }));
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
        // Cloud-sync the updated row — previously this set() was local-only,
        // so edits to title/content/category/mood never propagated.
        const updated = get().entries.find((e) => e.id === id);
        if (updated) {
          syncRecord('journal_entries', {
            id: updated.id,
            date: updated.date,
            title: updated.title,
            category: updated.category,
            content: updated.content,
            tags: updated.tags,
            related_peptide_ids: updated.relatedPeptideIds ?? [],
            mood: updated.mood ?? null,
          }).then((ok) => {
            if (!ok) {
              set((state) => ({
                pendingSyncs: state.pendingSyncs.includes(updated.id)
                  ? state.pendingSyncs
                  : [...state.pendingSyncs, updated.id],
              }));
            }
          }).catch(() => {
            set((state) => ({
              pendingSyncs: state.pendingSyncs.includes(updated.id)
                ? state.pendingSyncs
                : [...state.pendingSyncs, updated.id],
            }));
          });
        }
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

      clearAll: () => set({
        entries: [],
        weeklyEntryCount: 0,
        weekStartDate: '',
        // Wipe retry queue on logout — same reason as other stores.
        pendingSyncs: [],
      }),

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

      syncFromServer: async () => {
        type Row = {
          id: string;
          date: string;
          title: string | null;
          category: string | null;
          content: string | null;
          tags: string[] | null;
          related_peptide_ids: string[] | null;
          mood: number | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, JournalEntry>(
          'journal_entries',
          get().entries,
          (r) => ({
            id: r.id,
            date: r.date,
            // Recover the real time-of-day from the synced created_at
            // timestamp (local-time HH:MM) instead of hardcoding midnight.
            time: r.created_at
              ? `${String(new Date(r.created_at).getHours()).padStart(2, '0')}:${String(new Date(r.created_at).getMinutes()).padStart(2, '0')}`
              : '00:00',
            category: (r.category as JournalCategory) ?? 'other',
            title: r.title ?? '',
            content: r.content ?? '',
            tags: r.tags ?? [],
            relatedPeptideIds: r.related_peptide_ids ?? undefined,
            mood: r.mood ? (Math.max(1, Math.min(5, r.mood)) as 1 | 2 | 3 | 4 | 5) : undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
          }),
          { orderBy: 'date', ascending: false, limit: 2000 },
        );
        set({
          entries: capNewestFirst(
            merged.sort((a, b) => (a.date < b.date ? 1 : -1)),
            STORE_LIMITS.JOURNAL_ENTRIES,
          ),
        });
      },
    }),
    {
      name: 'peptalk-journal',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        entries: state.entries,
        weeklyEntryCount: state.weeklyEntryCount,
        weekStartDate: state.weekStartDate,
        pendingSyncs: state.pendingSyncs,
      }),
    },
  ),
);
