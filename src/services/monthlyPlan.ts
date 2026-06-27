/**
 * Monthly Workout Programming Machine — Jamie's spec.
 *
 * Builds a 30-day training plan from the user's health goals + programming
 * inputs (workouts/week 3–6, length 30–60 min, home/gym, gender), then expands
 * one "template week" across 30 days on a WEEKLY-REPEAT schedule: the same
 * workout lands on the same weekday every week (Monday = Monday's workout for
 * all 30 days). Progressive overload shows up because each repeat is logged
 * separately (reps + weights per session) via the existing workout store/tracker
 * and getExerciseHistory.
 *
 * Two entry points:
 *   - buildMonthlyPlan()          — AI/randomized build from goals + Jamie's library.
 *   - buildPlanFromProgram()      — pre-programmed series (e.g. Lusciously Lean
 *                                   8-week) flattened into the 30-day calendar.
 *
 * No-invent rule: every exercise comes from Jamie's on-device library
 * (filterExercises / getExerciseById). This service never names a move the
 * library doesn't contain.
 */

import { filterExercises, getExerciseById } from '../data/exercises';
import {
  generateAiWorkout,
  AiWorkoutError,
} from './aimeeWorkout';
import {
  generateWorkout,
  getTemplatesForUser,
  type GeneratedWorkout,
  type GeneratedDay,
  type GeneratedExercise,
  type ProgramTemplate,
} from './workoutGenerator';
import { getProgramById } from '../data/workoutPrograms';
import type {
  Exercise,
  ExerciseGender,
  ExerciseLocation,
  MuscleGroup,
} from '../types/fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const PLAN_DAYS = 30;

/** One slot on the 30-day calendar. Rest days have workout=null. */
export interface PlannedDay {
  /** 0-based day offset from plan start (0..29). */
  dayOffset: number;
  /** ISO date (YYYY-MM-DD) this day falls on. */
  date: string;
  /** Day of week 0=Sun..6=Sat. */
  weekday: number;
  /** Index into the template week's workout list (which repeating workout), or null on a rest day. */
  templateDayIndex: number | null;
  /** Snapshot label for the day, e.g. "Day 1 — Push" or "Rest". */
  label: string;
}

export interface MonthlyPlan {
  id: string;
  /** Goal key (weight_loss, hypertrophy, …) or program id for pre-programmed series. */
  goal: string;
  source: 'ai' | 'program';
  /** Pretty name for the plan. */
  label: string;
  createdAt: string;
  /** ISO start date (YYYY-MM-DD). */
  startDate: string;
  workoutsPerWeek: number;
  /** Minutes the user picked (30–60). */
  lengthMinutes: number;
  location: ExerciseLocation;
  gender: ExerciseGender;
  /**
   * The repeating "template week" — an ordered list of workouts. The plan
   * cycles through these onto the chosen training weekdays. Index aligns with
   * PlannedDay.templateDayIndex.
   */
  week: GeneratedDay[];
  /** Which weekdays (0=Sun..6=Sat) are training days, in order. length === workoutsPerWeek. */
  trainingWeekdays: number[];
  /** The fully-expanded 30-day calendar. */
  calendar: PlannedDay[];
  /** True when a daily step goal was attached (weight-loss plans). */
  stepGoalAdded?: boolean;
  /** The step target attached (10000–12000). */
  stepGoal?: number;
}

// ---------------------------------------------------------------------------
// Length → exercise count
// ---------------------------------------------------------------------------

/**
 * Roughly map a session length (minutes) to how many exercises to keep per day.
 * ~6 min/exercise (3 sets + rest) is a sane planning heuristic; clamped so a
 * 30-min day still has a real workout and a 60-min day doesn't balloon. The
 * 2-move core finisher the AI service appends is preserved on top.
 */
export function exercisesForLength(lengthMinutes: number): number {
  const m = Math.min(Math.max(lengthMinutes, 30), 60);
  // 30 min → 4, 45 min → 6, 60 min → 8.
  return Math.round(4 + ((m - 30) / 30) * 4);
}

/** Estimate a day's duration (minutes) from its exercise count — for display. */
export function estimateDayMinutes(day: GeneratedDay): number {
  return Math.max(20, day.exercises.length * 6);
}

// ---------------------------------------------------------------------------
// Training-weekday layout
// ---------------------------------------------------------------------------

/**
 * Spread N training days across the 7-day week as evenly as possible, starting
 * Monday. 3/wk → Mon/Wed/Fri; 4/wk → Mon/Tue/Thu/Fri; 5/wk → Mon–Fri; 6/wk →
 * Mon–Sat. Returned as weekday numbers (0=Sun..6=Sat), sorted.
 */
