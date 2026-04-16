/**
 * Meal / nutrition store — tracks meals, macros, and daily targets.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';
import type { MealEntry, MacroTargets, FoodItem } from '../types/fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyTotals {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  // Micronutrients
  sodiumMg: number;
  sugarGrams: number;
  cholesterolMg: number;
  saturatedFatGrams: number;
  transFatGrams: number;
  potassiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitaminAMcg: number;
  vitaminCMg: number;
}

export interface RecentFood {
  /** Unique key for dedup (normalized food name + brand) */
  key: string;
  foodId: string;
  foodName: string;
  brand?: string;
  /** Last logged serving label e.g. "1 sandwich" */
  servingLabel: string;
  /** Last logged weight in grams */
  grams: number;
  /** Macros for the last logged amount */
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  /** Per-100g nutrition (needed to recalculate if user changes serving) */
  per100g: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
  };
  /** Image URL if available */
  imageUrl?: string;
  emoji?: string;
  /** When it was last logged */
  loggedAt: string; // ISO
}

/** Cached food from API searches — builds local database over time */
export interface CachedFood {
  id: string;
  name: string;
  brand?: string;
  per100g: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
    sodiumMg?: number;
    sugarGrams?: number;
    cholesterolMg?: number;
    saturatedFatGrams?: number;
  };
  servings: { label: string; grams: number; isUniversal?: boolean }[];
  defaultServingGrams: number;
  category?: string;
  emoji?: string;
  imageUrl?: string;
  /** Normalized search key for matching */
  searchKey: string;
  cachedAt: string; // ISO
}

/** Ingredient in a custom meal/recipe */
export interface CustomMealIngredient {
  foodId: string;
  foodName: string;
  brand?: string;
  /** Weight of this ingredient in the recipe */
  grams: number;
  /** Per-100g nutrition for recalculation */
  per100g: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
  };
  imageUrl?: string;
  emoji?: string;
}

/** A saved custom meal / recipe */
export interface CustomMeal {
  id: string;
  name: string;
  /** All ingredients with their weights */
  ingredients: CustomMealIngredient[];
  /** Sum of all ingredient weights */
  totalGrams: number;
  /** Total macros for the full recipe */
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedMeal {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealEntry['mealType'];
  name: string;
  description: string;
  macros: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
  completed: boolean;
}

interface MealState {
  /** User's macro targets */
  targets: MacroTargets;
  /** All meal entries */
  meals: MealEntry[];
  /** Custom foods the user has created */
  customFoods: FoodItem[];
  /** Water intake logs: { date: oz } */
  waterLog: Record<string, number>;
  /** Future-dated planned meals */
  mealPlan: PlannedMeal[];
  /** Recently logged foods for quick re-logging */
  recentFoods: RecentFood[];
  /** Local food cache — grows over time from searches */
  foodCache: CachedFood[];
  /** User-created custom meals / recipes */
  customMeals: CustomMeal[];
}

interface MealActions {
  // Targets
  setTargets: (targets: MacroTargets) => void;

  // Meals
  addMeal: (meal: MealEntry) => void;
  updateMeal: (mealId: string, updates: Partial<MealEntry>) => void;
  removeMeal: (mealId: string) => void;
  getMealsByDate: (date: string) => MealEntry[];
  getDailyTotals: (date: string) => DailyTotals;
  getDailyProgress: (date: string) => {
    totals: DailyTotals;
    targets: MacroTargets;
    caloriePercent: number;
    proteinPercent: number;
    carbsPercent: number;
    fatPercent: number;
  };

  // Custom foods
  addCustomFood: (food: FoodItem) => void;
  removeCustomFood: (foodId: string) => void;

  // Water
  logWater: (date: string, oz: number) => void;
  getWater: (date: string) => number;

  // Meal planning
  addPlannedMeal: (meal: PlannedMeal) => void;
  removePlannedMeal: (mealId: string) => void;
  completePlannedMeal: (mealId: string) => void;
  getPlannedMealsByDate: (date: string) => PlannedMeal[];

  // Recent foods
  addRecentFood: (food: RecentFood) => void;
  clearRecentFoods: () => void;

