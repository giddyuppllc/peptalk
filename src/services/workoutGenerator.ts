/**
 * Workout Generator — The brain of the workout builder.
 *
 * Takes a program template + user filters and generates concrete workouts
 * by randomly selecting exercises from the pool matching each slot's
 * muscle group, priority, location, and gender requirements.
 *
 * Every generated workout is different — infinite variety within Jamie's structure.
 */

import { filterExercises } from '../data/exercises';
import type {
  Exercise,
  MuscleGroup,
  ExercisePriority,
  ExerciseLocation,
  ExerciseGender,
} from '../types/fitness';
import templates from '../data/workoutTemplates.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkoutSlot {
  muscle: string;
  priority: string;
  reps: string;
  setType: string;
  tempo?: string;
  rest?: string;
  timeSeconds?: number;
}

export interface WorkoutDayTemplate {
  name: string;
  slots: WorkoutSlot[];
}

export interface ProgramTemplate {
  id: string;
  goal: string;
  daysPerWeek: number;
  durationMinutes: number;
  gender: string;
  label: string;
  days: WorkoutDayTemplate[];
}

export interface GeneratedExercise {
  exercise: Exercise;
  reps: string;
  setType: string;
  tempo?: string;
  rest?: string;
  timeSeconds?: number;
}

export interface GeneratedDay {
  name: string;
  exercises: GeneratedExercise[];
}

export interface GeneratedWorkout {
  templateId: string;
  templateLabel: string;
  goal: string;
  generatedAt: string;
  days: GeneratedDay[];
}

// ---------------------------------------------------------------------------
// Template Access
// ---------------------------------------------------------------------------

const TEMPLATES = templates as ProgramTemplate[];

/** Get all available program templates */
export function getTemplates(): ProgramTemplate[] {
  return TEMPLATES;
}

/** Get templates filtered by gender and/or goal */
export function getTemplatesForUser(options: {
  gender?: 'male' | 'female' | 'anyone';
  goal?: string;
  daysPerWeek?: number;
}): ProgramTemplate[] {
  return TEMPLATES.filter(t => {
    if (options.gender) {
      if (t.gender !== 'anyone' && t.gender !== options.gender) return false;
    }
    if (options.goal && t.goal !== options.goal) return false;
    if (options.daysPerWeek && t.daysPerWeek !== options.daysPerWeek) return false;
    return true;
  });
}

/** Get available goals for a gender */
export function getGoalsForGender(gender: 'male' | 'female'): string[] {
  const goals = new Set<string>();
  TEMPLATES.forEach(t => {
    if (t.gender === gender || t.gender === 'anyone') {
      goals.add(t.goal);
    }
  });
  return [...goals];
}

// ---------------------------------------------------------------------------
// Muscle Group Mapping
// ---------------------------------------------------------------------------

const SLOT_MUSCLE_MAP: Record<string, MuscleGroup> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  core: 'core',
  quads: 'quads',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  trapezius: 'trapezius',
  circuit_cardio: 'cardio',
  circuit_lower: 'quads',
  circuit_pull: 'back',
  circuit_push: 'chest',
  warm_up_lower: 'glutes',
  warm_up_upper: 'shoulders',
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/** Pick a random item from an array */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a complete workout from a template.
 *
 * For each slot in the template, finds matching exercises from the pool
 * and randomly selects one. Avoids repeating the same exercise within a day.
 */
export function generateWorkout(
  templateId: string,
  userOptions: {
    location?: ExerciseLocation;
    gender?: ExerciseGender;
  } = {}
): GeneratedWorkout | null {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  const generatedDays: GeneratedDay[] = [];

  for (const day of template.days) {
    const usedExerciseIds = new Set<string>();
    const exercises: GeneratedExercise[] = [];

    for (const slot of day.slots) {
      const muscle = SLOT_MUSCLE_MAP[slot.muscle] ?? (slot.muscle as MuscleGroup);
      const priority = (slot.priority || 'P1') as ExercisePriority;

      // Find matching exercises
      const candidates = filterExercises({
        muscle,
        priority,
        location: userOptions.location,
        gender: userOptions.gender,
      }).filter(e => !usedExerciseIds.has(e.id));

      // Fallback: relax priority if no candidates
      let selected: Exercise | undefined;
      if (candidates.length > 0) {
        selected = pickRandom(candidates);
      } else {
        // Try any priority for this muscle
        const fallback = filterExercises({
          muscle,
          location: userOptions.location,
          gender: userOptions.gender,
        }).filter(e => !usedExerciseIds.has(e.id));

        if (fallback.length > 0) {
          selected = pickRandom(fallback);
        }
      }

      if (selected) {
        usedExerciseIds.add(selected.id);
        exercises.push({
          exercise: selected,
          reps: slot.reps,
          setType: slot.setType,
          tempo: slot.tempo,
          rest: slot.rest,
          timeSeconds: slot.timeSeconds,
        });
      }
    }

    generatedDays.push({
      name: day.name,
      exercises,
    });
  }

  return {
    templateId: template.id,
    templateLabel: template.label,
    goal: template.goal,
    generatedAt: new Date().toISOString(),
    days: generatedDays,
  };
}

/**
 * Regenerate a single day from a workout (keep the rest).
 * Used when user wants a fresh workout for one specific day.
 */
