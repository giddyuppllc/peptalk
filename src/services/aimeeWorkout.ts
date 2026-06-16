/**
 * Aimee Workout (AI) — client service.
 *
 * Calls the `aimee-workout` edge function, which DESIGNS a targeted program
 * structure (days → slots of muscle + P1–P4 priority + set type, following
 * Jamie's stacking/frequency rules). This service then FILLS each slot with a
 * real exercise randomly drawn from the on-device library (filterExercises),
 * so the AI never invents a move and every generation is a fresh mix.
 *
 * The output matches GeneratedWorkout from workoutGenerator.ts, so it drops
 * straight into saveGeneratedWorkout / the workout player.
 */

import { filterExercises } from '../data/exercises';
import type {
  Exercise,
  MuscleGroup,
  ExercisePriority,
  ExerciseLocation,
  ExerciseGender,
} from '../types/fitness';
import type {
  GeneratedWorkout,
  GeneratedDay,
  GeneratedExercise,
} from './workoutGenerator';

// Muscles the edge function is allowed to emit (mirrors the fn's taxonomy).
const AI_MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core',
  'quads', 'hamstrings', 'glutes', 'calves', 'trapezius', 'cardio',
];
const PRIORITIES: ExercisePriority[] = ['P1', 'P2', 'P3', 'P4'];

interface AiSlot {
  muscle: MuscleGroup;
  priority: ExercisePriority;
  setType: string;
  sets: number;
  reps: string;
  tempo?: string;
  rest?: string;
  timeSeconds?: number;
}
interface AiDay { name: string; slots: AiSlot[]; }
interface AiProgram { label: string; days: AiDay[]; }

export interface AiWorkoutParams {
  goal: string;
  daysPerWeek: number;
  location: 'gym' | 'home';
  gender: ExerciseGender;
  focusMuscles?: MuscleGroup[];
  level?: 'beginner' | 'intermediate' | 'advanced';
}

/** Raised for caller-friendly handling (paywall / rate-limit vs generic). */
export class AiWorkoutError extends Error {
  code: 'upgrade' | 'rate_limit' | 'auth' | 'unavailable';
  constructor(code: AiWorkoutError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * For each muscle, which priorities actually have ≥1 exercise given the
 * user's location/gender. Sent to the edge fn so it only emits fillable slots.
 */
export function buildAvailability(
  location: ExerciseLocation,
  gender: ExerciseGender,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const muscle of AI_MUSCLES) {
    const present: string[] = [];
    for (const priority of PRIORITIES) {
      if (filterExercises({ muscle, priority, location, gender }).length > 0) {
        present.push(priority);
      }
    }
    if (present.length) map[muscle] = present;
  }
  return map;
}

/** Expand "8-12" + sets=4 → "8-12/8-12/8-12/8-12" (workoutGenerator's per-set format). */
function expandReps(reps: string, sets: number): string {
  const n = Math.min(Math.max(sets || 3, 1), 6);
  const r = (reps || '10-12').trim();
  return Array.from({ length: n }, () => r).join('/');
}

/** Turn the AI program structure into a concrete GeneratedWorkout by filling slots locally. */
function fillProgram(
  program: AiProgram,
  params: AiWorkoutParams,
): GeneratedWorkout {
  const location: ExerciseLocation = params.location;
  const gender: ExerciseGender = params.gender;
  const days: GeneratedDay[] = [];
  const warnings: string[] = [];

  for (const day of program.days) {
    const usedIds = new Set<string>();
    const exercises: GeneratedExercise[] = [];

    for (const slot of day.slots) {
      const muscle = slot.muscle;
      const priority = slot.priority;

      let candidates = filterExercises({ muscle, priority, location, gender })
        .filter((e) => !usedIds.has(e.id));
      // Relax priority, then gender, then location until we find something.
      if (candidates.length === 0) {
        candidates = filterExercises({ muscle, location, gender }).filter((e) => !usedIds.has(e.id));
      }
      if (candidates.length === 0) {
        candidates = filterExercises({ muscle, location }).filter((e) => !usedIds.has(e.id));
      }
      if (candidates.length === 0) {
        candidates = filterExercises({ muscle }).filter((e) => !usedIds.has(e.id));
      }

      const selected: Exercise | undefined = candidates.length ? pickRandom(candidates) : undefined;
      if (!selected) {
        warnings.push(`${day.name}: no ${muscle} exercise found`);
        continue;
      }
      usedIds.add(selected.id);
      const isTimed = slot.timeSeconds != null || selected.isTimeBased;
      exercises.push({
        exercise: selected,
        reps: isTimed && slot.timeSeconds ? '1' : expandReps(slot.reps, slot.sets),
        setType: slot.setType || 'normal',
        tempo: slot.tempo,
        rest: slot.rest,
        timeSeconds: slot.timeSeconds,
      });
    }

    days.push({ name: day.name, exercises });
  }

  return {
    templateId: `ai-${params.goal}-${params.daysPerWeek}`,
    templateLabel: program.label || `${params.goal} program`,
    goal: params.goal,
    generatedAt: new Date().toISOString(),
    days,
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * Generate an AI-designed, locally-filled workout. Throws AiWorkoutError on
 * paywall (403), rate limit (429), auth, or any AI/network failure — the
 * caller decides whether to fall back to the deterministic generator.
 */
export async function generateAiWorkout(params: AiWorkoutParams): Promise<GeneratedWorkout> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await (supabase as any).auth.getSession();
  if (!session?.access_token) {
    throw new AiWorkoutError('auth', 'Please log in to generate a workout.');
  }

  const availability = buildAvailability(params.location, params.gender);
  const focusMuscles = (params.focusMuscles ?? []).filter((m) => AI_MUSCLES.includes(m));

  const { data, error } = await (supabase as any).functions.invoke('aimee-workout', {
    body: {
      goal: params.goal,
      daysPerWeek: params.daysPerWeek,
      location: params.location,
      gender: params.gender,
      level: params.level ?? 'intermediate',
      focusMuscles,
      availability,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    // supabase-js wraps non-2xx; try to read the function's JSON error body.
    const ctx = (error as any)?.context;
    const status = ctx?.status ?? (error as any)?.status;
    let body: any = ctx?.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* keep string */ } }
    if (status === 403 || body?.upgrade) {
      throw new AiWorkoutError('upgrade', 'Pro tier required for AI workout generation.');
    }
    if (status === 429) {
      throw new AiWorkoutError('rate_limit', body?.error ?? 'Daily workout limit reached.');
    }
    throw new AiWorkoutError('unavailable', body?.error ?? error.message ?? 'AI service unavailable.');
  }

  const program = data?.program as AiProgram | undefined;
  if (!program || !Array.isArray(program.days) || program.days.length === 0) {
    throw new AiWorkoutError('unavailable', 'AI returned no program.');
  }

  return fillProgram(program, params);
}
