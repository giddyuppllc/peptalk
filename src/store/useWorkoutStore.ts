/**
 * Workout store — tracks active programs, workout logs, and exercise progress.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import { syncRecord, deleteRecord } from '../services/syncService';
import type { WorkoutLog, WorkoutLogSet } from '../types/fitness';
import type { GeneratedWorkout } from '../services/workoutGenerator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveProgram {
  programId: string;
  startedAt: string; // ISO
  currentWeek: number;
  currentDay: number;
  completedDays: string[]; // day IDs
}

/** A user-generated workout saved for later — wraps a GeneratedWorkout with metadata */
export interface SavedGeneratedWorkout {
  id: string;
  name: string;
  goal: string;
  daysPerWeek: number;
  location: string;
  level: string;
  createdAt: string;
  workout: GeneratedWorkout;
}

interface WorkoutState {
  /** Currently enrolled program */
  activeProgram: ActiveProgram | null;
  /** All workout logs */
  logs: WorkoutLog[];
  /** Is the user in a live workout? */
  inProgress: WorkoutLog | null;
  /** User-generated custom workouts (from the generator sheet) */
  savedGeneratedWorkouts: SavedGeneratedWorkout[];
}

interface ExerciseHistory {
  exerciseId: string;
  bestWeight: number;
  bestReps: number;
  totalSets: number;
  lastPerformed: string; // ISO date
}

interface WeeklyVolume {
  weekStart: string; // YYYY-MM-DD (Monday)
  totalSets: number;
  totalReps: number;
  totalWeightLbs: number;
  workoutCount: number;
}

interface WorkoutActions {
  // Program enrollment
  startProgram: (programId: string) => void;
  advanceDay: () => void;
  quitProgram: () => void;

  // Live workout
  beginWorkout: (programId?: string, weekNum?: number, dayId?: string) => void;
  logSet: (set: WorkoutLogSet) => void;
  finishWorkout: (rating?: 1 | 2 | 3 | 4 | 5, notes?: string, youtubeUrl?: string, workoutName?: string) => void;
  cancelWorkout: () => void;

  // Generated workouts (custom from the generator sheet)
  saveGeneratedWorkout: (meta: Omit<SavedGeneratedWorkout, 'id' | 'createdAt'>) => string;
  deleteGeneratedWorkout: (id: string) => void;
  getGeneratedWorkoutById: (id: string) => SavedGeneratedWorkout | null;