export function trainingWeekdaysFor(workoutsPerWeek: number): number[] {
  const n = Math.min(Math.max(workoutsPerWeek, 3), 6);
  const LAYOUTS: Record<number, number[]> = {
    3: [1, 3, 5],          // Mon, Wed, Fri
    4: [1, 2, 4, 5],       // Mon, Tue, Thu, Fri
    5: [1, 2, 3, 4, 5],    // Mon–Fri
    6: [1, 2, 3, 4, 5, 6], // Mon–Sat
  };
  return LAYOUTS[n];
}

// ---------------------------------------------------------------------------
// Calendar expansion (weekly repeat)
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Expand a template week across 30 days. Training weekdays get the next workout
 * in rotation (cycling the template week list); non-training weekdays are rest.
 * Because the rotation is keyed to weekday, the same workout repeats on the same
 * weekday across all 30 days — the progressive-overload guarantee from the spec.
 */
export function expandCalendar(
  weekCount: number,
  trainingWeekdays: number[],
  week: GeneratedDay[],
  startDate: string,
): PlannedDay[] {
  const start = new Date(`${startDate}T00:00:00`);
  const out: PlannedDay[] = [];

  // Map each training weekday → a stable template index so the SAME weekday
  // always draws the SAME workout (Monday is always week[0], etc.).
  const weekdayToTemplate = new Map<number, number>();
  trainingWeekdays.forEach((wd, i) => {
    weekdayToTemplate.set(wd, week.length ? i % week.length : 0);
  });

  for (let i = 0; i < weekCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const weekday = d.getDay();
    const isTraining = weekdayToTemplate.has(weekday) && week.length > 0;
    const templateDayIndex = isTraining ? weekdayToTemplate.get(weekday)! : null;
    out.push({
      dayOffset: i,
      date: isoDate(d),
      weekday,
      templateDayIndex,
      label:
        templateDayIndex != null
          ? week[templateDayIndex]?.name ?? `Day ${templateDayIndex + 1}`
          : 'Rest',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trim a generated week to the user's session length
// ---------------------------------------------------------------------------

/**
 * Keep the first `keep` exercises of each day but always preserve a trailing
 * 2-move core finisher if the AI appended one (super_set / super_set_2 tail).
 */
function trimDayToLength(day: GeneratedDay, keep: number): GeneratedDay {
  if (day.exercises.length <= keep) return day;

  const tail = day.exercises.slice(-2);
  const hasFinisher =
    tail.length === 2 &&
    tail[0].setType === 'super_set' &&
    tail[1].setType === 'super_set_2';

  if (hasFinisher) {
    const head = day.exercises.slice(0, Math.max(keep - 2, 1));
    return { ...day, exercises: [...head, ...tail] };
  }
  return { ...day, exercises: day.exercises.slice(0, keep) };
}

// ---------------------------------------------------------------------------
// Build #1 — AI / randomized from goals
// ---------------------------------------------------------------------------

export interface MonthlyPlanParams {
  goal: string;
  workoutsPerWeek: number;
  lengthMinutes: number;
  location: ExerciseLocation;
  gender: ExerciseGender;
  level?: 'beginner' | 'intermediate' | 'advanced';
  /** Used to attach the step goal — pass the user's primary goals. */
  isWeightLoss?: boolean;
  startDate?: string;
}

function deterministicWeek(
  goal: string,
  workoutsPerWeek: number,
  location: ExerciseLocation,
  gender: ExerciseGender,
): GeneratedDay[] | null {
  const templateGender: 'male' | 'female' | 'anyone' =
    gender === 'men' ? 'male' : gender === 'women' ? 'female' : 'anyone';
  const nearest = (list: ProgramTemplate[]): ProgramTemplate | null =>
    list.length
      ? list.reduce((best, t) =>
          Math.abs(t.daysPerWeek - workoutsPerWeek) <
          Math.abs(best.daysPerWeek - workoutsPerWeek)
            ? t
            : best,
        )
      : null;
  const template =
    getTemplatesForUser({ gender: templateGender, goal, daysPerWeek: workoutsPerWeek })[0] ??
    nearest(getTemplatesForUser({ gender: templateGender, goal })) ??
    nearest(getTemplatesForUser({ goal })) ??
    nearest(getTemplatesForUser({}));
  if (!template) return null;
  const generated = generateWorkout(template.id, {
    location: location === 'any' ? undefined : location,
    gender,
  });
  return generated?.days ?? null;
}

/**
 * Build a full 30-day plan. Tries the AI program designer first (grounded in
 * Jamie's library), falls back to the deterministic template generator so the
 * user always gets a plan offline / on rate-limit. Throws AiWorkoutError only
 * for the Pro paywall case so the caller can show the upgrade sheet.
 */
export async function buildMonthlyPlan(
  params: MonthlyPlanParams,
): Promise<MonthlyPlan> {
  const workoutsPerWeek = Math.min(Math.max(Math.round(params.workoutsPerWeek), 3), 6);
  const lengthMinutes = Math.min(Math.max(Math.round(params.lengthMinutes), 30), 60);
  const location = params.location;
  const gender = params.gender;
  const keep = exercisesForLength(lengthMinutes);
  const startDate = params.startDate ?? new Date().toISOString().slice(0, 10);

  let week: GeneratedDay[] | null = null;

  try {
    const ai: GeneratedWorkout = await generateAiWorkout({
      goal: params.goal,
      daysPerWeek: workoutsPerWeek,
      location: location === 'home' ? 'home' : 'gym',
      gender,
      level: params.level ?? 'intermediate',
    });
    week = ai.days;
  } catch (err) {
    if (err instanceof AiWorkoutError && err.code === 'upgrade') throw err;
    // Any other AI failure → deterministic fallback.
    week = deterministicWeek(params.goal, workoutsPerWeek, location, gender);
  }

  if (!week || week.length === 0) {
    week = deterministicWeek(params.goal, workoutsPerWeek, location, gender);
  }
  if (!week || week.length === 0) {
    throw new AiWorkoutError('unavailable', 'Could not build a plan. Try a different goal.');
  }

  // Respect the requested session length.
  week = week.slice(0, workoutsPerWeek).map((d) => trimDayToLength(d, keep));

  const trainingWeekdays = trainingWeekdaysFor(workoutsPerWeek);
  const calendar = expandCalendar(PLAN_DAYS, trainingWeekdays, week, startDate);

  const stepGoal = params.isWeightLoss ? 11000 : undefined;

  return {
    id: `plan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    goal: params.goal,
    source: 'ai',
    label: `${PLAN_GOAL_LABEL[params.goal] ?? params.goal} — 30-day plan`,
    createdAt: new Date().toISOString(),
    startDate,
    workoutsPerWeek,
    lengthMinutes,
    location,
    gender,
    week,
    trainingWeekdays,
    calendar,
    stepGoalAdded: !!stepGoal,
    stepGoal,
  };
}

const PLAN_GOAL_LABEL: Record<string, string> = {
  transformation: 'Transformation',
  weight_loss: 'Weight Loss',
  circuit: '30min FIT',
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  aerobic: 'Aerobic',
  body_recomp: 'Body Recomp',
};

// ---------------------------------------------------------------------------
// Build #2 — pre-programmed series (Lusciously Lean) → calendar
// ---------------------------------------------------------------------------

/**
 * Flatten a curated WorkoutProgram (e.g. Lusciously Lean 8-week) into a
 * MonthlyPlan-shaped object whose `week` is the program's first week of
 * workouts and whose calendar lays the full set of program weeks/days onto the
 * real calendar starting today. Each program day's exercises are resolved from
 * the on-device library by id (no-invent: unknown ids are dropped).
 *
 * The result auto-populates the calendar via the workout store (planned logs).
 */
export interface ProgramPlan extends MonthlyPlan {
  /** Every program day flattened in order, with concrete exercises. */
  programDays: GeneratedDay[];
}

function programDayToGenerated(
  exercises: { exerciseId: string; reps: number[]; setType: string; restSeconds?: number; timeSeconds?: number }[],
  name: string,
): GeneratedDay {
  const out: GeneratedExercise[] = [];
  for (const ex of exercises) {
    const lib = getExerciseById(ex.exerciseId);
    if (!lib) continue; // no-invent: skip ids not in Jamie's library
    out.push({
      exercise: lib,
      reps: ex.reps.length
        ? ex.reps.map((r) => String(r)).join('/')
        : '1',
      setType: ex.setType,
      rest: ex.restSeconds ? `${ex.restSeconds}s` : undefined,
      timeSeconds: ex.timeSeconds,
    });
  }
  return { name, exercises: out };
}

/**
 * Build a calendar-ready plan from a curated program id. Lays the program's
 * weeks×days consecutively onto training weekdays starting `startDate`,
 * spanning however many days the program needs (NOT capped at 30 — the spec
 * wants the FULL 8 weeks of Lusciously Lean on the calendar).
 */
export function buildPlanFromProgram(
  programId: string,
  opts: {
    location: ExerciseLocation;
    gender: ExerciseGender;
    startDate?: string;
  },
): ProgramPlan | null {
  const program = getProgramById(programId);
  if (!program || program.weeks.length === 0) return null;

  const startDate = opts.startDate ?? new Date().toISOString().slice(0, 10);

  // Flatten every program day in week/day order.
  const programDays: GeneratedDay[] = [];
  for (const wk of program.weeks) {
    for (const d of wk.days) {
      programDays.push(programDayToGenerated(d.exercises, d.name));
    }
  }
  if (programDays.length === 0) return null;

  const workoutsPerWeek = Math.min(Math.max(program.weeks[0].days.length, 3), 6);
  const trainingWeekdays = trainingWeekdaysFor(workoutsPerWeek);

  // Lay program days onto consecutive training weekdays from the start date.
  const start = new Date(`${startDate}T00:00:00`);
  const calendar: PlannedDay[] = [];
  let placed = 0;
  // Span enough calendar days to seat every program day.
  const maxDays = program.weeks.length * 7 + 7;
  for (let i = 0; i < maxDays && placed < programDays.length; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const weekday = d.getDay();
    const isTraining = trainingWeekdays.includes(weekday);
    if (isTraining) {
      calendar.push({
        dayOffset: i,
        date: isoDate(d),
        weekday,
        templateDayIndex: placed,
        label: programDays[placed].name,
      });
      placed += 1;
    } else {
      calendar.push({
        dayOffset: i,
        date: isoDate(d),
        weekday,
        templateDayIndex: null,
        label: 'Rest',
      });
    }
  }

  return {
    id: `plan-${programId}-${Date.now()}`,
    goal: programId,
    source: 'program',
    label: program.name,
    createdAt: new Date().toISOString(),
    startDate,
    workoutsPerWeek,
    lengthMinutes: 45,
    location: opts.location,
    gender: opts.gender,
    week: programDays.slice(0, workoutsPerWeek),
    trainingWeekdays,
    calendar,
    programDays,
  };
}

/** Resolve the GeneratedDay for a planned calendar slot. */
export function workoutForPlannedDay(
  plan: MonthlyPlan | ProgramPlan,
  planned: PlannedDay,
): GeneratedDay | null {
  if (planned.templateDayIndex == null) return null;
  if (plan.source === 'program' && 'programDays' in plan) {
    return (plan as ProgramPlan).programDays[planned.templateDayIndex] ?? null;
  }
  return plan.week[planned.templateDayIndex] ?? null;
}

// ---------------------------------------------------------------------------
// Swap an exercise
// ---------------------------------------------------------------------------

/**
 * Candidate replacements for an exercise: same primary muscle, same location
 * (honoring 'any'), same gender suitability, excluding the current move.
 * Drawn entirely from Jamie's library (no-invent).
 */
export function swapCandidates(
  current: Exercise,
  location: ExerciseLocation,
  gender: ExerciseGender,
): Exercise[] {
  const muscle: MuscleGroup = current.primaryMuscle;
  let pool = filterExercises({ muscle, location, gender }).filter((e) => e.id !== current.id);
  if (pool.length === 0) pool = filterExercises({ muscle, location }).filter((e) => e.id !== current.id);
  if (pool.length === 0) pool = filterExercises({ muscle }).filter((e) => e.id !== current.id);
  // Prefer same equipment family first, then the rest.
  const sameEquip = pool.filter((e) =>
    e.equipment.some((eq) => current.equipment.includes(eq)),
  );
  const rest = pool.filter((e) => !sameEquip.includes(e));
  return [...sameEquip, ...rest];
}

/**
 * Return a new `week` with the exercise at (dayIndex, exerciseIndex) replaced by
 * `replacement`, preserving the original reps/setType/rest/timeSeconds so the
 * slot's prescription is unchanged — only the movement swaps.
 */
export function swapExerciseInWeek(
  week: GeneratedDay[],
  dayIndex: number,
  exerciseIndex: number,
  replacement: Exercise,
): GeneratedDay[] {
  return week.map((day, di) => {
    if (di !== dayIndex) return day;
    return {
      ...day,
      exercises: day.exercises.map((ex, ei) =>
        ei === exerciseIndex ? { ...ex, exercise: replacement } : ex,
      ),
    };
  });
}
