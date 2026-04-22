/**
 * Allergen store — structured food / drug / environmental allergies +
 * severity. Used by:
 *   - Expanded intake (onboarding + settings)
 *   - Recipe generator (filter allergens from AI meal suggestions)
 *   - Aimee system prompt (pass severe allergens + anaphylaxis history)
 *   - Peptide detail page (cross-check against drug-class allergies)
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';
import type { AllergenEntry, AllergySeverity } from '../types/cycle';

function uid(): string {
  return `allergen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface AllergyState {
  allergens: AllergenEntry[];
}

interface AllergyActions {
  addAllergen: (input: Omit<AllergenEntry, 'id' | 'createdAt'>) => AllergenEntry;
  updateAllergen: (id: string, patch: Partial<AllergenEntry>) => void;
  removeAllergen: (id: string) => void;
  hasAnaphylaxis: () => boolean;
  /** Returns all severe / anaphylaxis allergens for high-stakes prompts. */
  getCriticalAllergens: () => AllergenEntry[];
  clearAll: () => void;
  /**
   * Hydrate from Supabase on boot / device switch. Allergies are
   * safety-critical (Aimee filters recipes against them, the peptide
   * detail page flags drug-class conflicts) so losing them on reinstall
   * isn't just an annoyance — it could let a severe allergen slip into
   * a suggestion. Server wins on id conflict.
   */
  syncFromServer: () => Promise<void>;
}

export const useAllergyStore = create<AllergyState & AllergyActions>()(
  persist(
    (set, get) => ({
      allergens: [],

      addAllergen: (input) => {
        const entry: AllergenEntry = {
          ...input,
          id: uid(),
          createdAt: new Date().toISOString(),
        };
        set({ allergens: [entry, ...get().allergens] });
        syncRecord('allergen_entries', {
          id: entry.id,
          category: entry.category,
          label: entry.label,
          severity: entry.severity,
          notes: entry.notes ?? null,
          reaction_history: entry.reactionHistory ?? null,
          diagnosed_by: entry.diagnosedBy ?? null,
        }).catch(() => {});
        return entry;
      },

      updateAllergen: (id, patch) => {
        set({
          allergens: get().allergens.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        });
        const updated = get().allergens.find((a) => a.id === id);
        if (updated) {
          syncRecord('allergen_entries', {
            id: updated.id,
            category: updated.category,
            label: updated.label,
            severity: updated.severity,
            notes: updated.notes ?? null,
            reaction_history: updated.reactionHistory ?? null,
            diagnosed_by: updated.diagnosedBy ?? null,
          }).catch(() => {});
        }
      },

      removeAllergen: (id) => {
        set({ allergens: get().allergens.filter((a) => a.id !== id) });
        deleteRecord('allergen_entries', id).catch(() => {});
      },

      hasAnaphylaxis: () =>
        get().allergens.some((a) => a.severity === 'anaphylaxis'),

      getCriticalAllergens: () =>
        get().allergens.filter(
          (a) => a.severity === 'severe' || a.severity === 'anaphylaxis',
        ),

      clearAll: () => set({ allergens: [] }),

      syncFromServer: async () => {
        type Row = {
          id: string;
          category: string;
          label: string;
          severity: string;
          notes: string | null;
          reaction_history: string | null;
          diagnosed_by: string | null;
          created_at: string | null;
        };
        const merged = await hydrateFromServer<Row, AllergenEntry>(
          'allergen_entries',
          get().allergens,
          (r) => ({
            id: r.id,
            category: r.category as AllergenEntry['category'],
            label: r.label,
            severity: r.severity as AllergySeverity,
            notes: r.notes ?? undefined,
            reactionHistory: r.reaction_history ?? undefined,
            diagnosedBy: (r.diagnosed_by as AllergenEntry['diagnosedBy']) ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
          }),
          { orderBy: 'created_at', ascending: false, limit: 200 },
        );
        set({ allergens: merged });
      },
    }),
    {
      name: 'peptalk-allergy',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ allergens: state.allergens }),
    },
  ),
);

export default useAllergyStore;
