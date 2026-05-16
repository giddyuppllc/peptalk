/**
 * Master exercise library — 289 exercises curated by Jamie Esposito.
 *
 * Taxonomy: Priority (P1-P4), Level, Location, Gender, Metrics.
 * Equipment inferred from exercise name at build time.
 */

import type {
  Exercise,
  MuscleGroup,
  Equipment,
  ExerciseDifficulty,
  ExercisePriority,
  ExerciseLocation,
  ExerciseGender,
  ExerciseMetric,
  ExerciseTag,
} from '../types/fitness';
import rawExercises from './jamieExercises.json';
// Grok-generated coaching content. The shape is:
//   { [exerciseId]: { description, steps, cues, safetyNotes } }
// Entries are merged into the Exercise object at buildExercise() time
// so callers don't need a separate lookup. Missing entries silently
// fall through — the UI shows the placeholder "no coaching content".
import rawInstructions from './exerciseInstructions.json';

interface ExerciseInstructions {
  description?: string;
  steps?: string[];
  cues?: string[];
  safetyNotes?: string[];
}

const INSTRUCTIONS_MAP = rawInstructions as Record<string, ExerciseInstructions>;

// ---------------------------------------------------------------------------
// Inference Helpers
// ---------------------------------------------------------------------------

const normalize = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Infer equipment from exercise name */
export function inferEquipment(name: string): Equipment[] {
  const n = name.toLowerCase();
  const eq: Equipment[] = [];
  if (/\bdumbbell\b|\bdb\b/.test(n)) eq.push('dumbbell');
  if (/\bbarbell\b/.test(n)) eq.push('barbell');
  if (/\bkettlebell\b|\bkb\b/.test(n)) eq.push('kettlebell');
  if (/\bcable\b/.test(n)) eq.push('cable');
  if (/\bmachine\b|\bleg press\b|\bhack\b|\bpreacher curls machine\b/.test(n)) eq.push('machine');
  if (/\bband\b|\bbanded\b|\bresistance band\b/.test(n)) eq.push('band');
  if (/\bstability ball\b|\bsb\b/.test(n)) eq.push('stability_ball');
  if (/\bmedicine ball\b|\bmb\b/.test(n)) eq.push('medicine_ball');
  if (/\bbench\b/.test(n)) eq.push('bench');
  if (/\bsmith machine\b|\bsmith\b/.test(n)) eq.push('smith_machine');
  if (/\bhanging\b|\bpull up\b|\bchin up\b/.test(n)) eq.push('pull_up_bar');
  if (/\bplate\b/.test(n)) eq.push('plate');
  if (/\btowel\b/.test(n)) eq.push('towel');
  if (/\bblock\b/.test(n)) eq.push('block');
  if (/\bjump rope\b/.test(n)) eq.push('jump_rope');
  if (eq.length === 0) eq.push('none');
  return eq;
}

export function inferTimeBased(name: string): boolean {
  const n = name.toLowerCase();
  return /\bplank\b|\bvaccum\b|\bwall sit\b|\bisometric\b|\bhold\b/.test(n);
}

// ---------------------------------------------------------------------------
// Map spreadsheet muscle names → MuscleGroup type
// ---------------------------------------------------------------------------

const MUSCLE_MAP: Record<string, MuscleGroup> = {
  'back': 'back',
  'biceps': 'biceps',
  'calves': 'calves',
  'cardio': 'cardio',
  'chest': 'chest',
  'core abdominals': 'core',
  'glutes': 'glutes',
  'hamstrings': 'hamstrings',
  'quadriceps': 'quads',
  'shoulders': 'shoulders',
  'trapezius': 'trapezius',
  'triceps': 'triceps',
};

const TAG_MAP: Record<string, ExerciseTag> = {
  'circuit cardio': 'circuit_cardio',
  'circuit lower': 'circuit_lower',
  'circuit pull': 'circuit_pull',
  'circuit push': 'circuit_push',
  'warm up lower': 'warm_up_lower',
  'warm up upper': 'warm_up_upper',
};

function classifyMuscle(raw: string): { muscle: MuscleGroup | null; tag: ExerciseTag | null } {
  const key = raw.toLowerCase().trim();
  if (MUSCLE_MAP[key]) return { muscle: MUSCLE_MAP[key], tag: null };
  if (TAG_MAP[key]) return { muscle: null, tag: TAG_MAP[key] };
  return { muscle: null, tag: null };
}

// ---------------------------------------------------------------------------
// Build Exercise List from JSON
// ---------------------------------------------------------------------------

interface RawExercise {
  id: string;
  name: string;
  muscles: string[];
  priority: string;
  level: string;
  location: string;
  gender: string;
  metrics: string[];
}