  // History & analytics
  getLogsByDate: (date: string) => WorkoutLog[];
  getLogsByProgram: (programId: string) => WorkoutLog[];
  getStreak: () => number;
  getExerciseHistory: (exerciseId: string) => ExerciseHistory | null;
  getWeeklyVolume: (weeksBack?: number) => WeeklyVolume[];
  getTotalVolume: () => { sets: number; reps: number; weightLbs: number };
  getRecentExercises: (limit?: number) => string[];
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkoutStore = create<WorkoutState & WorkoutActions>()(
  persist(
    (set, get) => ({
      activeProgram: null,
      logs: [],
      inProgress: null,
      savedGeneratedWorkouts: [],

      // -----------------------------------------------------------------------
      // Generated workouts
      // -----------------------------------------------------------------------

      saveGeneratedWorkout: (meta) => {
        const id = `gwk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const saved: SavedGeneratedWorkout = {
          ...meta,
          id,
          createdAt: new Date().toISOString(),
        };
        set({
          savedGeneratedWorkouts: [saved, ...get().savedGeneratedWorkouts],
        });
        return id;
      },

      deleteGeneratedWorkout: (id) => {
        set({
          savedGeneratedWorkouts: get().savedGeneratedWorkouts.filter((w) => w.id !== id),
        });
      },

      getGeneratedWorkoutById: (id) => {
        return get().savedGeneratedWorkouts.find((w) => w.id === id) ?? null;
      },

      // -----------------------------------------------------------------------
      // Program enrollment
      // -----------------------------------------------------------------------

      startProgram: (programId) => {
        set({
          activeProgram: {
            programId,
            startedAt: new Date().toISOString(),
            currentWeek: 1,
            currentDay: 0,
            completedDays: [],
          },
        });
      },

      advanceDay: () => {
        const ap = get().activeProgram;
        if (!ap) return;
        const nextDay = ap.currentDay + 1;
        if (nextDay >= 5) {
          // Move to next week
          set({
            activeProgram: {
              ...ap,
              currentWeek: ap.currentWeek + 1,
              currentDay: 0,
            },
          });
        } else {
          set({ activeProgram: { ...ap, currentDay: nextDay } });
        }
      },

      quitProgram: () => set({ activeProgram: null }),

      // -----------------------------------------------------------------------
      // Live workout
      // -----------------------------------------------------------------------

      beginWorkout: (programId, weekNum, dayId) => {
        const now = new Date().toISOString();
        set({
          inProgress: {
            id: `wlog-${Date.now()}`,
            date: now.slice(0, 10),
            programId,
            weekNumber: weekNum,
            dayId,
            sets: [],
            durationMinutes: 0,
            startedAt: now,
          },
        });
      },

      logSet: (logSet) => {
        const wp = get().inProgress;
        if (!wp) return;
        set({ inProgress: { ...wp, sets: [...wp.sets, logSet] } });
      },

      finishWorkout: (rating, notes, youtubeUrl, workoutName) => {
        const wp = get().inProgress;
        if (!wp) return;
        const now = new Date();
        const started = new Date(wp.startedAt);
        const durationMinutes = Math.round(
          (now.getTime() - started.getTime()) / 60000,
        );
        const completed: WorkoutLog = {
          ...wp,
          durationMinutes,
          rating,
          notes,
          ...(youtubeUrl ? { youtubeUrl } : {}),
          ...(workoutName ? { workoutName } : {}),
          completedAt: now.toISOString(),
        };

        const ap = get().activeProgram;
        let updatedProgram = ap;
        if (ap && wp.dayId) {
          updatedProgram = {
            ...ap,
            completedDays: [...ap.completedDays, wp.dayId],
          };
        }

        set({
          logs: [completed, ...get().logs],
          inProgress: null,
          activeProgram: updatedProgram,
        });

        // Cloud sync (fire and forget)
        syncRecord('workout_logs', {
          id: completed.id,
          started_at: completed.startedAt,
          completed_at: completed.completedAt,
          duration_minutes: completed.durationMinutes,
          program_id: completed.programId ?? null,
          day_id: completed.dayId ?? null,
          sets: completed.sets,
          rating: completed.rating ?? null,
          notes: completed.notes ?? null,
          workout_name: completed.workoutName ?? null,
        }).catch(() => {});
      },

      cancelWorkout: () => set({ inProgress: null }),

      // -----------------------------------------------------------------------
      // History
      // -----------------------------------------------------------------------

      getLogsByDate: (date) => get().logs.filter((l) => l.date === date),

      getLogsByProgram: (programId) =>
        get().logs.filter((l) => l.programId === programId),

      getExerciseHistory: (exerciseId) => {
        const allSets = get()
          .logs.flatMap((l) =>
            l.sets
              .filter((s) => s.exerciseId === exerciseId)
              .map((s) => ({ ...s, date: l.date })),
          );
        if (allSets.length === 0) return null;
        return {
          exerciseId,
          bestWeight: Math.max(...allSets.map((s) => s.weightLbs ?? 0)),
          bestReps: Math.max(...allSets.map((s) => s.reps)),
          totalSets: allSets.length,
          lastPerformed: allSets.reduce(
            (latest, s) => (s.date > latest ? s.date : latest),
            allSets[0].date,
          ),
        };
      },

      getWeeklyVolume: (weeksBack = 8) => {
        const weeks: WeeklyVolume[] = [];
        const now = new Date();
        for (let w = 0; w < weeksBack; w++) {
          const monday = new Date(now);
          monday.setDate(monday.getDate() - monday.getDay() + 1 - w * 7);
          const weekStart = monday.toISOString().slice(0, 10);
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          const weekEnd = sunday.toISOString().slice(0, 10);

          const weekLogs = get().logs.filter(
            (l) => l.date >= weekStart && l.date <= weekEnd,
          );
          const allSets = weekLogs.flatMap((l) => l.sets);
          weeks.push({
            weekStart,
            totalSets: allSets.length,
            totalReps: allSets.reduce((s, set) => s + set.reps, 0),
            totalWeightLbs: allSets.reduce(
              (s, set) => s + (set.weightLbs ?? 0) * set.reps,
              0,
            ),
            workoutCount: weekLogs.length,
          });
        }
        return weeks.reverse();
      },

      getTotalVolume: () => {
        const allSets = get().logs.flatMap((l) => l.sets);
        return {
          sets: allSets.length,
          reps: allSets.reduce((s, set) => s + set.reps, 0),
          weightLbs: allSets.reduce(
            (s, set) => s + (set.weightLbs ?? 0) * set.reps,
            0,
          ),
        };
      },

      getRecentExercises: (limit = 10) => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const log of get().logs) {
          for (const s of log.sets) {
            if (!seen.has(s.exerciseId)) {
              seen.add(s.exerciseId);
              result.push(s.exerciseId);
              if (result.length >= limit) return result;
            }
          }
        }
        return result;
      },

      getStreak: () => {
        const sorted = [...get().logs].sort(
          (a, b) => b.date.localeCompare(a.date),
        );
        if (sorted.length === 0) return 0;

        let streak = 1;
        const today = new Date();
        const lastDate = new Date(sorted[0].date);
        const diffDays = Math.floor(
          (today.getTime() - lastDate.getTime()) / 86400000,
        );
        if (diffDays > 1) return 0;

        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1].date);
          const curr = new Date(sorted[i].date);
          const gap = Math.floor(
            (prev.getTime() - curr.getTime()) / 86400000,
          );
          if (gap === 1) streak++;
          else break;
        }
        return streak;
      },

      clearAll: () =>
        set({ activeProgram: null, logs: [], inProgress: null, savedGeneratedWorkouts: [] }),
    }),
    {
      name: 'peptalk-workouts',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        activeProgram: state.activeProgram,
        logs: state.logs,
        savedGeneratedWorkouts: state.savedGeneratedWorkouts,
      }),
    },
  ),
);

export default useWorkoutStore;
