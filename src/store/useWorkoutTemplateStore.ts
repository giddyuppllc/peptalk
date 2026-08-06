/**
 * Workout Template Store — user-created custom workout templates.
 *
 * Users build templates (pick exercises, set target reps/sets/weight),
 * save them, and run them in the workout player.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

export interface TemplateExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  targetWeightLbs?: number;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: string;
  lastUsedAt?: string;
  timesUsed: number;
}

interface WorkoutTemplateState {
  templates: WorkoutTemplate[];
  /**
   * True once the persisted templates have been read back from storage.
   *
   * `secureStorage` is asynchronous, so on a cold start `templates` is `[]` for
   * the first frames. Without this flag a consumer cannot tell "not loaded yet"
   * from "no such template", and the player rendered "No workout to play" for a
   * workout that was saved perfectly well.
   */
  hasHydrated: boolean;
}

interface WorkoutTemplateActions {
  addTemplate: (name: string, exercises: TemplateExercise[]) => WorkoutTemplate;
  updateTemplate: (id: string, updates: Partial<Pick<WorkoutTemplate, 'name' | 'exercises'>>) => void;
  deleteTemplate: (id: string) => void;
  markUsed: (id: string) => void;
  getTemplateById: (id: string) => WorkoutTemplate | undefined;
}

export const useWorkoutTemplateStore = create<WorkoutTemplateState & WorkoutTemplateActions>()(
  persist(
    (set, get) => ({
      templates: [],
      hasHydrated: false,

      addTemplate: (name, exercises) => {
        const template: WorkoutTemplate = {
          id: `tmpl-${Date.now()}`,
          name,
          exercises,
          createdAt: new Date().toISOString(),
          timesUsed: 0,
        };
        set({ templates: [template, ...get().templates] });
        return template;
      },

      updateTemplate: (id, updates) => {
        set({
          templates: get().templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        });
      },

      deleteTemplate: (id) => {
        set({ templates: get().templates.filter((t) => t.id !== id) });
      },

      markUsed: (id) => {
        set({
          templates: get().templates.map((t) =>
            t.id === id
              ? { ...t, lastUsedAt: new Date().toISOString(), timesUsed: t.timesUsed + 1 }
              : t
          ),
        });
      },

      getTemplateById: (id) => get().templates.find((t) => t.id === id),
    }),
    {
      name: 'peptalk-workout-templates',
      storage: createJSONStorage(() => secureStorage),
      // hasHydrated is derived at runtime, never persisted.
      partialize: (state) => ({ templates: state.templates }),
      onRehydrateStorage: () => (state, error) => {
        // Flip the flag even when rehydration FAILS. Leaving it false on error
        // would strand every consumer in a permanent loading state, which is
        // worse than showing an honest empty list.
        if (error) console.warn('[workout-templates] rehydrate failed', error);
        useWorkoutTemplateStore.setState({ hasHydrated: true });
      },
    }
  )
);
