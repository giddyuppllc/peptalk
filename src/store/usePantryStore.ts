/**
 * Pantry / fridge inventory store.
 *
 * Tracks what the user has in their kitchen so they can:
 *   - Build meals from real on-hand ingredients
 *   - Get expiry alerts before food goes bad
 *   - Feed the AI pantry-aware meal-suggestions feature
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface PantryItem {
  id: string;
  name: string;
  brand?: string;
  quantity: number;
  unit: string;           // 'each', 'oz', 'g', 'lb', 'kg', 'cup', 'tbsp', etc.
  category?: string;      // 'produce' | 'dairy' | 'grain' | 'protein' | 'frozen' | 'condiment' | 'other'
  storageLocation: StorageLocation;
  expiryDate?: string;    // YYYY-MM-DD
  purchaseDate?: string;  // YYYY-MM-DD
  openedDate?: string;    // YYYY-MM-DD
  barcode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface PantryState {
  items: PantryItem[];
}

interface PantryActions {
  addItem: (input: Omit<PantryItem, 'id' | 'createdAt' | 'updatedAt'>) => PantryItem;
  updateItem: (id: string, patch: Partial<PantryItem>) => void;
  removeItem: (id: string) => void;
  consumeQuantity: (id: string, amount: number) => void;
  getItemsByLocation: (loc: StorageLocation) => PantryItem[];
  /** Items that expire within the next N days (or are already expired). */
  getExpiringItems: (daysAhead: number) => PantryItem[];
  /** Crude search by name/brand, case-insensitive. */
  search: (query: string) => PantryItem[];
  clearAll: () => void;
}

function toSupabaseRow(item: PantryItem) {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category ?? null,
    storage_location: item.storageLocation,
    expiry_date: item.expiryDate ?? null,
    purchase_date: item.purchaseDate ?? null,
    opened_date: item.openedDate ?? null,
    barcode: item.barcode ?? null,
    notes: item.notes ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export const usePantryStore = create<PantryState & PantryActions>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (input) => {
        const now = new Date().toISOString();
        const item: PantryItem = {
          ...input,
          id: `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: now,
          updatedAt: now,
        };
        set({ items: [item, ...get().items] });
        syncRecord('pantry_items', toSupabaseRow(item)).catch(() => {});
        return item;
      },

      updateItem: (id, patch) => {
        const now = new Date().toISOString();
        const next = get().items.map((i) =>
          i.id === id ? { ...i, ...patch, updatedAt: now } : i,
        );
        set({ items: next });
        const updated = next.find((i) => i.id === id);
        if (updated) {
          syncRecord('pantry_items', toSupabaseRow(updated)).catch(() => {});
        }
      },

      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
        deleteRecord('pantry_items', id).catch(() => {});
      },

      consumeQuantity: (id, amount) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        const next = Math.max(0, item.quantity - amount);
        // Auto-delete when quantity hits zero so the list doesn't grow forever
        if (next === 0) {
          get().removeItem(id);
        } else {
          get().updateItem(id, { quantity: next });
        }
      },

      getItemsByLocation: (loc) =>
        get().items.filter((i) => i.storageLocation === loc),

      getExpiringItems: (daysAhead) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + daysAhead);
        const cutoffKey = cutoff.toISOString().slice(0, 10);
        return get().items.filter(
          (i) => i.expiryDate && i.expiryDate <= cutoffKey,
        );
      },

      search: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return get().items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.brand ?? '').toLowerCase().includes(q),
        );
      },

      clearAll: () => set({ items: [] }),
    }),
    {
      name: 'peptalk-pantry',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export default usePantryStore;
