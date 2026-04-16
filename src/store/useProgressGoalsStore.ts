/**
 * Progress Goals Store — user-configurable daily goals organized by category.
 * Each goal belongs to a category (nutrition/fitness/health) for the swipeable dashboard.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalCategory = 'macros' | 'vitamins' | 'fitness' | 'health';

export interface ProgressGoal {
  key: string;
  label: string;
  color: string;
  unit: string;
  category: GoalCategory;
  /** Whether this goal is enabled on the chart */
  enabled: boolean;
  /** User-set daily target */
  goal: number;
  /** Default goal value (used for reset) */
  defaultGoal: number;
  /** If true, goal is to stay UNDER the target (sodium, sugar, etc.) */
  inverse?: boolean;
}

interface ProgressGoalsState {
  goals: ProgressGoal[];
}

interface ProgressGoalsActions {
  toggleGoal: (key: string) => void;
  setGoalValue: (key: string, value: number) => void;
  resetGoals: () => void;
  getGoalsByCategory: (category: GoalCategory) => ProgressGoal[];
}

// ---------------------------------------------------------------------------
// Default goals — organized by category
// ---------------------------------------------------------------------------

const DEFAULT_GOALS: ProgressGoal[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MACROS & CALORIES
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'cal',      label: 'Calories',        color: '#67E8F9', unit: 'cal',   category: 'macros', enabled: true,  goal: 2000,  defaultGoal: 2000 },
  { key: 'pro',      label: 'Protein',         color: '#06B6D4', unit: 'g',     category: 'macros', enabled: true,  goal: 150,   defaultGoal: 150 },
  { key: 'carb',     label: 'Carbs',           color: '#3B82F6', unit: 'g',     category: 'macros', enabled: true,  goal: 200,   defaultGoal: 200 },
  { key: 'fat',      label: 'Fat',             color: '#a855f7', unit: 'g',     category: 'macros', enabled: true,  goal: 67,    defaultGoal: 67 },
  { key: 'fiber',    label: 'Fiber',           color: '#b9cbb6', unit: 'g',     category: 'macros', enabled: true,  goal: 30,    defaultGoal: 30 },
  { key: 'water',    label: 'Water',           color: '#38bdf8', unit: 'oz',    category: 'macros', enabled: true,  goal: 100,   defaultGoal: 100 },

  // ═══════════════════════════════════════════════════════════════════════════
  // VITAMINS & MINERALS
  // ═══════════════════════════════════════════════════════════════════════════
  // Limit nutrients (stay under)
  { key: 'sodium',   label: 'Sodium',          color: '#f97316', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 2300,  defaultGoal: 2300, inverse: true },
  { key: 'sugar',    label: 'Sugar',           color: '#ec4899', unit: 'g',     category: 'vitamins', enabled: true,  goal: 50,    defaultGoal: 50,   inverse: true },
  { key: 'chol',     label: 'Cholesterol',     color: '#ef4444', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 300,   defaultGoal: 300,  inverse: true },
  { key: 'satfat',   label: 'Saturated Fat',   color: '#7c3aed', unit: 'g',     category: 'vitamins', enabled: true,  goal: 20,    defaultGoal: 20,   inverse: true },
  // Minerals (FDA Daily Values)
  { key: 'potassium',label: 'Potassium',       color: '#22c55e', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 4700,  defaultGoal: 4700 },
  { key: 'calcium',  label: 'Calcium',         color: '#e2e8f0', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 1300,  defaultGoal: 1300 },
  { key: 'iron',     label: 'Iron',            color: '#92400e', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 18,    defaultGoal: 18 },
  { key: 'magnesium',label: 'Magnesium',       color: '#2dd4bf', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 420,   defaultGoal: 420 },
  { key: 'zinc',     label: 'Zinc',            color: '#64748b', unit: 'mg',    category: 'vitamins', enabled: false, goal: 11,    defaultGoal: 11 },
  { key: 'phosphorus',label: 'Phosphorus',     color: '#a3e635', unit: 'mg',    category: 'vitamins', enabled: false, goal: 1250,  defaultGoal: 1250 },
  { key: 'selenium', label: 'Selenium',        color: '#fbbf24', unit: 'mcg',   category: 'vitamins', enabled: false, goal: 55,    defaultGoal: 55 },
  { key: 'copper',   label: 'Copper',          color: '#d97706', unit: 'mg',    category: 'vitamins', enabled: false, goal: 0.9,   defaultGoal: 0.9 },
  { key: 'manganese',label: 'Manganese',       color: '#78716c', unit: 'mg',    category: 'vitamins', enabled: false, goal: 2.3,   defaultGoal: 2.3 },
  // Vitamins (FDA Daily Values)
  { key: 'vita',     label: 'Vitamin A',       color: '#eab308', unit: 'mcg',   category: 'vitamins', enabled: true,  goal: 900,   defaultGoal: 900 },
  { key: 'vitc',     label: 'Vitamin C',       color: '#fb923c', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 90,    defaultGoal: 90 },
  { key: 'vitd',     label: 'Vitamin D',       color: '#fcd34d', unit: 'mcg',   category: 'vitamins', enabled: true,  goal: 20,    defaultGoal: 20 },
  { key: 'vite',     label: 'Vitamin E',       color: '#86efac', unit: 'mg',    category: 'vitamins', enabled: false, goal: 15,    defaultGoal: 15 },
  { key: 'vitk',     label: 'Vitamin K',       color: '#4ade80', unit: 'mcg',   category: 'vitamins', enabled: false, goal: 120,   defaultGoal: 120 },
  { key: 'vitb1',    label: 'B1 Thiamin',      color: '#fda4af', unit: 'mg',    category: 'vitamins', enabled: false, goal: 1.2,   defaultGoal: 1.2 },
  { key: 'vitb2',    label: 'B2 Riboflavin',   color: '#f9a8d4', unit: 'mg',    category: 'vitamins', enabled: false, goal: 1.3,   defaultGoal: 1.3 },
  { key: 'vitb3',    label: 'B3 Niacin',       color: '#c4b5fd', unit: 'mg',    category: 'vitamins', enabled: false, goal: 16,    defaultGoal: 16 },
  { key: 'vitb5',    label: 'B5 Pantothenic',  color: '#d8b4fe', unit: 'mg',    category: 'vitamins', enabled: false, goal: 5,     defaultGoal: 5 },
  { key: 'vitb6',    label: 'Vitamin B6',      color: '#a78bfa', unit: 'mg',    category: 'vitamins', enabled: true,  goal: 1.7,   defaultGoal: 1.7 },
  { key: 'vitb12',   label: 'Vitamin B12',     color: '#818cf8', unit: 'mcg',   category: 'vitamins', enabled: true,  goal: 2.4,   defaultGoal: 2.4 },
  { key: 'folate',   label: 'Folate',          color: '#34d399', unit: 'mcg',   category: 'vitamins', enabled: false, goal: 400,   defaultGoal: 400 },
  { key: 'choline',  label: 'Choline',         color: '#5eead4', unit: 'mg',    category: 'vitamins', enabled: false, goal: 550,   defaultGoal: 550 },
  // Omega fatty acids
  { key: 'omega3',   label: 'Omega-3',         color: '#38bdf8', unit: 'g',     category: 'vitamins', enabled: true,  goal: 1.6,   defaultGoal: 1.6 },
  { key: 'omega6',   label: 'Omega-6',         color: '#7dd3fc', unit: 'g',     category: 'vitamins', enabled: false, goal: 17,    defaultGoal: 17 },

  // ═══════════════════════════════════════════════════════════════════════════
  // FITNESS & ACTIVITY
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'workout',  label: 'Workout',         color: '#f59e0b', unit: 'done',  category: 'fitness',  enabled: true,  goal: 1,     defaultGoal: 1 },
  { key: 'steps',    label: 'Steps',           color: '#22c55e', unit: 'steps', category: 'fitness',  enabled: true,  goal: 10000, defaultGoal: 10000 },
  { key: 'active',   label: 'Active Cal',      color: '#f97316', unit: 'cal',   category: 'fitness',  enabled: true,  goal: 500,   defaultGoal: 500 },
  { key: 'sleep',    label: 'Sleep',           color: '#6366f1', unit: 'hrs',   category: 'fitness',  enabled: true,  goal: 8,     defaultGoal: 8 },
  { key: 'sleepq',   label: 'Sleep Quality',   color: '#a78bfa', unit: '/5',    category: 'fitness',  enabled: false, goal: 4,     defaultGoal: 4 },
  { key: 'recovery', label: 'Recovery',        color: '#34d399', unit: '/5',    category: 'fitness',  enabled: false, goal: 4,     defaultGoal: 4 },
  { key: 'duration', label: 'Workout Min',     color: '#d97706', unit: 'min',   category: 'fitness',  enabled: false, goal: 45,    defaultGoal: 45 },

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & WELLNESS
  // ═══════════════════════════════════════════════════════════════════════════
  { key: 'checkin',  label: 'Check-In',        color: '#eab308', unit: 'done',  category: 'health',   enabled: true,  goal: 1,     defaultGoal: 1 },
  { key: 'doses',    label: 'Doses',           color: '#e3a7a1', unit: 'doses', category: 'health',   enabled: true,  goal: 1,     defaultGoal: 1 },
  { key: 'mood',     label: 'Mood',            color: '#fbbf24', unit: '/5',    category: 'health',   enabled: true,  goal: 4,     defaultGoal: 4 },
  { key: 'energy',   label: 'Energy',          color: '#67E8F9', unit: '/5',    category: 'health',   enabled: true,  goal: 4,     defaultGoal: 4 },
  { key: 'stress',   label: 'Stress',          color: '#f87171', unit: '/5',    category: 'health',   enabled: false, goal: 3,     defaultGoal: 3, inverse: true },
  { key: 'weight',   label: 'Weight',          color: '#94a3b8', unit: 'lbs',   category: 'health',   enabled: false, goal: 180,   defaultGoal: 180 },
  { key: 'rhr',      label: 'Resting HR',      color: '#ef4444', unit: 'bpm',   category: 'health',   enabled: false, goal: 65,    defaultGoal: 65 },
  { key: 'hrv',      label: 'HRV',             color: '#0d9488', unit: 'ms',    category: 'health',   enabled: false, goal: 50,    defaultGoal: 50 },
  { key: 'vo2',      label: 'VO2 Max',         color: '#2563eb', unit: 'ml/kg', category: 'health',   enabled: false, goal: 40,    defaultGoal: 40 },
  { key: 'spo2',     label: 'SpO2',            color: '#4ade80', unit: '%',     category: 'health',   enabled: false, goal: 97,    defaultGoal: 97 },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProgressGoalsStore = create<ProgressGoalsState & ProgressGoalsActions>()(
  persist(
    (set, get) => ({
      goals: DEFAULT_GOALS,

      toggleGoal: (key) =>
        set({
          goals: get().goals.map((g) =>
            g.key === key ? { ...g, enabled: !g.enabled } : g,
          ),
        }),

      setGoalValue: (key, value) =>
        set({
          goals: get().goals.map((g) =>
            g.key === key ? { ...g, goal: value } : g,
          ),
        }),

      resetGoals: () => set({ goals: DEFAULT_GOALS }),

      getGoalsByCategory: (category) =>
        get().goals.filter((g) => g.category === category),
    }),
    {
      name: 'peptalk-progress-goals',
      version: 3,
      storage: createJSONStorage(() => secureStorage),
      migrate: (_persisted: any, version: number) => {
        // If old version (no categories or wrong categories), reset to defaults
        if (version < 3) {
          return { goals: DEFAULT_GOALS };
        }
        return _persisted as any;
      },
    },
  ),
);

export default useProgressGoalsStore;
