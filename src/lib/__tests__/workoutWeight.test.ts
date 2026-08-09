/**
 * Weight-per-set: the feature Jamie asked for repeatedly and was told existed.
 *
 * "We can log the reps and sets but need a spot to log the weight used."
 *
 * She was right twice over. The builder rendered Sets and Reps steppers only,
 * even though TemplateExercise has carried `targetWeightLbs` since the store
 * was written and its header says users "set target reps/sets/weight". And the
 * player never read that field, so even a weight typed into the model by hand
 * would have been discarded — every first run of a new workout opened at 0 lb.
 *
 * These test the precedence rule, because reordering it changes what somebody
 * loads onto a bar.
 */
import { resolveSetWeight, snapToPlate, targetWeightMap } from '../workoutWeight';

describe('precedence', () => {
  it('a weight dialled in this session always wins', () => {
    // Never override a live choice — it is the only value we know is current.
    expect(
      resolveSetWeight({ sessionWeight: 95, historyBest: 185, targetWeight: 135 }),
    ).toBe(95);
  });

  it('history beats the plan', () => {
    // What they actually lifted is better evidence than an intention typed
    // weeks ago. This is also the player's long-standing behaviour, preserved.
    expect(resolveSetWeight({ historyBest: 185, targetWeight: 135 })).toBe(185);
  });

  it('the plan fills the first-run gap — the actual bug', () => {
    // No history yet. This returned 0 before, so a brand new workout opened at
    // 0 lb and you re-typed what you had already entered in the builder.
    expect(resolveSetWeight({ targetWeight: 135 })).toBe(135);
    expect(resolveSetWeight({ historyBest: 0, targetWeight: 135 })).toBe(135);
    expect(resolveSetWeight({ historyBest: null, targetWeight: 135 })).toBe(135);
  });

  it('falls to 0 when nothing is known', () => {
    expect(resolveSetWeight({})).toBe(0);
    expect(resolveSetWeight({ sessionWeight: null, historyBest: null, targetWeight: null })).toBe(0);
  });
});

describe('zero means different things in different slots', () => {
  it('a session weight of 0 is honoured — that is bodyweight', () => {
    // The user explicitly stepped it down to 0. Falling through to history
    // here would silently re-load a bar they just emptied.
    expect(resolveSetWeight({ sessionWeight: 0, historyBest: 185, targetWeight: 135 })).toBe(0);
  });

  it('a history or target of 0 means "nothing recorded" and falls through', () => {
    // No set is ever logged at 0, so 0 there is absence, not a choice.
    expect(resolveSetWeight({ historyBest: 0, targetWeight: 0 })).toBe(0);
    expect(resolveSetWeight({ historyBest: 0, targetWeight: 45 })).toBe(45);
  });
});

describe('plate rounding', () => {
  it('snaps to the nearest 5 lb', () => {
    expect(snapToPlate(137)).toBe(135);
    expect(snapToPlate(138)).toBe(140);
    expect(snapToPlate(2)).toBe(0);
    expect(snapToPlate(3)).toBe(5);
  });

  it('never goes negative', () => {
    expect(snapToPlate(-50)).toBe(0);
    expect(resolveSetWeight({ sessionWeight: -20 })).toBe(0);
  });

  it('survives nonsense rather than rendering NaN', () => {
    // A NaN here reaches the screen as "NaN lb" and the accessibility label
    // reads "log this set, 10 reps at NaN pounds".
    expect(snapToPlate(NaN)).toBe(0);
    expect(snapToPlate(Infinity)).toBe(0);
    expect(resolveSetWeight({ sessionWeight: NaN, historyBest: 100 })).toBe(100);
  });

  it('rounds the plan too, so the builder cannot produce an unloadable bar', () => {
    expect(resolveSetWeight({ targetWeight: 137 })).toBe(135);
  });
});

describe('targetWeightMap', () => {
  it('maps exercises that carry a planned weight', () => {
    expect(
      targetWeightMap([
        { exerciseId: 'barbell-bicep-curls', targetWeightLbs: 45 },
        { exerciseId: 'plank', targetWeightLbs: 0 },
        { exerciseId: 'basic-crunch' },
      ]),
    ).toEqual({ 'barbell-bicep-curls': 45 });
  });

  it('drops zero and missing values', () => {
    // 0 means bodyweight or undecided. Carrying it as a "plan" would shadow
    // real history with a meaningless number.
    const map = targetWeightMap([{ exerciseId: 'plank', targetWeightLbs: 0 }]);
    expect(map.plank).toBeUndefined();
    expect(resolveSetWeight({ historyBest: 185, targetWeight: map.plank })).toBe(185);
  });

  it('handles an empty or absent list', () => {
    expect(targetWeightMap([])).toEqual({});
    expect(targetWeightMap(undefined)).toEqual({});
  });
});

describe('the round trip the user actually experiences', () => {
  it('build at 135 → first run opens at 135 → next run uses what was lifted', () => {
    const template = [{ exerciseId: 'barbell-squat', targetWeightLbs: 135 }];
    const plan = targetWeightMap(template);

    // Day 1: no history. Before this feature, 0.
    const firstRun = resolveSetWeight({ targetWeight: plan['barbell-squat'] });
    expect(firstRun).toBe(135);

    // They push to 155 and log it. Day 2 seeds from the real lift.
    const secondRun = resolveSetWeight({ historyBest: 155, targetWeight: plan['barbell-squat'] });
    expect(secondRun).toBe(155);

    // Mid-session they drop to 115; that stands for the rest of the session.
    expect(
      resolveSetWeight({ sessionWeight: 115, historyBest: 155, targetWeight: 135 }),
    ).toBe(115);
  });
});
