import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PeptideStack, StackAnalysis } from '../types';
import { analyzeStack } from '../services/analysisEngine';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';
import { CURATED_STACKS } from '../data/curatedStacks';

const MAX_STACK_SIZE = 5;

const mergeCuratedStacks = (savedStacks: PeptideStack[]) => {
  const userStacks = savedStacks.filter((stack) => !stack.isCurated);
  return [...CURATED_STACKS, ...userStacks];
};

interface StackStore {
  // ── State ──────────────────────────────────────────────────────────────
  currentStack: string[];
  savedStacks: PeptideStack[];
  currentAnalysis: StackAnalysis | null;
  isAnalyzing: boolean;

  // ── Actions ────────────────────────────────────────────────────────────
  addToStack: (peptideId: string) => void;
  removeFromStack: (peptideId: string) => void;
  clearStack: () => void;
  /** Wipe all saved stacks + current + analysis. Called on logout. */
  clearAll: () => void;
  /** Whether the current user can save another stack given their tier. */
  canSaveAnotherStack: () => boolean;
  analyzeCurrentStack: () => Promise<void>;
  /** Returns the saved stack ID on success, or null if the free-tier limit blocks the save. */
  saveStack: (name: string) => string | null;
  deleteStack: (stackId: string) => void;
  loadStack: (stack: PeptideStack) => void;
  /** Hydrate user-saved stacks from Supabase on boot / device switch. Curated stacks unaffected. */
  syncFromServer: () => Promise<void>;
}

export const useStackStore = create<StackStore>()(
  persist(
    (set, get) => ({
      // ── Initial State ────────────────────────────────────────────────────
      currentStack: [],
      savedStacks: CURATED_STACKS,
      currentAnalysis: null,
      isAnalyzing: false,

      // ── Actions ──────────────────────────────────────────────────────────

      addToStack: (peptideId: string) => {
        const { currentStack } = get();

        // Guard: already present or at capacity
        if (
          currentStack.includes(peptideId) ||
          currentStack.length >= MAX_STACK_SIZE
        ) {
          return;
        }

        set({
          currentStack: [...currentStack, peptideId],
          // Invalidate stale analysis when the stack changes
          currentAnalysis: null,
        });
      },

      removeFromStack: (peptideId: string) => {
        set((state) => ({
          currentStack: state.currentStack.filter((id) => id !== peptideId),
          // Invalidate stale analysis when the stack changes
          currentAnalysis: null,
        }));
      },

      clearStack: () => {
        set({
          currentStack: [],
          currentAnalysis: null,
        });
      },

      clearAll: () => {
        set({
          currentStack: [],
          savedStacks: [],
          currentAnalysis: null,
          isAnalyzing: false,
        });
      },

      analyzeCurrentStack: async () => {
        const { currentStack } = get();

        if (currentStack.length === 0) {
          set({ currentAnalysis: null });
          return;
        }

        set({ isAnalyzing: true });

        try {
          const analysis = await analyzeStack(currentStack);
          set({ currentAnalysis: analysis, isAnalyzing: false });
        } catch (error) {
          console.error('[useStackStore] Analysis failed:', error);
          set({ isAnalyzing: false });
        }
      },

      canSaveAnotherStack: () => {
        const { savedStacks } = get();
        const userStackCount = savedStacks.filter((s) => !s.isCurated).length;
        // Lazy require to avoid a circular dep between the two stores
        try {
          const { useSubscriptionStore } = require('./useSubscriptionStore');
          const tier = useSubscriptionStore.getState().tier;
          if (tier === 'free') return userStackCount < 1;
        } catch {
          // If the subscription store isn't available, fall open so dev/test
          // flows aren't blocked. Server is still source of truth.
        }
        return true;
      },

      saveStack: (name: string) => {
        const { currentStack, currentAnalysis, savedStacks } = get();

        if (currentStack.length === 0) {
          return null;
        }

        // Free-tier cap: 1 saved user stack. Curated stacks don't count.
        if (!get().canSaveAnotherStack()) {
          return null;
        }

        const timestamp = new Date().toISOString();
        const id = `stack-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        const newStack: PeptideStack = {
          id,
          name,
          peptideIds: [...currentStack],
          createdAt: timestamp,
          updatedAt: timestamp,
          isCurated: false,
          analysis: currentAnalysis ?? undefined,
        };

        set({ savedStacks: [...savedStacks, newStack] });

        syncRecord('saved_stacks', {
          id: newStack.id,
          name: newStack.name,
          peptides: newStack.peptideIds.map((pid) => ({ peptideId: pid })),
          notes: null,
        });
        return id;
      },

      deleteStack: (stackId: string) => {
        set((state) => ({
          savedStacks: state.savedStacks.filter(
            (stack) => stack.id !== stackId || stack.isCurated
          ),
        }));
        deleteRecord('saved_stacks', stackId);
      },

      loadStack: (stack: PeptideStack) => {
        set({
          currentStack: [...stack.peptideIds],
          currentAnalysis: stack.analysis ?? null,
        });
      },

      syncFromServer: async () => {
        type Row = {
          id: string;
          name: string | null;
          peptides: Array<{ peptideId?: string } | string> | string[] | null;
          target_goals: string[] | null;
          notes: string | null;
          is_curated: boolean | null;
          created_at: string | null;
        };
        // Only merge USER stacks — the curated list is baked into the app
        // and re-merged on rehydrate, so server-side curated rows (if any)
        // are ignored here.
        const userLocal = get().savedStacks.filter((s) => !s.isCurated);
        const merged = await hydrateFromServer<Row, PeptideStack>(
          'saved_stacks',
          userLocal,
          (r) => {
            const peptideIds = Array.isArray(r.peptides)
              ? r.peptides
                  .map((p) => (typeof p === 'string' ? p : p?.peptideId))
                  .filter((x): x is string => typeof x === 'string')
              : [];
            return {
              id: r.id,
              name: r.name ?? 'Untitled stack',
              peptideIds,
              createdAt: r.created_at ?? new Date().toISOString(),
              updatedAt: r.created_at ?? new Date().toISOString(),
              isCurated: false,
            };
          },
          { orderBy: 'created_at', ascending: false, limit: 500 },
        );
        set({ savedStacks: mergeCuratedStacks(merged) });
      },
    }),
    {
      name: 'peptalk-stacks',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        currentStack: state.currentStack,
        savedStacks: state.savedStacks.filter((stack) => !stack.isCurated),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        useStackStore.setState({
          savedStacks: mergeCuratedStacks(state.savedStacks ?? []),
          currentAnalysis: null,
          isAnalyzing: false,
        });
      },
    }
  )
);
