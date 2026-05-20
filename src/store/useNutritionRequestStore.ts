import { create } from 'zustand';
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
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ requests: state.requests }),
    }
  )
);
