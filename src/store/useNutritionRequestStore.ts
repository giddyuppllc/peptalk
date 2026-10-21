import { create } from 'zustand';
import { makeSafeMerge } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { NutritionRequest, ConsultationStatus } from '../types';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface NutritionRequestStore {
  requests: NutritionRequest[];
  addRequest: (request: Omit<NutritionRequest, 'id' | 'createdAt' | 'status'>) => void;
  updateStatus: (id: string, status: ConsultationStatus) => void;
  deleteRequest: (id: string) => void;
  getLatestRequest: () => NutritionRequest | null;
  /** Hard wipe for logout — health-consultation history holds
   *  user-submitted questions about their body and would leak to the
   *  next user on a shared device without this. P0 from Wave 76.27. */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () =>
  `nutreq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNutritionRequestStore = create<NutritionRequestStore>()(
  persist(
    (set, get) => ({
      requests: [],

      addRequest: (request) => {
        const entry: NutritionRequest = {
          ...request,
          id: uid(),
          status: 'submitted',
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          requests: [entry, ...state.requests],
        }));
      },

      updateStatus: (id, status) =>
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id ? { ...r, status } : r
          ),
        })),

      deleteRequest: (id) =>
        set((state) => ({
          requests: state.requests.filter((r) => r.id !== id),
        })),

      getLatestRequest: () => {
        const { requests } = get();
        if (requests.length === 0) return null;
        return requests[0]; // sorted newest-first by insertion order
      },

      clearAll: () => set({ requests: [] }),
    }),
    {
      name: 'peptalk-nutrition-requests',
      // Explicit so the number is visible, and deliberately still 0.
      //
      // In zustand 5.0.14 a bump with no `migrate` DISCARDS the persisted
      // state and hydrates defaults — verified against middleware.js:392-420
      // and by running it. That is the useful meaning of a bump, so nothing
      // here overrides it: a store that needs to carry old data forward
      // supplies its own migrate, and the three that do already have one.
      version: 0,
      // Storage is untrusted input: on web it is localStorage, which the
      // user can edit, and a killed app leaves partial writes. See
      // src/lib/persistSafety.ts.
      merge: makeSafeMerge('peptalk-nutrition-requests', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ requests: state.requests }),
    }
  )
);
