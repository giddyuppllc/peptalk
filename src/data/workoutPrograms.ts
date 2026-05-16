/**
 * Workout programs — starting with Jamie's 8-week Core Challenge.
 *
 * Each program references exercises by ID from the exercise library.
 * The exercise IDs match the normalized name format from exercises.ts.
 */

import type {
  WorkoutProgram,
  WorkoutWeek,
  WorkoutDay,
  ExerciseSet,
  SetType,
} from '../types/fitness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const exId = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().replace(/ /g, '-');

function s(
  name: string,
  reps: number[],
  setType: SetType,
  opts?: { timeSeconds?: number; restSeconds?: number },
): ExerciseSet {
  return {
    exerciseId: exId(name),
    reps,
    setType,
    ...opts,
  };
}

function day(
  name: string,
  code: string,
  exercises: ExerciseSet[],
): WorkoutDay {
  return { id: code.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-'), name, code, exercises };
}

// ---------------------------------------------------------------------------
// Week 1
// ---------------------------------------------------------------------------

const week1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Challenge Workout W1/D1', 'W1/D1', [
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20], 'super_set'),
      s('SB folding chairs', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W1/D2', 'W1/D2', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('crunch with adduction (pelvic floor)', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Table top alternating towel arm slides', [10, 10, 10], 'super_set'),
      s('Low leg bent knee windmill', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W1/D3', 'W1/D3', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('lower leg lifts with block feet holds', [15, 15, 15], 'super_set'),
      s('supported hip dead bug', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W1/D4', 'W1/D4', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('medicine ball dead bugs', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Pallof cable press', [12, 12, 12], 'super_set'),
      s('crunch with adduction (pelvic floor)', [15, 15, 15], 'super_set', { restSeconds: 15 }),
    ]),
    day('Challenge Workout W1/D5', 'W1/D5', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('KB pull over with glute bridge', [12, 12, 12], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [15, 15, 15], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 2
// ---------------------------------------------------------------------------

const week2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Challenge Workout W2/D1', 'W2/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'super_set', { timeSeconds: 10, restSeconds: 20 }),
      s('Table top alternating towel arm slides', [20, 20, 20], 'super_set'),
      s('stability ball knee tucks', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W2/D2', 'W2/D2', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('weighted stability ball crunch', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('MB pelvic floor heel taps', [20, 20, 20], 'super_set'),
      s('KB pull over with glute bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W2/D3', 'W2/D3', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('Bench low leg lifts with glute raise', [15, 15, 15], 'super_set'),
      s('medicine ball dead bugs', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W2/D4', 'W2/D4', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('supported hip dead bug', [20, 20, 20], 'super_set'),
      s('Lower leg windmill', [12, 12, 12], 'super_set', { restSeconds: 15 }),
    ]),
    day('Challenge Workout W2/D5', 'W2/D5', [
      s('SB stomach Vaccum', [1, 1, 1], 'super_set', { timeSeconds: 15 }),
      s('SB folding chairs', [15, 15, 15], 'super_set', { restSeconds: 15 }),
      s('Lower Leg bent knee windmill with block', [12, 12, 12], 'super_set'),
      s('medicine ball crunch', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 3
// ---------------------------------------------------------------------------

const week3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Challenge Workout W3/D1', 'W3/D1', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W3/D2', 'W3/D2', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('medicine ball dead bugs', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('crunch with adduction (pelvic floor)', [20, 20, 20], 'super_set'),
      s('Lower leg windmill', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W3/D3', 'W3/D3', [
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('SB folding chairs', [20, 20, 20], 'super_set'),
      s('Pallof cable press', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W3/D4', 'W3/D4', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('lower leg lifts with block feet holds', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('KB pull over with glute bridge', [15, 15, 15], 'super_set'),
      s('supported hip dead bug', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W3/D5', 'W3/D5', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('Bench low leg lifts with glute raise', [20, 20, 20], 'super_set'),
      s('weighted stability ball crunch', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 4
// ---------------------------------------------------------------------------

const week4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Challenge Workout W4/D1', 'W4/D1', [
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Table top alternating towel arm slides', [20, 20, 20], 'super_set'),
      s('stability ball knee tucks', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W4/D2', 'W4/D2', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('crunch with adduction (pelvic floor)', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('MB pelvic floor heel taps', [20, 20, 20], 'super_set'),
      s('Lower Leg bent knee windmill with block', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W4/D3', 'W4/D3', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
      s('medicine ball dead bugs', [20, 20, 20], 'super_set'),
      s('Pallof cable press', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W4/D4', 'W4/D4', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('medicine ball crunch', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W4/D5', 'W4/D5', [
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
      s('SB folding chairs', [20, 20, 20], 'super_set'),
      s('KB pull over with glute bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 5 (progression: 4 sets)
// ---------------------------------------------------------------------------

const week5: WorkoutWeek = {
  weekNumber: 5,
  days: [
    day('Challenge Workout W5/D1', 'W5/D1', [
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20, 20], 'super_set'),
      s('SB folding chairs', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W5/D2', 'W5/D2', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('crunch with adduction (pelvic floor)', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Table top alternating towel arm slides', [15, 15, 15, 15], 'super_set'),
      s('Lower leg windmill', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W5/D3', 'W5/D3', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
      s('lower leg lifts with block feet holds', [20, 20, 20, 20], 'super_set'),
      s('supported hip dead bug', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W5/D4', 'W5/D4', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('medicine ball dead bugs', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Pallof cable press', [15, 15, 15, 15], 'super_set'),
      s('crunch with adduction (pelvic floor)', [20, 20, 20, 20], 'super_set', { restSeconds: 15 }),
    ]),
    day('Challenge Workout W5/D5', 'W5/D5', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('KB pull over with glute bridge', [15, 15, 15, 15], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20, 20], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 6
// ---------------------------------------------------------------------------

const week6: WorkoutWeek = {
  weekNumber: 6,
  days: [
    day('Challenge Workout W6/D1', 'W6/D1', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20, 20], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W6/D2', 'W6/D2', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('weighted stability ball crunch', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('MB pelvic floor heel taps', [20, 20, 20, 20], 'super_set'),
      s('KB pull over with glute bridge', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W6/D3', 'W6/D3', [
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('SB folding chairs', [20, 20, 20, 20], 'super_set'),
      s('Pallof cable press', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W6/D4', 'W6/D4', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('lower leg lifts with block feet holds', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('supported hip dead bug', [20, 20, 20, 20], 'super_set'),
      s('medicine ball crunch', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W6/D5', 'W6/D5', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('Bench low leg lifts with glute raise', [20, 20, 20, 20], 'super_set'),
      s('stability ball knee tucks', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 7
// ---------------------------------------------------------------------------

const week7: WorkoutWeek = {
  weekNumber: 7,
  days: [
    day('Challenge Workout W7/D1', 'W7/D1', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('medicine ball dead bugs', [20, 20, 20, 20], 'super_set'),
      s('crunch with adduction (pelvic floor)', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W7/D2', 'W7/D2', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Table top alternating towel arm slides', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Lower Leg bent knee windmill with block', [15, 15, 15, 15], 'super_set'),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W7/D3', 'W7/D3', [
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20, 20], 'super_set'),
      s('Pallof cable press', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W7/D4', 'W7/D4', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('weighted stability ball crunch', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('KB pull over with glute bridge', [15, 15, 15, 15], 'super_set'),
      s('supported hip dead bug', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W7/D5', 'W7/D5', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('SB folding chairs', [20, 20, 20, 20], 'super_set'),
      s('MB pelvic floor heel taps', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Week 8
// ---------------------------------------------------------------------------

const week8: WorkoutWeek = {
  weekNumber: 8,
  days: [
    day('Challenge Workout W8/D1', 'W8/D1', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('Alternating knee to elbow towel slides', [20, 20, 20, 20], 'super_set'),
      s('SB folding chairs', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W8/D2', 'W8/D2', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('crunch with adduction (pelvic floor)', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Lower Leg bent knee windmill with block', [15, 15, 15, 15], 'super_set'),
      s('stability ball knee tucks', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W8/D3', 'W8/D3', [
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('medicine ball dead bugs', [20, 20, 20, 20], 'super_set'),
      s('Pallof cable press', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W8/D4', 'W8/D4', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Table top alternating towel arm slides', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('Table Top Knee Taps with Block Adduction', [20, 20, 20, 20], 'super_set'),
      s('Lower leg windmill', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Challenge Workout W8/D5', 'W8/D5', [
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('KB pull over with glute bridge', [15, 15, 15, 15], 'super_set'),
      s('weighted stability ball crunch', [20, 20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export const CORE_CHALLENGE: WorkoutProgram = {
  id: 'jamie-core-challenge-8wk',
  name: '8-Week Core & Pelvic Floor Challenge',
  description:
    'Jamie Esposito\'s signature 8-week core strengthening and pelvic floor rehabilitation ' +
    'program. Progressive overload from 3 sets (Weeks 1-4) to 4 sets (Weeks 5-8) with ' +
    'increasing hold times and rep counts. 5 workouts per week targeting deep core stability, ' +
    'pelvic floor engagement, and functional core strength.',
  createdBy: 'Jamie Esposito',
  category: ['core', 'pelvic_floor', 'challenge'],
  difficulty: 'all_levels',
  weeks: [week1, week2, week3, week4, week5, week6, week7, week8],
  durationWeeks: 8,
  isPremium: false, // Flagship free program
  imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80',
  tags: [
    'core',
    'pelvic floor',
    'stability ball',
    'postpartum',
    'beginner friendly',
    'progressive overload',
    '8 week challenge',
  ],
};

// ===========================================================================
// 90 Day BOOTY Challenge (12 weeks — first 4 shown)
// ===========================================================================

const booty_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Activation W1', 'BC-W1/D1', [
      s('Banded Glute Bridge', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Banded Clamshell', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Fire Hydrant', [12, 12, 12], 'super_set'),
      s('Donkey Kicks', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Build W1', 'BC-W1/D2', [
      s('Barbell Hip Thrust', [12, 12, 12], 'normal', { restSeconds: 60 }),
      s('Bulgarian Split Squat', [10, 10, 10], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [12, 12, 12], 'super_set'),
      s('Banded Lateral Walk', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Bonus W1', 'BC-W1/D3', [
      s('Jump Squat', [15, 15, 15], 'super_set'),
      s('Curtsy Lunge', [12, 12, 12], 'super_set'),
      s('Glute Bridge March', [20, 20, 20], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

const booty_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Activation W2', 'BC-W2/D1', [
      s('Banded Glute Bridge', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Banded Clamshell', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Single Leg Glute Bridge', [12, 12, 12], 'super_set'),
      s('Fire Hydrant', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Build W2', 'BC-W2/D2', [
      s('Barbell Hip Thrust', [12, 12, 12, 12], 'normal', { restSeconds: 60 }),
      s('Bulgarian Split Squat', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [15, 15, 15], 'super_set'),
      s('Banded Abduction on Machine', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Bonus W2', 'BC-W2/D3', [
      s('Jump Squat', [18, 18, 18], 'super_set'),
      s('Reverse Lunge', [12, 12, 12], 'super_set'),
      s('Glute Bridge March', [20, 20, 20], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

const booty_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Activation W3', 'BC-W3/D1', [
      s('Banded Glute Bridge', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Side Lying Abduction', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Single Leg Glute Bridge', [12, 12, 12], 'super_set'),
      s('Donkey Kicks', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Build W3', 'BC-W3/D2', [
      s('Barbell Hip Thrust', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Sumo Squat', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Pull Through', [12, 12, 12], 'super_set'),
      s('Banded Lateral Walk', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Bonus W3', 'BC-W3/D3', [
      s('Jump Squat', [20, 20, 20], 'super_set'),
      s('Curtsy Lunge', [15, 15, 15], 'super_set'),
      s('Squat Pulse', [20, 20, 20], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

const booty_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Activation W4', 'BC-W4/D1', [
      s('Banded Glute Bridge', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Banded Clamshell', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Side Lying Abduction', [15, 15, 15], 'super_set'),
      s('Fire Hydrant', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Build W4', 'BC-W4/D2', [
      s('Barbell Hip Thrust', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Bulgarian Split Squat', [12, 12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [15, 15, 15], 'super_set'),
      s('Banded Abduction on Machine', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Bonus W4', 'BC-W4/D3', [
      s('Burpee', [10, 10, 10], 'super_set'),
      s('Jump Squat', [20, 20, 20], 'super_set'),
      s('Reverse Lunge', [15, 15, 15], 'super_set', { restSeconds: 15 }),
    ]),
  ],
};

export const BOOTY_CHALLENGE: WorkoutProgram = {
  id: 'booty-challenge-90day',
  name: '90 Day BOOTY Challenge',
  description:
    'A 12-week glute-focused program with 3 workouts per week: Activation (glute firing), ' +
    'Build (heavy compound lifts), and a bonus HIIT circuit. Gym and home versions available. ' +
    'Progressive overload across 3 phases. First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['glutes', 'lower_body', 'challenge'],
  difficulty: 'intermediate',
  weeks: [booty_w1, booty_w2, booty_w3, booty_w4],
  durationWeeks: 12,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&q=80',
  tags: ['glutes', 'booty', 'hip thrust', 'activation', 'HIIT', '90 day challenge', 'gym', 'home'],
};

// ===========================================================================
// Lean & Mean I (8 weeks — first 4 shown)
// ===========================================================================

const lm_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Upper Push W1', 'LM-W1/D1', [
      s('Dumbbell Chest Press', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Tricep Pushdown', [15, 15, 15], 'super_set'),
      s('Push Up', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower W1', 'LM-W1/D2', [
      s('Barbell Back Squat', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Leg Press', [12, 12, 12], 'super_set'),
      s('Calf Raise', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Upper Pull W1', 'LM-W1/D3', [
      s('Lat Pulldown', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Seated Cable Row', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Bicep Curl', [12, 12, 12], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W1', 'LM-W1/D4', [
      s('Kettlebell Swing', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [12, 12, 12], 'super_set'),
      s('Renegade Row', [10, 10, 10], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
  ],
};

const lm_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Upper Push W2', 'LM-W2/D1', [
      s('Dumbbell Chest Press', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Arnold Press', [10, 10, 10], 'normal', { restSeconds: 45 }),
      s('Tricep Pushdown', [15, 15, 15], 'super_set'),
      s('Incline Push Up', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower W2', 'LM-W2/D2', [
      s('Barbell Back Squat', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Walking Lunge', [12, 12, 12], 'super_set'),
      s('Leg Curl', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Upper Pull W2', 'LM-W2/D3', [
      s('Lat Pulldown', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Row', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W2', 'LM-W2/D4', [
      s('Kettlebell Swing', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [15, 15, 15], 'super_set'),
      s('Renegade Row', [12, 12, 12], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 40, restSeconds: 15 }),
    ]),
  ],
};

const lm_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Upper Push W3', 'LM-W3/D1', [
      s('Barbell Bench Press', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Chest Fly', [12, 12, 12], 'super_set'),
      s('Skull Crusher', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower W3', 'LM-W3/D2', [
      s('Barbell Back Squat', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Sumo Deadlift', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Leg Extension', [15, 15, 15], 'super_set'),
      s('Leg Curl', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Upper Pull W3', 'LM-W3/D3', [
      s('Pull Up', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Seated Cable Row', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Bicep Curl', [15, 15, 15], 'super_set'),
      s('Reverse Fly', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W3', 'LM-W3/D4', [
      s('Kettlebell Swing', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [10, 10, 10], 'super_set'),
      s('Renegade Row', [12, 12, 12], 'super_set'),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
    ]),
  ],
};

const lm_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Upper Push W4', 'LM-W4/D1', [
      s('Barbell Bench Press', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Arnold Press', [10, 10, 10, 10], 'normal', { restSeconds: 45 }),
      s('Cable Chest Fly', [15, 15, 15], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower W4', 'LM-W4/D2', [
      s('Barbell Back Squat', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Walking Lunge', [15, 15, 15], 'super_set'),
      s('Calf Raise', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Upper Pull W4', 'LM-W4/D3', [
      s('Pull Up', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Dumbbell Row', [12, 12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W4', 'LM-W4/D4', [
      s('Kettlebell Swing', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [12, 12, 12], 'super_set'),
      s('Push Up', [20, 20, 20], 'super_set'),
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
    ]),
  ],
};

export const LEAN_AND_MEAN: WorkoutProgram = {
  id: 'lean-and-mean-1',
  name: 'Lean & Mean I',
  description:
    'An 8-week push/pull/lower/full-body split designed to build lean muscle and ' +
    'improve overall conditioning. 4 training days per week with progressive overload. ' +
    'First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['strength', 'hypertrophy', 'full_body'],
  difficulty: 'intermediate',
  weeks: [lm_w1, lm_w2, lm_w3, lm_w4],
  durationWeeks: 8,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80',
  tags: ['lean', 'muscle building', 'push pull', 'strength', '8 week', 'gym'],
};

// ===========================================================================
// Posture & Core Restore (6 weeks — first 4 shown)
// ===========================================================================

const pcr_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Posture Restore W1/D1', 'PCR-W1/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 10, restSeconds: 20 }),
      s('Chin Tuck Hold', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Wall Angel', [10, 10, 10], 'normal', { restSeconds: 30 }),
    ]),
    day('Posture Restore W1/D2', 'PCR-W1/D2', [
      s('crunch with adduction (pelvic floor)', [12, 12, 12], 'normal', { restSeconds: 15 }),
      s('supported hip dead bug', [12, 12, 12], 'super_set'),
      s('Cat Cow Stretch', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
    day('Posture Restore W1/D3', 'PCR-W1/D3', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 10, restSeconds: 20 }),
      s('Banded Pull Apart', [12, 12, 12], 'super_set'),
      s('Prone Y Raise', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const pcr_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Posture Restore W2/D1', 'PCR-W2/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 20 }),
      s('Chin Tuck Hold', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Wall Angel', [12, 12, 12], 'normal', { restSeconds: 30 }),
    ]),
    day('Posture Restore W2/D2', 'PCR-W2/D2', [
      s('crunch with adduction (pelvic floor)', [15, 15, 15], 'normal', { restSeconds: 15 }),
      s('medicine ball dead bugs', [15, 15, 15], 'super_set'),
      s('Cat Cow Stretch', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Posture Restore W2/D3', 'PCR-W2/D3', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 20 }),
      s('Banded Pull Apart', [15, 15, 15], 'super_set'),
      s('Prone Y Raise', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const pcr_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Posture Restore W3/D1', 'PCR-W3/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Chin Tuck Hold', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
    ]),
    day('Posture Restore W3/D2', 'PCR-W3/D2', [
      s('Table top alternating towel arm slides', [12, 12, 12], 'normal', { restSeconds: 15 }),
      s('supported hip dead bug', [15, 15, 15], 'super_set'),
      s('Face Pull', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Posture Restore W3/D3', 'PCR-W3/D3', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Banded Pull Apart', [15, 15, 15], 'super_set'),
      s('Back Extension', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const pcr_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Posture Restore W4/D1', 'PCR-W4/D1', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Chin Tuck Hold', [1, 1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('Posture Restore W4/D2', 'PCR-W4/D2', [
      s('Table top alternating towel arm slides', [15, 15, 15], 'normal', { restSeconds: 15 }),
      s('medicine ball dead bugs', [15, 15, 15], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Posture Restore W4/D3', 'PCR-W4/D3', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Prone Y Raise', [12, 12, 12, 12], 'super_set'),
      s('Back Extension', [12, 12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

export const POSTURE_CORE_RESTORE: WorkoutProgram = {
  id: 'posture-core-restore-6wk',
  name: 'Posture & Core Restore',
  description:
    'A 6-week corrective program targeting posture and deep core. Includes stomach vacuums, ' +
    'pelvic floor work, kegel cues, and upper back strengthening. Great for postpartum, ' +
    'desk workers, and anyone with posture issues. 3 workouts per week, 20-30 min each. ' +
    'First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['core', 'posture', 'corrective'],
  difficulty: 'beginner',
  weeks: [pcr_w1, pcr_w2, pcr_w3, pcr_w4],
  durationWeeks: 6,
  isPremium: false,
  imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80',
  tags: ['posture', 'core', 'pelvic floor', 'postpartum', 'beginner', 'corrective', 'rehab'],
};

// ===========================================================================
// 14-Day Trial Program (4 weeks including prep and follow-up)
// ===========================================================================

const trial_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Trial Full Body A', 'TR-W1/D1', [
      s('Goblet Squat', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Push Up', [10, 10, 10], 'normal', { restSeconds: 30 }),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
    ]),
    day('Trial Cardio A', 'TR-W1/D2', [
      s('Jump Rope', [1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 30 }),
      s('Burpee', [8, 8, 8], 'super_set'),
      s('Mountain Climber', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Trial Full Body B', 'TR-W1/D3', [
      s('Reverse Lunge', [10, 10, 10], 'normal', { restSeconds: 45 }),
      s('Dumbbell Shoulder Press', [10, 10, 10], 'normal', { restSeconds: 30 }),
      s('Lat Pulldown', [12, 12, 12], 'super_set'),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
    ]),
  ],
};

const trial_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Trial Full Body A+', 'TR-W2/D1', [
      s('Goblet Squat', [15, 15, 15], 'normal', { restSeconds: 45 }),
      s('Push Up', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('Trial Cardio B', 'TR-W2/D2', [
      s('Jump Rope', [1, 1, 1], 'normal', { timeSeconds: 90, restSeconds: 30 }),
      s('Burpee', [10, 10, 10], 'super_set'),
      s('Mountain Climber', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Trial Full Body B+', 'TR-W2/D3', [
      s('Reverse Lunge', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('Seated Cable Row', [12, 12, 12], 'super_set'),
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
    ]),
  ],
};

export const TRIAL_PROGRAM: WorkoutProgram = {
  id: '14-day-trial',
  name: '14-Day Trial Program',
  description:
    'A 2-week starter program perfect for new clients. Includes full-body workouts ' +
    'and cardio sessions to assess fitness level and build a training foundation. ' +
    '3 workouts per week.',
  createdBy: 'Jamie Esposito',
  category: ['full_body', 'starter', 'trial'],
  difficulty: 'beginner',
  weeks: [trial_w1, trial_w2],
  durationWeeks: 2,
  isPremium: false,
  imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  tags: ['trial', 'beginner', 'starter', 'full body', 'assessment', '2 week'],
};

// ===========================================================================
// TRX (4 weeks)
// ===========================================================================

const trx_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('TRX Upper W1', 'TRX-W1/D1', [
      s('TRX Chest Press', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('TRX Row', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('TRX Tricep Extension', [12, 12, 12], 'super_set'),
      s('TRX Bicep Curl', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Lower W1', 'TRX-W1/D2', [
      s('TRX Squat', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Lunge', [10, 10, 10], 'normal', { restSeconds: 30 }),
      s('TRX Hamstring Curl', [12, 12, 12], 'super_set'),
      s('TRX Hip Drop', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Core W1', 'TRX-W1/D3', [
      s('TRX Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('TRX Pike', [10, 10, 10], 'super_set'),
      s('TRX Mountain Climber', [15, 15, 15], 'super_set'),
      s('TRX Oblique Crunch', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX HIIT W1', 'TRX-W1/D4', [
      s('TRX Squat Jump', [10, 10, 10], 'super_set'),
      s('TRX Chest Press', [10, 10, 10], 'super_set'),
      s('TRX Row', [10, 10, 10], 'super_set'),
      s('TRX Burpee', [8, 8, 8], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const trx_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('TRX Upper W2', 'TRX-W2/D1', [
      s('TRX Chest Press', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Row', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Tricep Extension', [15, 15, 15], 'super_set'),
      s('TRX Bicep Curl', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Lower W2', 'TRX-W2/D2', [
      s('TRX Single Leg Squat', [8, 8, 8], 'normal', { restSeconds: 30 }),
      s('TRX Lunge', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('TRX Hamstring Curl', [15, 15, 15], 'super_set'),
      s('Dumbbell Goblet Squat', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Core W2', 'TRX-W2/D3', [
      s('TRX Plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
      s('TRX Pike', [12, 12, 12], 'super_set'),
      s('TRX Mountain Climber', [20, 20, 20], 'super_set'),
      s('TRX Oblique Crunch', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX HIIT W2', 'TRX-W2/D4', [
      s('TRX Squat Jump', [12, 12, 12], 'super_set'),
      s('TRX Chest Press', [12, 12, 12], 'super_set'),
      s('TRX Row', [12, 12, 12], 'super_set'),
      s('TRX Burpee', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const trx_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('TRX Upper W3', 'TRX-W3/D1', [
      s('TRX Chest Press', [15, 15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Row', [15, 15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Tricep Extension', [12, 12, 12, 12], 'super_set'),
      s('TRX Bicep Curl', [12, 12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Lower W3', 'TRX-W3/D2', [
      s('TRX Single Leg Squat', [10, 10, 10], 'normal', { restSeconds: 30 }),
      s('TRX Lunge', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Hamstring Curl', [15, 15, 15], 'super_set'),
      s('Dumbbell Reverse Lunge', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Core W3', 'TRX-W3/D3', [
      s('TRX Plank', [1, 1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
      s('TRX Pike', [12, 12, 12], 'super_set'),
      s('TRX Knee Tuck', [15, 15, 15], 'super_set'),
      s('TRX Oblique Crunch', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX HIIT W3', 'TRX-W3/D4', [
      s('TRX Squat Jump', [15, 15, 15], 'super_set'),
      s('TRX Chest Press', [15, 15, 15], 'super_set'),
      s('TRX Row', [15, 15, 15], 'super_set'),
      s('TRX Burpee', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const trx_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('TRX Upper W4', 'TRX-W4/D1', [
      s('TRX Chest Press', [15, 15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Row', [15, 15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Tricep Extension', [15, 15, 15, 15], 'super_set'),
      s('TRX Bicep Curl', [15, 15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Lower W4', 'TRX-W4/D2', [
      s('TRX Single Leg Squat', [10, 10, 10, 10], 'normal', { restSeconds: 30 }),
      s('TRX Lunge', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('TRX Hamstring Curl', [15, 15, 15, 15], 'super_set'),
      s('Dumbbell Sumo Squat', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX Core W4', 'TRX-W4/D3', [
      s('TRX Plank', [1, 1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 15 }),
      s('TRX Pike', [15, 15, 15], 'super_set'),
      s('TRX Knee Tuck', [15, 15, 15], 'super_set'),
      s('TRX Mountain Climber', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('TRX HIIT W4', 'TRX-W4/D4', [
      s('TRX Squat Jump', [15, 15, 15], 'super_set'),
      s('TRX Chest Press', [15, 15, 15], 'super_set'),
      s('TRX Row', [15, 15, 15], 'super_set'),
      s('TRX Burpee', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

export const TRX_PROGRAM: WorkoutProgram = {
  id: 'trx-functional-4wk',
  name: 'TRX Functional Training',
  description:
    'A 4-week TRX suspension training program focusing on functional movement patterns, ' +
    'core stability, and cardiovascular conditioning. Requires a TRX and a set of dumbbells. ' +
    '4 workouts per week: upper, lower, core, and HIIT.',
  createdBy: 'Jamie Esposito',
  category: ['functional', 'trx', 'full_body'],
  difficulty: 'intermediate',
  weeks: [trx_w1, trx_w2, trx_w3, trx_w4],
  durationWeeks: 4,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=600&q=80',
  tags: ['TRX', 'suspension', 'functional', 'core', 'HIIT', 'home', '4 week'],
};

// ===========================================================================
// LL HIIT (4 weeks)
// ===========================================================================

const hiit_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('HIIT W1/D1', 'HIIT-W1/D1', [
      s('Burpee', [10, 10, 10], 'super_set'),
      s('Jump Squat', [15, 15, 15], 'super_set'),
      s('Mountain Climber', [20, 20, 20], 'super_set'),
      s('Push Up', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W1/D2', 'HIIT-W1/D2', [
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Kettlebell Swing', [15, 15, 15], 'super_set'),
      s('Plank Jacks', [15, 15, 15], 'super_set'),
      s('Reverse Lunge', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W1/D3', 'HIIT-W1/D3', [
      s('Jump Rope', [1, 1, 1], 'super_set', { timeSeconds: 60 }),
      s('Dumbbell Thruster', [12, 12, 12], 'super_set'),
      s('Bicycle Crunch', [20, 20, 20], 'super_set'),
      s('Box Jump', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W1/D4', 'HIIT-W1/D4', [
      s('Lateral Shuffle', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Goblet Squat', [15, 15, 15], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('HIIT W1/D5', 'HIIT-W1/D5', [
      s('Burpee', [12, 12, 12], 'super_set'),
      s('Kettlebell Swing', [20, 20, 20], 'super_set'),
      s('Mountain Climber', [20, 20, 20], 'super_set'),
      s('Jump Squat', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const hiit_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('HIIT W2/D1', 'HIIT-W2/D1', [
      s('Burpee', [12, 12, 12], 'super_set'),
      s('Jump Squat', [18, 18, 18], 'super_set'),
      s('Mountain Climber', [25, 25, 25], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W2/D2', 'HIIT-W2/D2', [
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 40 }),
      s('Kettlebell Swing', [18, 18, 18], 'super_set'),
      s('Plank Jacks', [18, 18, 18], 'super_set'),
      s('Walking Lunge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W2/D3', 'HIIT-W2/D3', [
      s('Jump Rope', [1, 1, 1], 'super_set', { timeSeconds: 75 }),
      s('Dumbbell Thruster', [15, 15, 15], 'super_set'),
      s('Bicycle Crunch', [25, 25, 25], 'super_set'),
      s('Box Jump', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT W2/D4', 'HIIT-W2/D4', [
      s('Lateral Shuffle', [1, 1, 1], 'super_set', { timeSeconds: 40 }),
      s('Goblet Squat', [18, 18, 18], 'super_set'),
      s('Push Up', [18, 18, 18], 'super_set'),
      s('Up And Down Plank', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
    ]),
    day('HIIT W2/D5', 'HIIT-W2/D5', [
      s('Burpee', [15, 15, 15], 'super_set'),
      s('Kettlebell Swing', [20, 20, 20], 'super_set'),
      s('Mountain Climber', [25, 25, 25], 'super_set'),
      s('Jump Squat', [18, 18, 18], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const hiit_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('HIIT W3/D1', 'HIIT-W3/D1', [
      s('Burpee', [15, 15, 15], 'super_set'),
      s('Jump Squat', [20, 20, 20], 'super_set'),
      s('Mountain Climber', [30, 30, 30], 'super_set'),
      s('Push Up', [18, 18, 18], 'super_set', { restSeconds: 25 }),
    ]),
    day('HIIT W3/D2', 'HIIT-W3/D2', [
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Kettlebell Swing', [20, 20, 20], 'super_set'),
      s('Plank Jacks', [20, 20, 20], 'super_set'),
      s('Curtsy Lunge', [15, 15, 15], 'super_set', { restSeconds: 25 }),
    ]),
    day('HIIT W3/D3', 'HIIT-W3/D3', [
      s('Jump Rope', [1, 1, 1], 'super_set', { timeSeconds: 90 }),
      s('Dumbbell Thruster', [15, 15, 15], 'super_set'),
      s('Bicycle Crunch', [30, 30, 30], 'super_set'),
      s('Box Jump', [12, 12, 12], 'super_set', { restSeconds: 25 }),
    ]),
    day('HIIT W3/D4', 'HIIT-W3/D4', [
      s('Lateral Shuffle', [1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Goblet Squat', [20, 20, 20], 'super_set'),
      s('Diamond Push Up', [12, 12, 12], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
    ]),
    day('HIIT W3/D5', 'HIIT-W3/D5', [
      s('Burpee', [15, 15, 15], 'super_set'),
      s('Kettlebell Swing', [25, 25, 25], 'super_set'),
      s('Mountain Climber', [30, 30, 30], 'super_set'),
      s('Jump Squat', [20, 20, 20], 'super_set', { restSeconds: 25 }),
    ]),
  ],
};

const hiit_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('HIIT W4/D1', 'HIIT-W4/D1', [
      s('Burpee', [15, 15, 15, 15], 'super_set'),
      s('Jump Squat', [20, 20, 20, 20], 'super_set'),
      s('Mountain Climber', [30, 30, 30, 30], 'super_set'),
      s('Push Up', [20, 20, 20, 20], 'super_set', { restSeconds: 20 }),
    ]),
    day('HIIT W4/D2', 'HIIT-W4/D2', [
      s('High Knees', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Kettlebell Swing', [25, 25, 25], 'super_set'),
      s('Plank Jacks', [20, 20, 20, 20], 'super_set'),
      s('Walking Lunge', [20, 20, 20], 'super_set', { restSeconds: 20 }),
    ]),
    day('HIIT W4/D3', 'HIIT-W4/D3', [
      s('Jump Rope', [1, 1, 1], 'super_set', { timeSeconds: 90 }),
      s('Dumbbell Thruster', [15, 15, 15, 15], 'super_set'),
      s('Bicycle Crunch', [30, 30, 30, 30], 'super_set'),
      s('Box Jump', [15, 15, 15], 'super_set', { restSeconds: 20 }),
    ]),
    day('HIIT W4/D4', 'HIIT-W4/D4', [
      s('Lateral Shuffle', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Goblet Squat', [20, 20, 20, 20], 'super_set'),
      s('Diamond Push Up', [15, 15, 15], 'super_set'),
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
    ]),
    day('HIIT W4/D5', 'HIIT-W4/D5', [
      s('Burpee', [15, 15, 15, 15], 'super_set'),
      s('Kettlebell Swing', [25, 25, 25, 25], 'super_set'),
      s('Mountain Climber', [30, 30, 30, 30], 'super_set'),
      s('Jump Squat', [20, 20, 20, 20], 'super_set', { restSeconds: 20 }),
    ]),
  ],
};

export const LL_HIIT: WorkoutProgram = {
  id: 'll-hiit-4wk',
  name: 'Lusciously Lean HIIT',
  description:
    'A 4-week home HIIT program with 5 AMRAP-style workouts per week, each 30 min or less. ' +
    'Designed to increase lean muscle, cardiovascular health, and core stamina. Track your ' +
    'rounds and compete with yourself each week. Pair with 1-2 days of low intensity cardio.',
  createdBy: 'Jamie Esposito',
  category: ['hiit', 'cardio', 'conditioning'],
  difficulty: 'intermediate',
  weeks: [hiit_w1, hiit_w2, hiit_w3, hiit_w4],
  durationWeeks: 4,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=600&q=80',
  tags: ['HIIT', 'AMRAP', 'home', 'cardio', 'conditioning', 'fat loss', '30 min', '4 week'],
};

// ===========================================================================
// Compound Functional Movement (16 weeks — first 4 shown)
// ===========================================================================

const cfm_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Compound A W1', 'CFM-W1/D1', [
      s('Barbell Back Squat', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Barbell Deadlift', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Dumbbell Step Up', [10, 10, 10], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('Compound B W1', 'CFM-W1/D2', [
      s('Barbell Bench Press', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Barbell Row', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Dumbbell Shoulder Press', [10, 10, 10], 'super_set'),
      s('Dumbbell Bicep Curl', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Compound C W1', 'CFM-W1/D3', [
      s('Kettlebell Swing', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [12, 12, 12], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set'),
      s('Dumbbell Row', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const cfm_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Compound A W2', 'CFM-W2/D1', [
      s('Barbell Back Squat', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Walking Lunge', [12, 12, 12], 'super_set'),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('Compound B W2', 'CFM-W2/D2', [
      s('Barbell Bench Press', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Barbell Row', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Arnold Press', [10, 10, 10], 'super_set'),
      s('Tricep Pushdown', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Compound C W2', 'CFM-W2/D3', [
      s('Kettlebell Swing', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [10, 10, 10], 'super_set'),
      s('Renegade Row', [10, 10, 10], 'super_set'),
      s('Dumbbell Row', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const cfm_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Compound A W3', 'CFM-W3/D1', [
      s('Barbell Front Squat', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Barbell Deadlift', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Dumbbell Step Up', [12, 12, 12], 'super_set'),
      s('Pallof cable press', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Compound B W3', 'CFM-W3/D2', [
      s('Incline Dumbbell Press', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Pull Up', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Compound C W3', 'CFM-W3/D3', [
      s('Kettlebell Swing', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [15, 15, 15], 'super_set'),
      s('Push Up', [20, 20, 20], 'super_set'),
      s('medicine ball dead bugs', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const cfm_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Compound A W4', 'CFM-W4/D1', [
      s('Barbell Front Squat', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Sumo Deadlift', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Bulgarian Split Squat', [10, 10, 10], 'super_set'),
      s('Plank', [1, 1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
    ]),
    day('Compound B W4', 'CFM-W4/D2', [
      s('Barbell Bench Press', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Pull Up', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Arnold Press', [10, 10, 10, 10], 'super_set'),
      s('Hammer Curl', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Compound C W4', 'CFM-W4/D3', [
      s('Kettlebell Swing', [20, 20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [12, 12, 12], 'super_set'),
      s('Renegade Row', [12, 12, 12], 'super_set'),
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 30 }),
    ]),
  ],
};

export const COMPOUND_FUNCTIONAL: WorkoutProgram = {
  id: 'compound-functional-16wk',
  name: 'Compound Functional Movement',
  description:
    'A 16-week progressive program focused on compound multi-plane movements. ' +
    '3 workouts per week (A/B/C split) emphasizing squat, deadlift, press, and pull patterns. ' +
    'Ideal for building functional strength. First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['strength', 'functional', 'compound'],
  difficulty: 'intermediate',
  weeks: [cfm_w1, cfm_w2, cfm_w3, cfm_w4],
  durationWeeks: 16,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=600&q=80',
  tags: ['compound', 'functional', 'strength', 'barbell', 'progressive', '16 week', 'gym'],
};

// ===========================================================================
// Nutrition Bootcamp (12 weeks — first 4 shown, education + movement)
// ===========================================================================

const nb_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Gut Health Movement W1/D1', 'NB-W1/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 10, restSeconds: 20 }),
      s('Cat Cow Stretch', [10, 10, 10], 'normal', { restSeconds: 15 }),
      s('Glute Bridge', [15, 15, 15], 'super_set'),
      s('supported hip dead bug', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Gut Health Movement W1/D2', 'NB-W1/D2', [
      s('Walking Lunge', [10, 10, 10], 'normal', { restSeconds: 30 }),
      s('Push Up', [10, 10, 10], 'super_set'),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
    ]),
  ],
};

const nb_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Gut Health Movement W2/D1', 'NB-W2/D1', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 20 }),
      s('Cat Cow Stretch', [12, 12, 12], 'normal', { restSeconds: 15 }),
      s('Glute Bridge', [15, 15, 15], 'super_set'),
      s('medicine ball dead bugs', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Gut Health Movement W2/D2', 'NB-W2/D2', [
      s('Reverse Lunge', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('Push Up', [12, 12, 12], 'super_set'),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 25, restSeconds: 15 }),
    ]),
  ],
};

const nb_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Energy Movement W3/D1', 'NB-W3/D1', [
      s('Goblet Squat', [12, 12, 12], 'normal', { restSeconds: 30 }),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Dumbbell Shoulder Press', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
    day('Energy Movement W3/D2', 'NB-W3/D2', [
      s('Kettlebell Swing', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Bicycle Crunch', [15, 15, 15], 'super_set'),
      s('Glute Bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const nb_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Energy Movement W4/D1', 'NB-W4/D1', [
      s('Goblet Squat', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Energy Movement W4/D2', 'NB-W4/D2', [
      s('Kettlebell Swing', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
      s('Banded Glute Bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

export const NUTRITION_BOOTCAMP: WorkoutProgram = {
  id: 'nutrition-bootcamp-12wk',
  name: 'Nutrition Bootcamp',
  description:
    'A 12-week education-focused program combining nutrition science with movement. ' +
    'Month 1: The Gut. Month 2: Energy & making food your friend. Month 3: How nutrition ' +
    'and movement go hand in hand. Light workouts accompany the educational content. ' +
    'First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['nutrition', 'education', 'wellness'],
  difficulty: 'beginner',
  weeks: [nb_w1, nb_w2, nb_w3, nb_w4],
  durationWeeks: 12,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80',
  tags: ['nutrition', 'education', 'gut health', 'wellness', 'beginner', '12 week'],
};

// ===========================================================================
// Lusciously Lean BODYreCOMP 1.0 (8 weeks — first 4 shown)
// ===========================================================================

const br_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Upper Body W1', 'BR-W1/D1', [
      s('Barbell Bench Press', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Lat Pulldown', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'super_set'),
      s('Cable Chest Fly', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower Body W1', 'BR-W1/D2', [
      s('Barbell Back Squat', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Leg Press', [12, 12, 12], 'super_set'),
      s('Banded Glute Bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Arms & Abs W1', 'BR-W1/D3', [
      s('Dumbbell Bicep Curl', [12, 12, 12], 'super_set'),
      s('Tricep Pushdown', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Skull Crusher', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
    day('Glutes & Hamstrings W1', 'BR-W1/D4', [
      s('Barbell Hip Thrust', [12, 12, 12], 'normal', { restSeconds: 60 }),
      s('Leg Curl', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [12, 12, 12], 'super_set'),
      s('Banded Lateral Walk', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W1', 'BR-W1/D5', [
      s('Kettlebell Swing', [15, 15, 15], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [12, 12, 12], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set'),
      s('Dumbbell Row', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const br_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Upper Body W2', 'BR-W2/D1', [
      s('Barbell Bench Press', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Seated Cable Row', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Arnold Press', [10, 10, 10], 'super_set'),
      s('Reverse Fly', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower Body W2', 'BR-W2/D2', [
      s('Barbell Back Squat', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Sumo Deadlift', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Walking Lunge', [12, 12, 12], 'super_set'),
      s('Calf Raise', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Arms & Abs W2', 'BR-W2/D3', [
      s('Dumbbell Bicep Curl', [12, 12, 12, 12], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Tricep Pushdown', [15, 15, 15], 'super_set', { restSeconds: 30 }),
      s('Bicycle Crunch', [20, 20, 20], 'normal', { restSeconds: 15 }),
    ]),
    day('Glutes & Hamstrings W2', 'BR-W2/D4', [
      s('Barbell Hip Thrust', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Leg Curl', [12, 12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [15, 15, 15], 'super_set'),
      s('Banded Abduction on Machine', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W2', 'BR-W2/D5', [
      s('Kettlebell Swing', [18, 18, 18], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [10, 10, 10], 'super_set'),
      s('Renegade Row', [10, 10, 10], 'super_set'),
      s('SB plank', [1, 1, 1], 'normal', { timeSeconds: 30, restSeconds: 15 }),
    ]),
  ],
};

const br_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Upper Body W3', 'BR-W3/D1', [
      s('Incline Dumbbell Press', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Pull Up', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'super_set'),
      s('Cable Chest Fly', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower Body W3', 'BR-W3/D2', [
      s('Barbell Front Squat', [8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Romanian Deadlift', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Leg Extension', [15, 15, 15], 'super_set'),
      s('Banded Glute Bridge', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Arms & Abs W3', 'BR-W3/D3', [
      s('Dumbbell Bicep Curl', [15, 15, 15], 'super_set'),
      s('Skull Crusher', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('Hammer Curl', [15, 15, 15], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('medicine ball crunch', [20, 20, 20], 'normal', { restSeconds: 15 }),
    ]),
    day('Glutes & Hamstrings W3', 'BR-W3/D4', [
      s('Barbell Hip Thrust', [10, 10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Leg Curl', [15, 15, 15], 'normal', { restSeconds: 45 }),
      s('Single Leg Glute Bridge', [12, 12, 12], 'super_set'),
      s('Banded Lateral Walk', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W3', 'BR-W3/D5', [
      s('Kettlebell Swing', [20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Goblet Squat', [15, 15, 15], 'super_set'),
      s('Push Up', [20, 20, 20], 'super_set'),
      s('Dumbbell Row', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const br_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Upper Body W4', 'BR-W4/D1', [
      s('Barbell Bench Press', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Lat Pulldown', [12, 12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Arnold Press', [10, 10, 10, 10], 'super_set'),
      s('Face Pull', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('Lower Body W4', 'BR-W4/D2', [
      s('Barbell Back Squat', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Sumo Deadlift', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Bulgarian Split Squat', [10, 10, 10], 'super_set'),
      s('Calf Raise', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Arms & Abs W4', 'BR-W4/D3', [
      s('Dumbbell Bicep Curl', [15, 15, 15], 'super_set'),
      s('Tricep Pushdown', [15, 15, 15], 'super_set', { restSeconds: 30 }),
      s('Hammer Curl', [15, 15, 15], 'super_set'),
      s('Skull Crusher', [12, 12, 12], 'super_set', { restSeconds: 30 }),
      s('Up And Down Plank', [1, 1, 1, 1], 'super_set', { timeSeconds: 30 }),
    ]),
    day('Glutes & Hamstrings W4', 'BR-W4/D4', [
      s('Barbell Hip Thrust', [8, 8, 8, 8], 'normal', { restSeconds: 60 }),
      s('Leg Curl', [15, 15, 15], 'normal', { restSeconds: 45 }),
      s('Cable Kickback', [15, 15, 15], 'super_set'),
      s('Fire Hydrant', [20, 20, 20], 'super_set', { restSeconds: 30 }),
    ]),
    day('Full Body W4', 'BR-W4/D5', [
      s('Kettlebell Swing', [20, 20, 20, 20], 'normal', { restSeconds: 30 }),
      s('Dumbbell Thruster', [12, 12, 12], 'super_set'),
      s('Renegade Row', [12, 12, 12], 'super_set'),
      s('SB plank', [1, 1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 15 }),
    ]),
  ],
};

export const BODY_RECOMP: WorkoutProgram = {
  id: 'll-body-recomp-1',
  name: 'Lusciously Lean BODYreCOMP 1.0',
  description:
    'An 8-week body recomposition program with a heavy focus on nutrition and personalized macros. ' +
    '5 workouts per week: upper, lower, arms & abs, glutes & hamstrings, and full body. ' +
    'Includes gym and home versions. Low intensity cardio homework based on weight loss goals. ' +
    'First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['recomp', 'hypertrophy', 'fat_loss'],
  difficulty: 'intermediate',
  weeks: [br_w1, br_w2, br_w3, br_w4],
  durationWeeks: 8,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&q=80',
  tags: ['body recomp', 'lean', 'nutrition', 'macros', 'gym', 'home', '8 week', 'fat loss'],
};

// ===========================================================================
// SSD 2.0 — Summer Slim Down (8 weeks — first 4 shown)
// ===========================================================================

const ssd_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('PFM + Circuit W1/D1', 'SSD-W1/D1', [
      s('crunch with adduction (pelvic floor)', [15, 15, 15], 'normal', { restSeconds: 15 }),
      s('MB pelvic floor heel taps', [15, 15, 15], 'super_set'),
      s('supported hip dead bug', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W1/D2', 'SSD-W1/D2', [
      s('Jump Squat', [15, 15, 15], 'super_set'),
      s('Push Up', [12, 12, 12], 'super_set'),
      s('Mountain Climber', [20, 20, 20], 'super_set'),
      s('Kettlebell Swing', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('PFM + Strength W1/D3', 'SSD-W1/D3', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Goblet Squat', [12, 12, 12], 'super_set'),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Glute Bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W1/D4', 'SSD-W1/D4', [
      s('Burpee', [10, 10, 10], 'super_set'),
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 30 }),
      s('Bicycle Crunch', [20, 20, 20], 'super_set'),
      s('Box Jump', [10, 10, 10], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const ssd_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('PFM + Circuit W2/D1', 'SSD-W2/D1', [
      s('crunch with adduction (pelvic floor)', [18, 18, 18], 'normal', { restSeconds: 15 }),
      s('Table Top Knee Taps with Block Adduction', [15, 15, 15], 'super_set'),
      s('medicine ball dead bugs', [18, 18, 18], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W2/D2', 'SSD-W2/D2', [
      s('Jump Squat', [18, 18, 18], 'super_set'),
      s('Push Up', [15, 15, 15], 'super_set'),
      s('Mountain Climber', [25, 25, 25], 'super_set'),
      s('Kettlebell Swing', [18, 18, 18], 'super_set', { restSeconds: 30 }),
    ]),
    day('PFM + Strength W2/D3', 'SSD-W2/D3', [
      s('SB stomach Vaccum', [1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Goblet Squat', [15, 15, 15], 'super_set'),
      s('Dumbbell Shoulder Press', [12, 12, 12], 'super_set'),
      s('Banded Glute Bridge', [15, 15, 15], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W2/D4', 'SSD-W2/D4', [
      s('Burpee', [12, 12, 12], 'super_set'),
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 40 }),
      s('Bicycle Crunch', [25, 25, 25], 'super_set'),
      s('Box Jump', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
  ],
};

const ssd_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('PFM + Circuit W3/D1', 'SSD-W3/D1', [
      s('crunch with adduction (pelvic floor)', [20, 20, 20], 'normal', { restSeconds: 15 }),
      s('KB pull over with glute bridge', [12, 12, 12], 'super_set'),
      s('Lower leg windmill', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W3/D2', 'SSD-W3/D2', [
      s('Jump Squat', [20, 20, 20], 'super_set'),
      s('Push Up', [18, 18, 18], 'super_set'),
      s('Mountain Climber', [30, 30, 30], 'super_set'),
      s('Kettlebell Swing', [20, 20, 20], 'super_set', { restSeconds: 25 }),
    ]),
    day('PFM + Strength W3/D3', 'SSD-W3/D3', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 15, restSeconds: 15 }),
      s('Barbell Back Squat', [10, 10, 10], 'super_set'),
      s('Dumbbell Row', [12, 12, 12], 'super_set'),
      s('Barbell Hip Thrust', [12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W3/D4', 'SSD-W3/D4', [
      s('Burpee', [15, 15, 15], 'super_set'),
      s('High Knees', [1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Bicycle Crunch', [30, 30, 30], 'super_set'),
      s('Box Jump', [12, 12, 12], 'super_set', { restSeconds: 25 }),
    ]),
  ],
};

const ssd_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('PFM + Circuit W4/D1', 'SSD-W4/D1', [
      s('crunch with adduction (pelvic floor)', [20, 20, 20, 20], 'normal', { restSeconds: 15 }),
      s('SB folding chairs', [15, 15, 15, 15], 'super_set'),
      s('Pallof cable press', [12, 12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W4/D2', 'SSD-W4/D2', [
      s('Jump Squat', [20, 20, 20, 20], 'super_set'),
      s('Push Up', [20, 20, 20], 'super_set'),
      s('Mountain Climber', [30, 30, 30, 30], 'super_set'),
      s('Kettlebell Swing', [20, 20, 20, 20], 'super_set', { restSeconds: 20 }),
    ]),
    day('PFM + Strength W4/D3', 'SSD-W4/D3', [
      s('SB stomach Vaccum', [1, 1, 1, 1], 'normal', { timeSeconds: 20, restSeconds: 15 }),
      s('Barbell Back Squat', [10, 10, 10, 10], 'super_set'),
      s('Lat Pulldown', [12, 12, 12], 'super_set'),
      s('Barbell Hip Thrust', [12, 12, 12, 12], 'super_set', { restSeconds: 30 }),
    ]),
    day('HIIT Circuit W4/D4', 'SSD-W4/D4', [
      s('Burpee', [15, 15, 15, 15], 'super_set'),
      s('High Knees', [1, 1, 1, 1], 'super_set', { timeSeconds: 45 }),
      s('Bicycle Crunch', [30, 30, 30, 30], 'super_set'),
      s('Box Jump', [15, 15, 15], 'super_set', { restSeconds: 20 }),
    ]),
  ],
};

export const SSD_2: WorkoutProgram = {
  id: 'ssd-2-summer-slim-8wk',
  name: 'Summer Slim Down 2.0',
  description:
    'An 8-week follow-up program combining pelvic floor muscle (PFM) progressions with ' +
    'HIIT-style cardio circuits. Heavy nutrition focus — fruits and veggies should make up ' +
    'the majority of carb macros. 4 workouts per week alternating PFM and HIIT. ' +
    'First 4 weeks shown.',
  createdBy: 'Jamie Esposito',
  category: ['hiit', 'pelvic_floor', 'fat_loss'],
  difficulty: 'intermediate',
  weeks: [ssd_w1, ssd_w2, ssd_w3, ssd_w4],
  durationWeeks: 8,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80',
  tags: ['summer', 'slim down', 'HIIT', 'pelvic floor', 'nutrition', '8 week', 'fat loss'],
};

// ===========================================================================
// MEN'S BUILD — 4-week hypertrophy/strength block
// Upper/Lower split, 4 days/week. Compound-driven, progressive volume.
// Targets the "men's strength + size" audience that was missing from the
// existing curated programs (which lean toward toning / HIIT / female-
// audience offerings).
// ===========================================================================

const mb_w1: WorkoutWeek = {
  weekNumber: 1,
  days: [
    day('Upper Strength W1', 'MB-W1/D1', [
      s('Barbell Bench Press', [8, 8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Barbell Row', [8, 8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Overhead Press', [8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Pull-up', [8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Dumbbell Bicep Curl', [10, 10, 10], 'super_set'),
      s('Tricep Pushdown', [10, 10, 10], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Strength W1', 'MB-W1/D2', [
      s('Barbell Back Squat', [8, 8, 8, 8], 'normal', { restSeconds: 120 }),
      s('Romanian Deadlift', [8, 8, 8], 'normal', { restSeconds: 120 }),
      s('Walking Lunge', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Standing Calf Raise', [12, 12, 12], 'normal', { restSeconds: 45 }),
      s('Hanging Leg Raise', [10, 10, 10], 'normal', { restSeconds: 45 }),
    ]),
    day('Upper Hypertrophy W1', 'MB-W1/D3', [
      s('Incline Dumbbell Press', [10, 10, 10], 'normal', { restSeconds: 75 }),
      s('Lat Pulldown', [10, 10, 10], 'normal', { restSeconds: 75 }),
      s('Lateral Raise', [12, 12, 12], 'super_set'),
      s('Cable Face Pull', [12, 12, 12], 'super_set', { restSeconds: 60 }),
      s('Hammer Curl', [10, 10, 10], 'super_set'),
      s('Overhead Tricep Extension', [10, 10, 10], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Hypertrophy W1', 'MB-W1/D4', [
      s('Front Squat', [10, 10, 10], 'normal', { restSeconds: 90 }),
      s('Leg Press', [12, 12, 12], 'normal', { restSeconds: 75 }),
      s('Leg Curl Machine', [12, 12, 12], 'super_set'),
      s('Leg Extension', [12, 12, 12], 'super_set', { restSeconds: 60 }),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 45, restSeconds: 30 }),
    ]),
  ],
};

const mb_w2: WorkoutWeek = {
  weekNumber: 2,
  days: [
    day('Upper Strength W2', 'MB-W2/D1', [
      s('Barbell Bench Press', [6, 6, 6, 6, 6], 'normal', { restSeconds: 120 }),
      s('Barbell Row', [6, 6, 6, 6, 6], 'normal', { restSeconds: 120 }),
      s('Overhead Press', [8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Pull-up', [8, 8, 8], 'normal', { restSeconds: 90 }),
      s('Dumbbell Bicep Curl', [10, 10, 10], 'super_set'),
      s('Tricep Pushdown', [12, 12, 12], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Strength W2', 'MB-W2/D2', [
      s('Barbell Back Squat', [6, 6, 6, 6, 6], 'normal', { restSeconds: 120 }),
      s('Conventional Deadlift', [5, 5, 5], 'normal', { restSeconds: 150 }),
      s('Walking Lunge', [12, 12, 12], 'normal', { restSeconds: 60 }),
      s('Standing Calf Raise', [15, 15, 15], 'normal', { restSeconds: 45 }),
      s('Hanging Leg Raise', [12, 12, 12], 'normal', { restSeconds: 45 }),
    ]),
    day('Upper Hypertrophy W2', 'MB-W2/D3', [
      s('Incline Dumbbell Press', [12, 12, 12], 'normal', { restSeconds: 75 }),
      s('Lat Pulldown', [12, 12, 12], 'normal', { restSeconds: 75 }),
      s('Lateral Raise', [15, 15, 15], 'super_set'),
      s('Cable Face Pull', [15, 15, 15], 'super_set', { restSeconds: 60 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Hypertrophy W2', 'MB-W2/D4', [
      s('Front Squat', [10, 10, 10], 'normal', { restSeconds: 90 }),
      s('Leg Press', [15, 15, 15], 'normal', { restSeconds: 75 }),
      s('Leg Curl Machine', [15, 15, 15], 'super_set'),
      s('Leg Extension', [15, 15, 15], 'super_set', { restSeconds: 60 }),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 60, restSeconds: 30 }),
    ]),
  ],
};

const mb_w3: WorkoutWeek = {
  weekNumber: 3,
  days: [
    day('Upper Strength W3', 'MB-W3/D1', [
      s('Barbell Bench Press', [5, 5, 5, 5, 5], 'normal', { restSeconds: 150 }),
      s('Barbell Row', [5, 5, 5, 5, 5], 'normal', { restSeconds: 150 }),
      s('Overhead Press', [6, 6, 6, 6], 'normal', { restSeconds: 120 }),
      s('Pull-up', [10, 10, 10], 'normal', { restSeconds: 90 }),
      s('Dumbbell Bicep Curl', [12, 12, 12], 'super_set'),
      s('Tricep Pushdown', [15, 15, 15], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Strength W3', 'MB-W3/D2', [
      s('Barbell Back Squat', [5, 5, 5, 5, 5], 'normal', { restSeconds: 150 }),
      s('Conventional Deadlift', [5, 5, 5, 5], 'normal', { restSeconds: 180 }),
      s('Bulgarian Split Squat', [10, 10, 10], 'normal', { restSeconds: 75 }),
      s('Standing Calf Raise', [15, 15, 15], 'normal', { restSeconds: 45 }),
      s('Hanging Leg Raise', [12, 12, 12], 'normal', { restSeconds: 45 }),
    ]),
    day('Upper Hypertrophy W3', 'MB-W3/D3', [
      s('Incline Dumbbell Press', [12, 12, 12, 12], 'normal', { restSeconds: 75 }),
      s('Lat Pulldown', [12, 12, 12, 12], 'normal', { restSeconds: 75 }),
      s('Lateral Raise', [15, 15, 15], 'super_set'),
      s('Cable Face Pull', [15, 15, 15], 'super_set', { restSeconds: 60 }),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Hypertrophy W3', 'MB-W3/D4', [
      s('Front Squat', [12, 12, 12], 'normal', { restSeconds: 90 }),
      s('Leg Press', [15, 15, 15, 15], 'normal', { restSeconds: 75 }),
      s('Leg Curl Machine', [15, 15, 15], 'super_set'),
      s('Leg Extension', [15, 15, 15], 'super_set', { restSeconds: 60 }),
      s('Plank', [1, 1, 1], 'normal', { timeSeconds: 75, restSeconds: 30 }),
    ]),
  ],
};

const mb_w4: WorkoutWeek = {
  weekNumber: 4,
  days: [
    day('Upper Test W4', 'MB-W4/D1', [
      s('Barbell Bench Press', [3, 3, 3, 3, 1], 'normal', { restSeconds: 180 }),
      s('Barbell Row', [3, 3, 3, 3, 1], 'normal', { restSeconds: 180 }),
      s('Overhead Press', [5, 5, 5], 'normal', { restSeconds: 120 }),
      s('Pull-up', [10, 10, 10], 'normal', { restSeconds: 90 }),
    ]),
    day('Lower Test W4', 'MB-W4/D2', [
      s('Barbell Back Squat', [3, 3, 3, 3, 1], 'normal', { restSeconds: 180 }),
      s('Conventional Deadlift', [3, 3, 3, 1], 'normal', { restSeconds: 180 }),
      s('Walking Lunge', [10, 10, 10], 'normal', { restSeconds: 60 }),
      s('Standing Calf Raise', [12, 12, 12], 'normal', { restSeconds: 45 }),
    ]),
    day('Upper Volume W4', 'MB-W4/D3', [
      s('Incline Dumbbell Press', [12, 12, 12], 'super_set'),
      s('Lat Pulldown', [12, 12, 12], 'super_set', { restSeconds: 75 }),
      s('Lateral Raise', [15, 15, 15], 'super_set'),
      s('Hammer Curl', [12, 12, 12], 'super_set'),
      s('Overhead Tricep Extension', [12, 12, 12], 'super_set', { restSeconds: 60 }),
    ]),
    day('Lower Volume W4', 'MB-W4/D4', [
      s('Front Squat', [10, 10, 10], 'normal', { restSeconds: 75 }),
      s('Romanian Deadlift', [10, 10, 10], 'normal', { restSeconds: 75 }),
      s('Leg Curl Machine', [12, 12, 12], 'super_set'),
      s('Leg Extension', [12, 12, 12], 'super_set', { restSeconds: 60 }),
    ]),
  ],
};

export const MENS_BUILD: WorkoutProgram = {
  id: 'mens-build',
  name: "Men's BUILD",
  description:
    'A 4-week upper/lower hypertrophy + strength block built for men aiming ' +
    'to add lean mass. Compound-driven (squat, deadlift, bench, row, OHP) ' +
    'with progressive volume across weeks 1–3 and a strength-test deload ' +
    'in week 4. 4 days per week.',
  createdBy: 'Jamie Esposito',
  category: ['strength', 'hypertrophy', 'upper_body'],
  difficulty: 'intermediate',
  weeks: [mb_w1, mb_w2, mb_w3, mb_w4],
  durationWeeks: 4,
  isPremium: true,
  imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=80',
  tags: ['strength', 'hypertrophy', 'mens', 'upper lower split', 'barbell', 'compound'],
};

/**
 * Every program defined in this file. New programs append here.
 */
const _ALL_PROGRAMS: WorkoutProgram[] = [
  CORE_CHALLENGE,
  BOOTY_CHALLENGE,
  LEAN_AND_MEAN,
  POSTURE_CORE_RESTORE,
  TRIAL_PROGRAM,
  TRX_PROGRAM,
  LL_HIIT,
  COMPOUND_FUNCTIONAL,
  NUTRITION_BOOTCAMP,
  BODY_RECOMP,
  SSD_2,
  MENS_BUILD,
];

/**
 * Programs shown in the app today (per Jamie 2026-05-16):
 *   - Lusciously Lean BODYreCOMP 1.0 (the marquee Lusciously Lean program)
 *   - Men's BUILD                    (the "Men Fit Program")
 *   - 14-Day Trial Program           (stand-in for the "custom" slot until
 *                                     the user-built program feature ships)
 *
 * All other programs stay defined above and are reachable via getProgramById
 * (so any saved/active-program state still resolves) — they just don't appear
 * in browse lists. Restore by adding their id to VISIBLE_PROGRAM_IDS.
 *
 * TODO when the program-builder lands: drop TRIAL_PROGRAM from this list
 * and surface "Custom Fitness Program" as a build-your-own entry point.
 */
const VISIBLE_PROGRAM_IDS = new Set<string>([
  'll-body-recomp-1',
  'mens-build',
  '14-day-trial',
]);

const _RAW_PROGRAMS: WorkoutProgram[] = _ALL_PROGRAMS.filter((p) =>
  VISIBLE_PROGRAM_IDS.has(p.id),
);

/**
 * Every program, including hidden ones — for admin tools, deep links, and
 * resolving saved program state that references a now-hidden program.
 */
export const ALL_WORKOUT_PROGRAMS: readonly WorkoutProgram[] = _ALL_PROGRAMS;

// Lazy Proxy — defers iteration until first access, reducing startup GC pressure
export const WORKOUT_PROGRAMS: WorkoutProgram[] = new Proxy([] as WorkoutProgram[], {
  get(_, prop) {
    if (prop === 'length') return _RAW_PROGRAMS.length;
    if (prop === 'map') return _RAW_PROGRAMS.map.bind(_RAW_PROGRAMS);
    if (prop === 'filter') return _RAW_PROGRAMS.filter.bind(_RAW_PROGRAMS);
    if (prop === 'forEach') return _RAW_PROGRAMS.forEach.bind(_RAW_PROGRAMS);
    if (prop === 'find') return _RAW_PROGRAMS.find.bind(_RAW_PROGRAMS);
    if (prop === 'slice') return _RAW_PROGRAMS.slice.bind(_RAW_PROGRAMS);
    if (prop === 'some') return _RAW_PROGRAMS.some.bind(_RAW_PROGRAMS);
    if (prop === Symbol.iterator) return _RAW_PROGRAMS[Symbol.iterator].bind(_RAW_PROGRAMS);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return _RAW_PROGRAMS[Number(prop)];
    return (_RAW_PROGRAMS as any)[prop];
  },
});

/**
 * Lookup by ID — checks ALL programs (visible + hidden) so users with
 * an active program from before the visibility cull still resolve.
 */
export function getProgramById(programId: string): WorkoutProgram | undefined {
  return _ALL_PROGRAMS.find((p) => p.id === programId);
}

export default WORKOUT_PROGRAMS;