export function regenerateDay(
  templateId: string,
  dayIndex: number,
  userOptions: {
    location?: ExerciseLocation;
    gender?: ExerciseGender;
  } = {}
): GeneratedDay | null {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template || dayIndex >= template.days.length) return null;

  const day = template.days[dayIndex];
  const usedExerciseIds = new Set<string>();
  const exercises: GeneratedExercise[] = [];

  for (const slot of day.slots) {
    const muscle = SLOT_MUSCLE_MAP[slot.muscle] ?? (slot.muscle as MuscleGroup);
    const priority = (slot.priority || 'P1') as ExercisePriority;

    const candidates = filterExercises({
      muscle,
      priority,
      location: userOptions.location,
      gender: userOptions.gender,
    }).filter(e => !usedExerciseIds.has(e.id));

    let selected: Exercise | undefined;
    if (candidates.length > 0) {
      selected = pickRandom(candidates);
    } else {
      const fallback = filterExercises({ muscle }).filter(e => !usedExerciseIds.has(e.id));
      if (fallback.length > 0) selected = pickRandom(fallback);
    }

    if (selected) {
      usedExerciseIds.add(selected.id);
      exercises.push({
        exercise: selected,
        reps: slot.reps,
        setType: slot.setType,
        tempo: slot.tempo,
        rest: slot.rest,
        timeSeconds: slot.timeSeconds,
      });
    }
  }

  return { name: day.name, exercises };
}

// ---------------------------------------------------------------------------
// Rep/Set Tracking Helpers
// ---------------------------------------------------------------------------

export interface SetLog {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  targetReps: string;
  actualReps: number | null;
  weight: number | null;
  duration: number | null;
  completed: boolean;
}

/**
 * Parse a rep string like "10-12/10-12/10-12/10-12" into individual set targets.
 */
export function parseRepString(repStr: string): string[] {
  return repStr.split('/').map(s => s.trim()).filter(Boolean);
}

/**
 * Create empty set logs for tracking a workout.
 */
export function createSetLogs(generatedDay: GeneratedDay): SetLog[] {
  const logs: SetLog[] = [];

  generatedDay.exercises.forEach(ex => {
    const sets = parseRepString(ex.reps);
    sets.forEach((targetReps, i) => {
      logs.push({
        exerciseId: ex.exercise.id,
        exerciseName: ex.exercise.name,
        setNumber: i + 1,
        targetReps,
        actualReps: null,
        weight: null,
        duration: ex.exercise.isTimeBased ? null : null,
        completed: false,
      });
    });
  });

  return logs;
}

// ---------------------------------------------------------------------------
// Goal Labels
// ---------------------------------------------------------------------------

export const GOAL_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  transformation: { label: 'Transformation', description: 'Body recomp with strength and hypertrophy', icon: 'flash-outline' },
  weight_loss: { label: 'Weight Loss', description: 'Higher reps, circuit elements, calorie burn', icon: 'flame-outline' },
  circuit: { label: '30min FIT', description: 'Fast-paced circuits for time-crunched days', icon: 'timer-outline' },
  hypertrophy: { label: 'Hypertrophy', description: 'Muscle growth: 10-12 reps, 3-4 sets, 30-45s rest', icon: 'barbell-outline' },
  strength: { label: 'Strength', description: 'Heavy compounds: 6-8 reps, 3-6 sets, 90-120s rest', icon: 'trophy-outline' },
  aerobic: { label: 'Aerobic Performance', description: 'Circuits, WODs, timed PRs, metabolic conditioning', icon: 'pulse-outline' },
  body_recomp: { label: 'Body Recomp', description: 'Hypertrophy base with cardio intervals', icon: 'trending-up-outline' },
};

// ---------------------------------------------------------------------------
// Recommended RPE
// ---------------------------------------------------------------------------

/**
 * Baseline RPE for each goal — the effort level Jamie wants for the primary (P1) work.
 * Strength sits highest (near failure), circuits/weight-loss lowest (keep moving).
 */
const GOAL_BASELINE_RPE: Record<string, number> = {
  strength:       9,
  hypertrophy:    8,
  transformation: 8,
  body_recomp:    8,
  weight_loss:    7,
  aerobic:        7,
  circuit:        6,
};

/**
 * Adjustment by exercise priority. P1 = primary compound/big lift, push hard.
 * P2 = accessory, slightly lower. P3/P4 = finishers/rehab, keep form clean.
 */
const PRIORITY_RPE_ADJUST: Record<string, number> = {
  P1:  0,
  P2: -1,
  P3: -1,
  P4: -2,
};

/**
 * Get the recommended RPE (1-10) for an exercise given the workout goal and the
 * exercise's priority tier. Clamped to [5, 10].
 */
export function getRecommendedRpe(goal: string, priority: string): number {
  const base = GOAL_BASELINE_RPE[goal] ?? 7;
  const adjust = PRIORITY_RPE_ADJUST[priority] ?? 0;
  const result = base + adjust;
  return Math.max(5, Math.min(10, result));
}

/** Human-readable label for an RPE value */
export function rpeLabel(rpe: number): string {
  if (rpe >= 10) return 'Max effort';
  if (rpe >= 9) return 'Very hard';
  if (rpe >= 8) return 'Hard';
  if (rpe >= 7) return 'Moderate-hard';
  if (rpe >= 6) return 'Moderate';
  return 'Light';
}
