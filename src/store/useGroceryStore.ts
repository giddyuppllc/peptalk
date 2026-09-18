/**
 * Grocery list store — persisted via secure storage.
 */

import { create } from 'zustand';
import { makeSafeMerge } from '../lib/persistSafety';
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
      merge: makeSafeMerge('peptalk-grocery', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export default useGroceryStore;
