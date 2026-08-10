/**
 * The GLP-1 protein bump must follow the CATALOG, not a hardcoded list.
 *
 * GLP1_PEPTIDE_IDS was five ids and had gone stale: Mazdutide and Survodutide
 * both carry GLP-1R in receptorTargets and neither was listed, so anyone
 * running them got 1.0 g/lb instead of 1.1 — losing the lean-mass protection
 * the bump exists to provide.
 *
 * These tests assert against the shipped function rather than a copy of the
 * list, because a test that re-declares the list would pass no matter how stale
 * the real one got.
 */
import { computeMacroRecommendation } from '../macroCalculator';
import { PEPTIDES } from '../../data/peptides';

const BASE = {
  weightLbs: 180,
  heightInches: 70,
  ageYears: 35,
  biologicalSex: 'male' as const,
  activityLevel: 'moderate' as const,
  goal: 'weight_loss' as const,
};

const proteinPerLb = (activePeptides: string[]) =>
  computeMacroRecommendation({ ...BASE, activePeptides }).proteinGrams / BASE.weightLbs;

/** Every catalog compound the DATA calls a GLP-1 agonist. */
const catalogGlp1 = (PEPTIDES as any[])
  .filter((p) => (p.receptorTargets ?? []).some((r: string) => /^glp-?1r$/i.test(r)))
  .map((p) => p.id as string);

describe('GLP-1 protein bump is derived from the catalog', () => {
  it('finds a meaningful number of GLP-1s (positive control)', () => {
    // A false-clean here would make every assertion below vacuous.
    expect(catalogGlp1.length).toBeGreaterThanOrEqual(5);
    expect(catalogGlp1).toContain('semaglutide');
  });

  it('bumps protein for EVERY GLP-1 in the catalog, not just the famous ones', () => {
    for (const id of catalogGlp1) {
      expect(proteinPerLb([id])).toBeGreaterThanOrEqual(1.1);
    }
  });

  it('covers the two that the hardcoded list had missed', () => {
    // The regression, named. Both carry GLP-1R and neither was listed.
    expect(proteinPerLb(['mazdutide'])).toBeGreaterThanOrEqual(1.1);
    expect(proteinPerLb(['survodutide'])).toBeGreaterThanOrEqual(1.1);
  });

  it('keeps cagrilintide, which is an amylin analogue rather than a GLP-1', () => {
    // Deliberate augment — it targets AMY/CTR, so the receptor rule alone would
    // drop it, but it was in the original list on purpose.
    expect(proteinPerLb(['cagrilintide'])).toBeGreaterThanOrEqual(1.1);
  });

  it('does not bump for an unrelated peptide', () => {
    expect(proteinPerLb(['bpc-157'])).toBeLessThan(1.1);
  });

  it('names the peptide rather than printing its id', () => {
    const { rationale } = computeMacroRecommendation({
      ...BASE,
      activePeptides: ['aod-9604'],
    });
    const line = rationale.find((r) => r.includes('Protein bumped'));
    expect(line).toBeDefined();
    // Was "you're on aod-9604" — a slug in user-facing copy.
    expect(line).toContain('AOD-9604');
    expect(line).not.toContain('aod-9604');
  });
});