function buildExercise(raw: RawExercise): Exercise {
  const muscles: MuscleGroup[] = [];
  const tags: ExerciseTag[] = [];

  for (const m of raw.muscles) {
    const { muscle, tag } = classifyMuscle(m);
    if (muscle) muscles.push(muscle);
    if (tag) tags.push(tag);
  }

  const primaryMuscle: MuscleGroup = muscles[0] || 'full_body';
  const secondaryMuscles = muscles.slice(1);

  const instructions = INSTRUCTIONS_MAP[raw.id];

  return {
    id: raw.id,
    name: raw.name,
    normalizedName: normalize(raw.name),
    primaryMuscle,
    secondaryMuscles,
    tags,
    equipment: inferEquipment(raw.name),
    difficulty: (raw.level as ExerciseDifficulty) || 'beginner',
    isTimeBased: inferTimeBased(raw.name) || raw.metrics.includes('duration'),
    priority: (raw.priority as ExercisePriority) || 'P2',
    location: (raw.location as ExerciseLocation) || 'any',
    gender: (raw.gender as ExerciseGender) || 'anyone',
    metrics: raw.metrics.map((m) => m.toLowerCase().trim() as ExerciseMetric).filter(Boolean),
    description: instructions?.description,
    steps: instructions?.steps,
    cues: instructions?.cues,
    safetyNotes: instructions?.safetyNotes,
  };
}

// Lazy-initialized
let _exercises: Exercise[] | null = null;
let _exerciseMap: Map<string, Exercise> | null = null;

function getExerciseList(): Exercise[] {
  if (!_exercises) _exercises = (rawExercises as RawExercise[]).map(buildExercise);
  return _exercises;
}

function getExerciseMap(): Map<string, Exercise> {
  if (!_exerciseMap) _exerciseMap = new Map(getExerciseList().map((e) => [e.id, e]));
  return _exerciseMap;
}

/** Full exercise list (289 exercises) */
export const EXERCISES: Exercise[] = new Proxy([] as Exercise[], {
  get(_, prop) {
    const list = getExerciseList();
    if (prop === 'length') return list.length;
    if (prop === 'map') return list.map.bind(list);
    if (prop === 'filter') return list.filter.bind(list);
    if (prop === 'forEach') return list.forEach.bind(list);
    if (prop === 'find') return list.find.bind(list);
    if (prop === 'slice') return list.slice.bind(list);
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return list[Number(prop)];
    return (list as any)[prop];
  },
});

// ---------------------------------------------------------------------------
// Query Helpers
// ---------------------------------------------------------------------------

/** Get exercise by ID */
export function getExerciseById(exerciseId: string): Exercise | undefined {
  return getExerciseMap().get(exerciseId);
}

/** Search exercises by name, muscle, or equipment */
export function searchExercises(query: string): Exercise[] {
  const q = query.toLowerCase().trim();
  if (!q) return EXERCISES;
  return EXERCISES.filter(
    (e) =>
      e.normalizedName.includes(q) ||
      e.primaryMuscle.includes(q) ||
      e.equipment.some((eq) => eq.includes(q)),
  );
}

/** Filter by muscle group */
export function getExercisesByMuscle(muscle: MuscleGroup): Exercise[] {
  return EXERCISES.filter(
    (e) => e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle),
  );
}

/** Filter by equipment */
export function getExercisesByEquipment(equip: Equipment): Exercise[] {
  return EXERCISES.filter((e) => e.equipment.includes(equip));
}

/** Filter by priority level */
export function getExercisesByPriority(priority: ExercisePriority): Exercise[] {
  return EXERCISES.filter((e) => e.priority === priority);
}

/** Filter by location */
export function getExercisesByLocation(location: ExerciseLocation): Exercise[] {
  if (location === 'any') return [...EXERCISES];
  return EXERCISES.filter((e) => e.location === 'any' || e.location === location);
}

/** Filter by gender suitability */
export function getExercisesByGender(gender: ExerciseGender): Exercise[] {
  if (gender === 'anyone') return [...EXERCISES];
  return EXERCISES.filter((e) => e.gender === 'anyone' || e.gender === gender);
}

/** Filter by difficulty */
export function getExercisesByLevel(level: ExerciseDifficulty): Exercise[] {
  return EXERCISES.filter((e) => e.difficulty === level);
}

/** Filter by tag (circuit/warm-up) */
export function getExercisesByTag(tag: ExerciseTag): Exercise[] {
  return EXERCISES.filter((e) => e.tags.includes(tag));
}

/** Composite filter for workout builder / Aimee AI */
export function filterExercises(filters: {
  muscle?: MuscleGroup;
  priority?: ExercisePriority;
  level?: ExerciseDifficulty;
  location?: ExerciseLocation;
  gender?: ExerciseGender;
  tag?: ExerciseTag;
  equipment?: Equipment;
}): Exercise[] {
  return EXERCISES.filter((e) => {
    if (filters.muscle && e.primaryMuscle !== filters.muscle && !e.secondaryMuscles.includes(filters.muscle)) return false;
    if (filters.priority && e.priority !== filters.priority) return false;
    if (filters.level && e.difficulty !== filters.level) return false;
    if (filters.location && filters.location !== 'any' && e.location !== 'any' && e.location !== filters.location) return false;
    if (filters.gender && filters.gender !== 'anyone' && e.gender !== 'anyone' && e.gender !== filters.gender) return false;
    if (filters.tag && !e.tags.includes(filters.tag)) return false;
    if (filters.equipment && !e.equipment.includes(filters.equipment)) return false;
    return true;
  });
}

export default EXERCISES;
