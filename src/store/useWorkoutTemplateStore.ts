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
      partialize: (state) => ({ templates: state.templates }),
    }
  )
);
