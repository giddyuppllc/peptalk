/**
 * Side-effect log store — Master Refactor Plan v3.1 §8.12 + §13.3.
 *
 * Tagged log with 1–5 severity, optionally linked to a dose entry so
 * Aimee can mine patterns (§9.3) — e.g., "PT-141 → headaches within 2h
 * on 4 of the last 5 doses." Local-first, syncs to Supabase via the
 * existing syncService pattern.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import {
  syncRecord,
  deleteRecord,
  hydrateFromServer,
} from '../services/syncService';

export type SideEffectSeverity = 1 | 2 | 3 | 4 | 5;

export interface SideEffectEntry {
  id: string;
  /** Free text or tag from the curated list (e.g. "Nausea", "Headache"). */
  symptom: string;
  severity: SideEffectSeverity;
  /** Dose entry this side effect is associated with, if any. */
  linkedDoseId?: string;
  /** Peptide id, useful when linkedDoseId is missing (e.g. ad-hoc log). */
  peptideId?: string;
  notes?: string;
  /** ISO8601. */
  loggedAt: string;
}

function uid(): string {
  return `se-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface SideEffectState {
  entries: SideEffectEntry[];
}

interface SideEffectActions {
  logSideEffect: (
    input: Omit<SideEffectEntry, 'id' | 'loggedAt'> &
      Partial<Pick<SideEffectEntry, 'loggedAt'>>,
  ) => SideEffectEntry;
  updateSideEffect: (id: string, patch: Partial<SideEffectEntry>) => void;
  removeSideEffect: (id: string) => void;
  getByPeptide: (peptideId: string) => SideEffectEntry[];
  getRecent: (days: number) => SideEffectEntry[];
  clearAll: () => void;
  syncFromServer: () => Promise<void>;
}

function toRow(e: SideEffectEntry) {
  return {
    id: e.id,
    symptom: e.symptom,
    severity: e.severity,
    linked_dose_id: e.linkedDoseId ?? null,
    peptide_id: e.peptideId ?? null,
    notes: e.notes ?? null,
    logged_at: e.loggedAt,
  };
}

interface ServerRow {
  id: string;
  symptom: string;
  severity: number;
  linked_dose_id: string | null;
  peptide_id: string | null;
  notes: string | null;
  logged_at: string;
}

function fromRow(row: ServerRow): SideEffectEntry {
  return {
    id: row.id,
    symptom: row.symptom,
    severity: Math.min(5, Math.max(1, row.severity)) as SideEffectSeverity,
    linkedDoseId: row.linked_dose_id ?? undefined,
    peptideId: row.peptide_id ?? undefined,
    notes: row.notes ?? undefined,
    loggedAt: row.logged_at,
  };
}

export const useSideEffectStore = create<
  SideEffectState & SideEffectActions
>()(
  persist(
    (set, get) => ({
      entries: [],

      logSideEffect: (input) => {
        const entry: SideEffectEntry = {
          ...input,
          id: uid(),
          loggedAt: input.loggedAt ?? new Date().toISOString(),
        };
        set({ entries: [entry, ...get().entries] });
        syncRecord('side_effect_entries', toRow(entry)).catch(() => {});
        return entry;
      },

      updateSideEffect: (id, patch) => {
        set({
          entries: get().entries.map((e) =>
            e.id === id ? { ...e, ...patch } : e,
          ),
        });
        const updated = get().entries.find((e) => e.id === id);
        if (updated) {
          syncRecord('side_effect_entries', toRow(updated)).catch(() => {});
        }
      },

      removeSideEffect: (id) => {
        set({ entries: get().entries.filter((e) => e.id !== id) });
        deleteRecord('side_effect_entries', id).catch(() => {});
      },

      getByPeptide: (peptideId) =>
        get().entries.filter((e) => e.peptideId === peptideId),

      getRecent: (days) => {
        const cutoff = Date.now() - days * 86400_000;
        return get().entries.filter(
          (e) => new Date(e.loggedAt).getTime() >= cutoff,
        );
      },

      clearAll: () => set({ entries: [] }),

      syncFromServer: async () => {
        const merged = await hydrateFromServer<ServerRow, SideEffectEntry>(
          'side_effect_entries',
          get().entries,
          fromRow,
          { orderBy: 'logged_at', ascending: false, limit: 500 },
        );
        set({ entries: merged });
      },
    }),
    {
      name: 'peptalk-side-effects-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);

/** §13.3 curated tag list — mirrors src/constants/emotions.ts side-effects. */
export const SIDE_EFFECT_TAGS = [
  'Nausea',
  'Headache',
  'Injection site redness',
  'Injection site pain',
  'Fatigue',
  'Dizziness',
  'Insomnia',
  'Appetite changes',
  'Mood changes',
  'Flushing',
  'Water retention',
  'Joint pain',
  'Numbness/tingling',
  'GI discomfort',
  'Skin reaction',
] as const;
