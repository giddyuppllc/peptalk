/**
 * Aimee must not name things that do not exist.
 *
 * Edward's rule, from Jamie's testing: "if she's proposing something that
 * exists it means it failed to render or work, and/or wrong info was
 * presented." This is the second half of that — wrong info presented — and
 * Aimee was the worst offender in the app precisely because she is the surface
 * users trust most.
 *
 * What she was saying, measured against the shipped data:
 *
 *   "3,000+ exercises with video demos"      384 exercises, 97 with a clip
 *   "We have 42 workout programs"            2 exist; the tab shows 1
 *   "Push/Pull/Legs, Upper/Lower, Full Body,
 *    Strength Focus, Metabolic Conditioning"  none of these are our programs
 *   chest → Bench Press, Incline Dumbbell
 *    Press, Cable Flyes, Push-Ups             none of these are in the catalog
 *
 * 22 of the 28 exercises she recommended by body part did not exist. A user
 * asks what to do for chest, gets four names, searches the library, finds
 * none of them — and the report that comes back reads like a feature request
 * rather than a bug. Naming nothing would have been better than naming these.
 *
 * These tests assert the claims against the catalog itself, so they fail if
 * either side moves.
 */
import { EXERCISES } from '../../data/exercises';
import { WORKOUT_PROGRAMS } from '../../data/workoutPrograms';
import {
  CATALOG,
  BODYPART_MUSCLES,
  exercisesForMuscles,
  generateLocalBotResponse,
} from '../../services/peptalkBot';

const exerciseNames = new Set((EXERCISES as any[]).map((e) => e.name));

describe('every exercise Aimee names exists in the catalog', () => {
  it.each(Object.keys(BODYPART_MUSCLES))('%s suggestions are all real', (bodypart) => {
    const picks = exercisesForMuscles(BODYPART_MUSCLES[bodypart]);
    expect(picks.length).toBeGreaterThan(0);
    for (const name of picks) expect(exerciseNames.has(name)).toBe(true);
  });

  it('covers every body part the intent matcher can detect', () => {
    // The regex in respondWorkoutSuggest recognises these words. If it can
    // match a word BODYPART_MUSCLES has no entry for, Aimee detects the
    // question, finds nothing to say, and silently answers about something
    // else — the dead-zone failure in conversational form.
    const detected = ['chest', 'back', 'leg', 'arm', 'shoulder', 'bicep', 'tricep', 'core', 'abs', 'glute'];
    for (const word of detected) {
      const matched = Object.keys(BODYPART_MUSCLES).some((k) => k.includes(word) || word.includes(k));
      expect(matched).toBe(true);
    }
  });

  it('every muscle key maps to at least one real exercise', () => {
    // A typo like 'quad' for 'quads' would silently yield an empty list.
    const known = new Set((EXERCISES as any[]).map((e) => e.primaryMuscle));
    for (const [bodypart, muscles] of Object.entries(BODYPART_MUSCLES)) {
      for (const m of muscles) {
        expect(known.has(m)).toBe(true);
      }
      expect(exercisesForMuscles(muscles).length).toBeGreaterThan(0);
      expect(bodypart).toBeTruthy();
    }
  });

  it('spreads picks across muscles instead of exhausting the first', () => {
    // "arms" returning four biceps movements and no triceps is a worse answer
    // than one that alternates, and it is what a naive filter+slice produces.
    const arms = exercisesForMuscles(['biceps', 'triceps'], 4);
    const byName = new Map((EXERCISES as any[]).map((e) => [e.name, e.primaryMuscle]));
    const muscles = new Set(arms.map((n) => byName.get(n)));
    expect(muscles.size).toBe(2);
  });

  it('never returns more than asked for, and never duplicates', () => {
    for (const muscles of Object.values(BODYPART_MUSCLES)) {
      const picks = exercisesForMuscles(muscles, 4);
      expect(picks.length).toBeLessThanOrEqual(4);
      expect(new Set(picks).size).toBe(picks.length);
    }
  });

  it('degrades safely when asked for more than exist', () => {
    const picks = exercisesForMuscles(['chest'], 10_000);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.length).toBeLessThanOrEqual(EXERCISES.length);
    for (const name of picks) expect(exerciseNames.has(name)).toBe(true);
  });

  it('returns nothing for a muscle that does not exist, rather than inventing', () => {
    expect(exercisesForMuscles(['not-a-muscle'])).toEqual([]);
    expect(exercisesForMuscles([])).toEqual([]);
  });
});

describe('every count Aimee quotes is derived, not typed', () => {
  it('the exercise count matches the catalog', () => {
    expect(CATALOG.exercises).toBe(EXERCISES.length);
    // The old literal. If this ever passes again someone has re-hardcoded it.
    expect(CATALOG.exercises).not.toBe(3000);
    expect(CATALOG.exercises).not.toBe(289);
  });

  it('the program count matches the shipped programs', () => {
    expect(CATALOG.programs).toBe(WORKOUT_PROGRAMS.length);
    expect(CATALOG.programs).not.toBe(42);
  });
});

describe('the programs Aimee lists are the ones that ship', () => {
  it('names come from WORKOUT_PROGRAMS', () => {
    const real = new Set((WORKOUT_PROGRAMS as any[]).map((p) => p.name));
    expect(real.size).toBe(WORKOUT_PROGRAMS.length);
    // The five she used to invent. None is ours; each would send a user to the
    // Workouts tab looking for something that was never there.
    for (const fake of [
      'Push/Pull/Legs',
      'Upper/Lower',
      'Full Body',
      'Strength Focus',
      'Metabolic Conditioning',
    ]) {
      expect(real.has(fake)).toBe(false);
    }
  });

  it('every shipped program has a name worth printing', () => {
    for (const p of WORKOUT_PROGRAMS as any[]) {
      expect(typeof p.name).toBe('string');
      expect(p.name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('Aimee points at destinations that exist', () => {
  /**
   * Her plan answer used to end with "use the PepTalk Chat with AI enabled to
   * say 'Create a weekly health plan'" — a loop back into the same chat, from
   * a branch already reached by asking for a plan. There was no plan screen, no
   * route, and usePlanStore's create/complete/progress actions had no callers,
   * so the instruction led nowhere however it was followed.
   *
   * app/plan exists now, so the answer names it.
   */
  const planReply = (ctx: any) => generateLocalBotResponse('create a health plan for me', ctx);

  it('names My Plan rather than sending the user back into the chat', () => {
    const reply = planReply({ userProfile: null, checkIns: [], doseLogs: [], stacks: [] });
    expect(reply.content).toContain('My Plan');
    expect(reply.content).not.toContain('with AI enabled to say');
  });

  it('says the same thing whether or not a profile is set', () => {
    // Both branches of the plan answer previously promised something with no
    // destination. Neither should now.
    const withProfile = planReply({
      userProfile: { primaryGoals: ['weight_loss'] },
      checkIns: [],
      doseLogs: [],
      stacks: [],
    });
    const without = planReply({ userProfile: null, checkIns: [], doseLogs: [], stacks: [] });
    for (const r of [withProfile, without]) expect(r.content).toContain('My Plan');
  });
});
