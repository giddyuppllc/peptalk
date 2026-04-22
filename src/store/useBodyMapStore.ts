/**
 * Body Map Store — tracks injection sites and body-region interactions.
 *
 * Used to:
 *   - log where a peptide was injected (region + optional side)
 *   - show injection history per region (for rotation / avoiding overuse)
 *   - suggest which sites to use next
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';

export interface InjectionSite {
  id: string;
  region: string;           // matches BODY_REGIONS.id e.g. 'left-quad'
  side?: 'left' | 'right';
  peptideId?: string;
  peptideName?: string;
  date: string;             // YYYY-MM-DD
  time?: string;            // HH:MM
  notes?: string;
  createdAt: string;        // ISO timestamp
}

interface BodyMapState {
  injections: InjectionSite[];
}

interface BodyMapActions {
  logInjection: (input: Omit<InjectionSite, 'id' | 'createdAt'>) => InjectionSite;
  removeInjection: (id: string) => void;
  getInjectionsByRegion: (region: string) => InjectionSite[];
  getLastInjectionForRegion: (region: string) => InjectionSite | undefined;
  getRecentInjections: (days: number) => InjectionSite[];
  clearAll: () => void;
  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
}

export const useBodyMapStore = create<BodyMapState & BodyMapActions>()(
  persist(
    (set, get) => ({
      injections: [],

      logInjection: (input) => {
        const injection: InjectionSite = {
          ...input,
          id: `inj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        };
        set({ injections: [injection, ...get().injections] });

        // Cloud sync fire-and-forget
        syncRecord('injection_sites', {
          id: injection.id,
          region: injection.region,
          side: injection.side ?? null,
          peptide_id: injection.peptideId ?? null,
          peptide_name: injection.peptideName ?? null,
          date: injection.date,
          time: injection.time ?? null,
          notes: injection.notes ?? null,
          created_at: injection.createdAt,
        }).catch(() => {});

        return injection;
      },

      removeInjection: (id) => {
        set({ injections: get().injections.filter((i) => i.id !== id) });
        deleteRecord('injection_sites', id).catch(() => {});
      },

      getInjectionsByRegion: (region) =>
        get().injections.filter((i) => i.region === region),

      getLastInjectionForRegion: (region) =>
        get().injections.find((i) => i.region === region),

      getRecentInjections: (days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffKey = cutoff.toISOString().slice(0, 10);
        return get().injections.filter((i) => i.date >= cutoffKey);
      },

      clearAll: () => set({ injections: [] }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          region: string;
          side: 'left' | 'right' | null;
          peptide_id: string | null;
          peptide_name: string | null;
          date: string;
          time: string | null;
          notes: string | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, InjectionSite>(
          'injection_sites',
          get().injections,
          (r) => ({
            id: r.id,
            region: r.region,
            side: r.side ?? undefined,
            peptideId: r.peptide_id ?? undefined,
            peptideName: r.peptide_name ?? undefined,
            date: r.date,
            time: r.time ?? undefined,
            notes: r.notes ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
          }),
          { orderBy: 'date', ascending: false, limit: 1000 },
        );
        set({ injections: merged.sort((a, b) => (a.date < b.date ? 1 : -1)) });
      },
    }),
    {
      name: 'peptalk-bodymap',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ injections: state.injections }),
    },
  ),
);

export default useBodyMapStore;
