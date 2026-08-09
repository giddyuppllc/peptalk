/**
 * The body map's two joins both went nowhere.
 *
 * Every region on that screen renders two lists — related peptides and top
 * exercises — and each was joined by a string that did not match what the
 * other side was keyed by.
 *
 *   relatedPeptides  holds display NAMES ("BPC-157"), pushed straight into
 *                    /peptide/[id], which resolves by ID ("bpc-157"). All 15
 *                    pills on the map led to a not-found screen.
 *   muscles          the `head` region asks for 'cardio', which is not a
 *                    primaryMuscle. The 17 cardio movements are
 *                    primaryMuscle: full_body, tagged `circuit_cardio`, so the
 *                    section rendered a heading and a "See All" over nothing.
 *
 * Neither threw. Both produced an empty or wrong result that looked like an
 * absence of content.
 */
import { BODY_REGIONS } from '../../data/bodyMapData';
import { getExercisesByMuscle, EXERCISES } from '../../data/exercises';
import { PEPTIDES } from '../../data/peptides';
import { findPeptideByQuery } from '../peptideSearch';

const regions = BODY_REGIONS as any[];

describe('related-peptide pills resolve to real compounds', () => {
  // "Pentadecapeptide" is a description of BPC-157, not a separate compound.
  // It renders as plain text rather than a link — see BodyRegionPanel.
  const NOT_A_COMPOUND = new Set(['Pentadecapeptide']);

  it('the map actually has pills to check', () => {
    const names = regions.flatMap((r) => r.relatedPeptides ?? []);
    expect(names.length).toBeGreaterThan(10);
  });

  it('every display name resolves to a peptide id', () => {
    const names = [...new Set(regions.flatMap((r) => r.relatedPeptides ?? []))];
    for (const name of names) {
      if (NOT_A_COMPOUND.has(name)) continue;
      const match = findPeptideByQuery(PEPTIDES as any, name);
      expect(match).not.toBeNull();
      // And the id it resolves to must be a real catalog id, since that is
      // what gets pushed into the route.
      expect((PEPTIDES as any[]).some((p) => p.id === match!.id)).toBe(true);
    }
  });

  it('the display names are NOT ids — which is why the old code failed', () => {
    // Locks in the reason the bug existed. If someone "fixes" the data by
    // replacing names with ids, this fails loudly and the resolution layer can
    // be simplified deliberately rather than by accident.
    const names = [...new Set(regions.flatMap((r) => r.relatedPeptides ?? []))];
    const catalogIds = new Set((PEPTIDES as any[]).map((p) => p.id));
    const anyIsAnId = names.some((n: string) => catalogIds.has(n));
    expect(anyIsAnId).toBe(false);
  });
});

describe('every region has exercises to show', () => {
  it.each(regions.map((r) => [r.id]))('%s returns at least one exercise', (regionId) => {
    const region = regions.find((r) => r.id === regionId);
    const total = (region.muscles ?? []).reduce(
      (sum: number, m: string) => sum + getExercisesByMuscle(m as any).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it('head/cardio specifically — the region that rendered empty', () => {
    expect(getExercisesByMuscle('cardio' as any).length).toBeGreaterThan(10);
  });

  it('tag matching is by token, not substring', () => {
    // 'cardio' must find `circuit_cardio`. But a partial token must NOT match,
    // or the lookup becomes fuzzy and starts returning surprises.
    expect(getExercisesByMuscle('cardio' as any).length).toBeGreaterThan(0);
    expect(getExercisesByMuscle('card' as any).length).toBe(0);
    expect(getExercisesByMuscle('circ' as any).length).toBe(0);
  });

  it('no tag token collides with a muscle name', () => {
    // The safety property that makes tag matching sound. If someone adds a tag
    // like `upper_back`, 'back' would start matching exercises by tag as well
    // as by muscle, silently widening every back query.
    const muscles = new Set((EXERCISES as any[]).map((e) => e.primaryMuscle));
    const tokens = new Set<string>();
    for (const e of EXERCISES as any[]) {
      for (const t of e.tags ?? []) for (const part of t.split('_')) tokens.add(part);
    }
    for (const tok of tokens) expect(muscles.has(tok)).toBe(false);
  });

  it('an unknown muscle still returns nothing', () => {
    expect(getExercisesByMuscle('not-a-muscle' as any)).toEqual([]);
    // 'forearms' is a real content gap — the arms region asks for it and the
    // catalog has zero forearm exercises. It degrades to biceps + triceps
    // rather than emptying the section, which is why arms was never reported.
    expect(getExercisesByMuscle('forearms' as any)).toEqual([]);
  });
});