  // Food cache
  cacheFoods: (foods: CachedFood[]) => void;
  searchCachedFoods: (query: string) => CachedFood[];
  clearFoodCache: () => void;

  // Custom meals
  addCustomMeal: (meal: CustomMeal) => void;
  updateCustomMeal: (mealId: string, updates: Partial<CustomMeal>) => void;
  removeCustomMeal: (mealId: string) => void;

  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Default targets (2000 cal balanced diet)
// ---------------------------------------------------------------------------

const DEFAULT_TARGETS: MacroTargets = {
  calories: 2000,
  proteinGrams: 150,
  carbsGrams: 200,
  fatGrams: 67,
  fiberGrams: 30,
  waterOz: 100,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMealStore = create<MealState & MealActions>()(
  persist(
    (set, get) => ({
      targets: DEFAULT_TARGETS,
      meals: [],
      customFoods: [],
      waterLog: {},
      mealPlan: [],
      recentFoods: [],
      foodCache: [],
      customMeals: [],

      // -----------------------------------------------------------------------
      // Targets
      // -----------------------------------------------------------------------

      setTargets: (targets) => set({ targets }),

      // -----------------------------------------------------------------------
      // Meals
      // -----------------------------------------------------------------------

      addMeal: (meal) => {
        set({ meals: [meal, ...get().meals] });
        syncRecord('meal_entries', {
          id: meal.id, date: meal.date, meal_type: meal.mealType,
          foods: meal.foods, quick_log: meal.quickLog ?? null, notes: meal.notes ?? null,
        });
      },

      updateMeal: (mealId, updates) => {
        set({
          meals: get().meals.map((m) =>
            m.id === mealId ? { ...m, ...updates } : m,
          ),
        });
        const updated = get().meals.find((m) => m.id === mealId);
        if (updated) {
          syncRecord('meal_entries', {
            id: updated.id, date: updated.date, meal_type: updated.mealType,
            foods: updated.foods, quick_log: updated.quickLog ?? null, notes: updated.notes ?? null,
          });
        }
      },

      removeMeal: (mealId) => {
        set({ meals: get().meals.filter((m) => m.id !== mealId) });
        deleteRecord('meal_entries', mealId);
      },

      getMealsByDate: (date) => get().meals.filter((m) => m.date === date),

      getDailyTotals: (date) => {
        const dayMeals = get().meals.filter((m) => m.date === date);
        const totals: DailyTotals = {
          calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0,
          sodiumMg: 0, sugarGrams: 0, cholesterolMg: 0, saturatedFatGrams: 0, transFatGrams: 0,
          potassiumMg: 0, calciumMg: 0, ironMg: 0, vitaminAMcg: 0, vitaminCMg: 0,
        };

        for (const meal of dayMeals) {
          if (meal.quickLog) {
            totals.calories += meal.quickLog.calories;
            totals.proteinGrams += meal.quickLog.proteinGrams;
            totals.carbsGrams += meal.quickLog.carbsGrams;
            totals.fatGrams += meal.quickLog.fatGrams;
          } else {
            for (const food of meal.foods) {
              totals.calories += food.calories;
              totals.proteinGrams += food.proteinGrams;
              totals.carbsGrams += food.carbsGrams;
              totals.fatGrams += food.fatGrams;
              totals.fiberGrams += food.fiberGrams ?? 0;
              totals.sodiumMg += food.sodiumMg ?? 0;
              totals.sugarGrams += food.sugarGrams ?? 0;
              totals.cholesterolMg += food.cholesterolMg ?? 0;
              totals.saturatedFatGrams += food.saturatedFatGrams ?? 0;
              totals.transFatGrams += food.transFatGrams ?? 0;
              totals.potassiumMg += food.potassiumMg ?? 0;
              totals.calciumMg += food.calciumMg ?? 0;
              totals.ironMg += food.ironMg ?? 0;
              totals.vitaminAMcg += food.vitaminAMcg ?? 0;
              totals.vitaminCMg += food.vitaminCMg ?? 0;
            }
          }
        }

        return totals;
      },

      getDailyProgress: (date) => {
        const totals = get().getDailyTotals(date);
        const targets = get().targets;
        const pct = (val: number, target: number) =>
          target > 0 ? Math.round((val / target) * 100) : 0;

        return {
          totals,
          targets,
          caloriePercent: pct(totals.calories, targets.calories),
          proteinPercent: pct(totals.proteinGrams, targets.proteinGrams),
          carbsPercent: pct(totals.carbsGrams, targets.carbsGrams),
          fatPercent: pct(totals.fatGrams, targets.fatGrams),
        };
      },

      // -----------------------------------------------------------------------
      // Custom foods
      // -----------------------------------------------------------------------

      addCustomFood: (food) =>
        set({ customFoods: [...get().customFoods, food] }),

      removeCustomFood: (foodId) =>
        set({
          customFoods: get().customFoods.filter((f) => f.id !== foodId),
        }),

      // -----------------------------------------------------------------------
      // Water
      // -----------------------------------------------------------------------

      logWater: (date, oz) =>
        set({
          waterLog: {
            ...get().waterLog,
            [date]: (get().waterLog[date] ?? 0) + oz,
          },
        }),

      getWater: (date) => get().waterLog[date] ?? 0,

      // -----------------------------------------------------------------------
      // Meal planning
      // -----------------------------------------------------------------------

      addPlannedMeal: (meal) =>
        set({ mealPlan: [...get().mealPlan, meal] }),

      removePlannedMeal: (mealId) =>
        set({ mealPlan: get().mealPlan.filter((m) => m.id !== mealId) }),

      completePlannedMeal: (mealId) =>
        set({
          mealPlan: get().mealPlan.map((m) =>
            m.id === mealId ? { ...m, completed: true } : m,
          ),
        }),

      getPlannedMealsByDate: (date) =>
        get().mealPlan.filter((m) => m.date === date),

      // -----------------------------------------------------------------------
      // Recent foods
      // -----------------------------------------------------------------------

      addRecentFood: (food) => {
        const existing = get().recentFoods;
        // Remove any previous entry with the same key (dedup by food name)
        const filtered = existing.filter((f) => f.key !== food.key);
        // Add new entry at the front, keep max 20
        const updated = [food, ...filtered].slice(0, 20);
        set({ recentFoods: updated });
      },

      clearRecentFoods: () => set({ recentFoods: [] }),

      // -----------------------------------------------------------------------
      // Food cache
      // -----------------------------------------------------------------------

      cacheFoods: (foods) => {
        const existing = get().foodCache;
        const existingKeys = new Set(existing.map((f) => f.searchKey));
        const newFoods = foods.filter((f) => !existingKeys.has(f.searchKey));
        if (newFoods.length === 0) return;
        // Keep max 500 cached foods, drop oldest when full
        const updated = [...newFoods, ...existing].slice(0, 500);
        set({ foodCache: updated });
      },

      searchCachedFoods: (query) => {
        const q = query.toLowerCase();
        return get().foodCache.filter(
          (f) => f.searchKey.includes(q) || f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q)),
        );
      },

      clearFoodCache: () => set({ foodCache: [] }),

      // -----------------------------------------------------------------------
      // Custom meals
      // -----------------------------------------------------------------------

      addCustomMeal: (meal) =>
        set({ customMeals: [meal, ...get().customMeals] }),

      updateCustomMeal: (mealId, updates) =>
        set({
          customMeals: get().customMeals.map((m) =>
            m.id === mealId ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m,
          ),
        }),

      removeCustomMeal: (mealId) =>
        set({ customMeals: get().customMeals.filter((m) => m.id !== mealId) }),

      // -----------------------------------------------------------------------
      // Clear
      // -----------------------------------------------------------------------

      clearAll: () =>
        set({
          targets: DEFAULT_TARGETS,
          meals: [],
          customFoods: [],
          waterLog: {},
          mealPlan: [],
          recentFoods: [],
          foodCache: [],
          customMeals: [],
        }),
    }),
    {
      name: 'peptalk-meals',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        targets: state.targets,
        meals: state.meals,
        customFoods: state.customFoods,
        waterLog: state.waterLog,
        mealPlan: state.mealPlan,
        recentFoods: state.recentFoods,
        foodCache: state.foodCache,
        customMeals: state.customMeals,
      }),
    },
  ),
);

export default useMealStore;
