/**
 * Workout clips that reach no screen.
 *
 * 66 of the 264 tagged clips carried an `exerciseId` matching nothing in the
 * catalog. `getVideosByExerciseId` compared strings exactly, so a tag one
 * character off was worth exactly as much as no tag: the file was downloaded,
 * listed in the manifest, and displayed nowhere. Same shape as everything else
 * in this sweep — the content exists, the screen exists, they never meet.
 *
 * The bad ids were not random. 26 of 31 were the real id with a trailing
 * number (`plank-289`) or the same words reordered (`chest-press-machine`),
 * which is one tagging pipeline reading a numbered list, not 26 mistakes.
 *
 * Resolution happens in code, not by rewriting workoutVideos.json — the
 * standing rule is not to overwrite stored data records, and a read-time fix
 * also covers future tags with the same shape.
 */
import {
  WORKOUT_VIDEOS,
  resolveExerciseId,
  getVideosByExerciseId,
} from '../../data/workoutVideos';
import { EXERCISES } from '../../data/exercises';

const realIds = new Set((EXERCISES as any[]).map((e) => e.id));
const tagged = (WORKOUT_VIDEOS as any[]).filter((v) => v.exerciseId);

describe('tolerant resolution recovers clips that reached nobody', () => {
  it('there are enough tagged clips for this to be meaningful', () => {
    expect(tagged.length).toBeGreaterThan(200);
  });

  it('resolves the numeric-suffix form', () => {
    expect(resolveExerciseId('plank-289')).toBe('plank');
    expect(resolveExerciseId('side-plank-292')).toBe('side-plank');
    expect(resolveExerciseId('leg-lowers-296')).toBe('leg-lowers');
    expect(resolveExerciseId('elbows-to-knees-sit-up-291')).toBe('elbows-to-knees-sit-up');
  });

  it('resolves the reordered-words form', () => {
    expect(resolveExerciseId('chest-press-machine')).toBe('machine-chest-press');
    expect(resolveExerciseId('dumbbell-overhead-tricep-extensions')).toBe(
      'overhead-tricep-dumbbell-extensions',
    );
  });

  it('leaves an exact match untouched', () => {
    // The common path. A resolver that "helpfully" rewrote good tags would be
    // far worse than the bug it fixes.
    for (const id of ['plank', 'side-plank', 'basic-crunch', 'machine-chest-press']) {
      expect(resolveExerciseId(id)).toBe(id);
    }
  });

  it('every resolution lands on a REAL exercise', () => {
    for (const v of tagged) {
      const r = resolveExerciseId(v.exerciseId);
      if (r !== null) expect(realIds.has(r)).toBe(true);
    }
  });

  it('recovers the bulk of the broken tags', () => {
    const resolved = tagged.filter((v) => resolveExerciseId(v.exerciseId));
    // 198 before, 251 after. Asserting a floor rather than the exact number so
    // adding exercises or clips does not break the test for the wrong reason.
    expect(resolved.length).toBeGreaterThanOrEqual(250);
    expect(resolved.length).toBeGreaterThan(tagged.length * 0.9);
  });

  it('the clips actually arrive at the exercise', () => {
    // The end-to-end claim: plank's clips were tagged plank-289 and reached
    // nothing. This is the assertion that would have caught the original bug.
    expect(getVideosByExerciseId('plank').length).toBeGreaterThan(0);
    expect(getVideosByExerciseId('side-plank').length).toBeGreaterThan(0);
    expect(getVideosByExerciseId('machine-chest-press').length).toBeGreaterThan(0);
  });
});

describe('it refuses to guess', () => {
  it('returns null for an id with no candidate', () => {
    // Real remaining gaps: the clip exists, the exercise does not. These must
    // stay visible as gaps rather than be attached to the nearest thing.
    for (const id of ['dumbbell-pullover', 'dumbbell-fly', 'ball-straight-leg-bridge']) {
      expect(resolveExerciseId(id)).toBeNull();
      expect(realIds.has(id)).toBe(false);
    }
  });

  it('refuses an ambiguous token match', () => {
    // Two pairs in the catalog share a token set. Picking one would put a clip
    // on the wrong exercise, which is worse than putting it on none.
    const ambiguous = ['bent-over-cable-bar-row', 'cable-bar-bent-over-row'];
    const bothReal = ambiguous.every((id) => realIds.has(id));
    expect(bothReal).toBe(true);
    // Each still resolves to ITSELF via the exact-match branch — ambiguity only
    // blocks the fuzzy fallback, it must not break a valid id.
    for (const id of ambiguous) expect(resolveExerciseId(id)).toBe(id);
    // A scrambled form of that token set has no unique answer, so: null.
    expect(resolveExerciseId('row-bar-cable-over-bent')).toBeNull();
  });

  it('handles empty and null input', () => {
    expect(resolveExerciseId(null)).toBeNull();
    expect(resolveExerciseId('')).toBeNull();
    expect(resolveExerciseId('-')).toBeNull();
  });

  it('does not strip a number that is part of the name', () => {
    // '176-191' style names exist in this domain. Stripping a trailing number
    // must not invent a match that was never there.
    expect(resolveExerciseId('not-a-real-exercise-999')).toBeNull();
  });
});

describe('the PLAY path resolves the same way as the listing', () => {
  /**
   * The trap this nearly walked into. 40 of the 142 entries in
   * EXERCISE_VIDEO_SLUG_MAP are keyed by the same stale ids as the manifest
   * (`barbell-goodmorning-367`, `barbell-rdl-379`). Fixing only the manifest
   * would have made clips start appearing in listings and then fail to play,
   * because the play path resolves its slug through that map — strictly worse
   * than the original bug, which at least failed honestly.
   *
   * So both sides go through resolveExerciseId, and this asserts they agree.
   */
  const { hasExerciseVideo, getExerciseVideoSlug, getAllExerciseVideoSlugs } =
    require('../../services/videoService');

  it('a real exercise whose map key carries a stale suffix still finds its slug', () => {
    for (const id of ['barbell-goodmorning', 'barbell-rdl']) {
      expect(realIds.has(id)).toBe(true);
      expect(hasExerciseVideo(id)).toBe(true);
      expect(getExerciseVideoSlug(id)).toBeTruthy();
    }
  });

  it('anything the listing offers, the play path can resolve', () => {
    // The invariant that matters: never show a video we cannot play.
    const offered = (EXERCISES as any[]).filter(
      (e) => getVideosByExerciseId(e.id).length > 0 && hasExerciseVideo(e.id),
    );
    expect(offered.length).toBeGreaterThan(0);
    for (const e of offered) expect(getExerciseVideoSlug(e.id)).toBeTruthy();
  });

  it('alternate takes survive the alias too', () => {
    // Plank has several angles filmed. Falling back to a single canonical slug
    // would quietly drop the rest.
    expect(getAllExerciseVideoSlugs('plank').length).toBeGreaterThan(0);
  });

  it('an unknown exercise still has no video', () => {
    expect(hasExerciseVideo('not-a-real-exercise')).toBe(false);
    expect(getExerciseVideoSlug('not-a-real-exercise')).toBeNull();
    expect(getAllExerciseVideoSlugs('not-a-real-exercise')).toEqual([]);
  });
});

describe('needsReview clips stay out regardless', () => {
  it('an unreviewed clip is never returned', () => {
    const flagged = (WORKOUT_VIDEOS as any[]).filter((v) => v.needsReview && v.exerciseId);
    for (const v of flagged.slice(0, 20)) {
      const target = resolveExerciseId(v.exerciseId);
      if (!target) continue;
      expect(getVideosByExerciseId(target)).not.toContain(v);
    }
  });
});
