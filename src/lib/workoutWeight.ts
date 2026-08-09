/**
 * What weight should the player show for the set you are about to do?
 *
 * Jamie, repeatedly: "We can log the reps and sets but need a spot to log the
 * weight used." She was describing a real hole, in two halves:
 *
 *   1. The BUILDER (app/workouts/new.tsx) rendered steppers for Sets and Reps
 *      only. TemplateExercise has carried `targetWeightLbs` since the store was
 *      written — its own header says users "pick exercises, set target
 *      reps/sets/weight" — and there was nowhere to type one.
 *   2. The PLAYER let you log weight per set, but never read `targetWeightLbs`,
 *      so anything planned in the builder would have been thrown away anyway.
 *      A first run of a new workout opened at 0 lb every time.
 *
 * Both halves had to close for the feature to exist. This is the part worth
 * testing on its own: the precedence between the three sources of an answer.
 *
 * Pulled out of the component for the same reason routeGuard, streamUrl,
 * doseUnits and alertDispatch were — the rule is the thing that can be wrong,
 * and a rule buried in a useMemo cannot be tested without mounting a screen.
 */

export interface WeightSources {
  /** What the user has dialled in during THIS session, if anything. */
  sessionWeight?: number | null;
  /** Heaviest set they actually completed on this exercise before. */
  historyBest?: number | null;
  /** What they planned when they built the workout. */
  targetWeight?: number | null;
}

/** Round to the nearest 5 lb, never below zero. Mirrors the player's snap5. */
export function snapToPlate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n / 5) * 5);
}

/**
 * Resolve the weight to display.
 *
 * PRECEDENCE, and the reasoning, because reordering this changes what someone
 * loads onto a bar:
 *
 *   1. sessionWeight — they have already adjusted it here. Never override a
 *      live choice; that is the one value we know is current.
 *   2. historyBest   — what they actually lifted last time. Real evidence
 *      beats an intention typed weeks ago, and it is what the player has
 *      always done.
 *   3. targetWeight  — the plan from the builder. This only fills the
 *      first-run gap, where there is no history and the old code fell to 0.
 *
 * A session weight of 0 is a deliberate choice (bodyweight) and is honoured;
 * null/undefined means "not set". History and target of 0 mean "nothing
 * recorded" and fall through, since no lift is ever logged at 0.
 */
export function resolveSetWeight(sources: WeightSources): number {
  const { sessionWeight, historyBest, targetWeight } = sources;
  if (sessionWeight != null && Number.isFinite(sessionWeight)) {
    return snapToPlate(sessionWeight);
  }
  if (historyBest) return snapToPlate(historyBest);
  if (targetWeight) return snapToPlate(targetWeight);
  return 0;
}

/**
 * Build the exercise → planned weight map from a template's exercises.
 * Entries at or below zero are dropped: 0 means bodyweight or undecided, and
 * carrying it as a "plan" would shadow real history with a meaningless value.
 */
export function targetWeightMap(
  exercises: readonly { exerciseId: string; targetWeightLbs?: number }[] | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ex of exercises ?? []) {
    if (ex.targetWeightLbs && ex.targetWeightLbs > 0) out[ex.exerciseId] = ex.targetWeightLbs;
  }
  return out;
}
