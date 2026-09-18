/**
 * Grocery list store — persisted via secure storage.
 */

import { create } from 'zustand';
import { makeSafeMerge, passthroughMigrate } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import type { GroceryItem, GroceryCategory } from '../types/fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroceryState {
  items: GroceryItem[];
}

interface GroceryActions {
  addItem: (name: string, category: GroceryCategory, addedFrom?: string) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGroceryStore = create<GroceryState & GroceryActions>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (name, category, addedFrom) =>
        set({
          items: [
            ...get().items,
            {
              id: `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name,
              category,
              checked: false,
              addedFrom,
            },
          ],
        }),

      removeItem: (id) =>
        set({ items: get().items.filter((i) => i.id !== id) }),

      toggleItem: (id) =>
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, checked: !i.checked } : i,
          ),
        }),

      clearChecked: () =>
        set({ items: get().items.filter((i) => !i.checked) }),

      clearAll: () => set({ items: [] }),
    }),
    {
      name: 'peptalk-grocery',
      // Explicit, and deliberately still 0: bumping it would send every
      // existing install through migrate for no gain. The point of
      // declaring it is that `migrate` below now exists, so a future bump
      // cannot leave this store unhydrated forever (zustand 5 destructures
      // the migration result, and a missing migrate makes that undefined).
      version: 0,
      migrate: passthroughMigrate,
      // Storage is untrusted input: on web it is localStorage, which the
      // user can edit, and a killed app leaves partial writes. See
      // src/lib/persistSafety.ts.
      merge: makeSafeMerge('peptalk-grocery', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export default useGroceryStore;
