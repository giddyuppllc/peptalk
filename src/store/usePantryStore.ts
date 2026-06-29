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
import { syncRecord, deleteRecord, hydrateFromServer } from '../services/syncService';

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
  /**
   * Optional per-unit nutrition snapshot. Filled when the item is added
   * via aimee-pantry-scan (vision) or aimee-pantry-parse (text) — both
   * already have the model context to estimate it cheaply. Lets the
   * custom-meal-from-pantry flow compute meal macros without a second
   * food-search round-trip. `serving` describes what 1 unit means
   * (e.g. "1 egg", "100 g", "1 cup") so we scale correctly when the
   * user picks a partial quantity. Missing snapshots fall back to a
   * searchAllFoods lookup at meal-build time.
   */
  nutrition?: {
    perServing: {
      calories: number;
      proteinGrams: number;
      carbsGrams: number;
      fatGrams: number;
      fiberGrams?: number;
    };
    /** Plain-English label for one serving, e.g. "1 egg", "100 g". */
    servingLabel?: string;
  };
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
  /**
   * Best-effort: for each food name, find a matching pantry item by
   * case-insensitive substring match and decrement it by 1 unit
   * (or by `qty` if a per-food qty is provided in matching units).
   * Returns the number of pantry items that were actually decremented.
   * Never throws — meal logging never blocks on a pantry hit-rate miss.
   */
  decrementForFoods: (
    foods: { name?: string | null; qty?: number | null; unit?: string | null }[],
  ) => number;
  getItemsByLocation: (loc: StorageLocation) => PantryItem[];
  /** Items that expire within the next N days (or are already expired). */
  getExpiringItems: (daysAhead: number) => PantryItem[];
  /** Crude search by name/brand, case-insensitive. */
  search: (query: string) => PantryItem[];
  clearAll: () => void;
  /** Hydrate from Supabase on boot / device switch. Server wins on id conflict. */
  syncFromServer: () => Promise<void>;
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
    // Per-item nutrition snapshot (per-serving macros + serving label) —
    // synced as a JSONB blob, mirroring check_ins.body_measurements.
    nutrition: item.nutrition ?? null,
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
        // Guard against NaN/Infinity/negative — without this a bad
        // amount poisons the row's quantity to NaN, which then breaks
        // every downstream math (display + decrement). 2026-05-17 fix.
        const a = Number(amount);
        if (!Number.isFinite(a) || a <= 0) return;
        const next = Math.max(0, (item.quantity ?? 0) - a);
        // Auto-delete when quantity hits zero so the list doesn't grow forever
        if (next === 0) {
          get().removeItem(id);
        } else {
          get().updateItem(id, { quantity: next });
        }
      },

      decrementForFoods: (foods) => {
        let hits = 0;
        const current = get().items;
        for (const f of foods ?? []) {
          const raw = (f?.name ?? '').toLowerCase().trim();
          if (!raw) continue;
          // Substring match either direction — handles "greek yogurt" vs
          // "yogurt", "chicken breast" vs "chicken", etc.
          const match = current.find(
            (p) =>
              p.name.toLowerCase().includes(raw) ||
              raw.includes(p.name.toLowerCase()),
          );
          if (!match) continue;
          const sameUnit =
            f?.unit && match.unit &&
            String(f.unit).toLowerCase() === match.unit.toLowerCase();
          const qty = typeof f?.qty === 'number' ? f.qty : null;
          const amount = sameUnit && qty && qty > 0 ? qty : 1;
          get().consumeQuantity(match.id, amount);
          hits++;
        }
        return hits;
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

      syncFromServer: async () => {
        type Row = {
          id: string;
          name: string;
          brand: string | null;
          quantity: number;
          unit: string;
          category: string | null;
          storage_location: StorageLocation;
          expiry_date: string | null;
          purchase_date: string | null;
          opened_date: string | null;
          barcode: string | null;
          notes: string | null;
          nutrition: PantryItem['nutrition'] | null;
          created_at: string | null;
          updated_at: string | null;
        };
        const merged = await hydrateFromServer<Row, PantryItem>(
          'pantry_items',
          get().items,
          (r) => ({
            id: r.id,
            name: r.name,
            brand: r.brand ?? undefined,
            quantity: r.quantity,
            unit: r.unit,
            category: r.category ?? undefined,
            storageLocation: r.storage_location,
            expiryDate: r.expiry_date ?? undefined,
            purchaseDate: r.purchase_date ?? undefined,
            openedDate: r.opened_date ?? undefined,
            barcode: r.barcode ?? undefined,
            notes: r.notes ?? undefined,
            nutrition: r.nutrition ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
            updatedAt: r.updated_at ?? new Date().toISOString(),
          }),
          { orderBy: 'created_at', ascending: false, limit: 500 },
        );
        set({ items: merged });
      },
    }),
    {
      name: 'peptalk-pantry',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export default usePantryStore;
