/**
 * Appetite log — Master Refactor Plan v3.1 §6.6.
 *
 * Quick chips on the Today timeline (Hungry / Full / Nauseous) tagged
 * with timestamp. Aimee mines this for correlations like "nausea spikes
 * the day after a dose" (§9.3).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

export type AppetiteState = 'hungry' | 'full' | 'nauseous';

export interface AppetiteEntry {
  id: string;
  state: AppetiteState;
  /** ISO8601. */
  loggedAt: string;
  notes?: string;
}

function uid() {
  return `appetite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

interface AppetiteState_ {
  entries: AppetiteEntry[];
}

interface AppetiteActions {
  logAppetite: (state: AppetiteState, notes?: string) => AppetiteEntry;
  removeAppetite: (id: string) => void;
  getByDate: (dateISO: string) => AppetiteEntry[];
  getRecent: (days: number) => AppetiteEntry[];
  clearAll: () => void;
}

export const useAppetiteLogStore = create<
  AppetiteState_ & AppetiteActions
>()(
  persist(
    (set, get) => ({
      entries: [],
      logAppetite: (state, notes) => {
        const e: AppetiteEntry = {
          id: uid(),
          state,
          loggedAt: new Date().toISOString(),
          notes,
        };
        set({ entries: [e, ...get().entries] });
        return e;
      },
      removeAppetite: (id) =>
        set({ entries: get().entries.filter((e) => e.id !== id) }),
      getByDate: (dateISO) =>
        get().entries.filter((e) => e.loggedAt.slice(0, 10) === dateISO),
      getRecent: (days) => {
        const cutoff = Date.now() - days * 86400_000;
        return get().entries.filter(
          (e) => new Date(e.loggedAt).getTime() >= cutoff,
        );
      },
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'peptalk-appetite-log-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);

export const APPETITE_OPTIONS: {
  state: AppetiteState;
  emoji: string;
  label: string;
  tint: string;
}[] = [
  { state: 'hungry', emoji: '🟢', label: 'Hungry', tint: '#6FA891' },
  { state: 'full', emoji: '🟡', label: 'Full', tint: '#D9B65A' },
  { state: 'nauseous', emoji: '🔴', label: 'Nauseous', tint: '#D43A3A' },
];
