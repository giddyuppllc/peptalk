/**
 * The expansion layer may rewrite words. It may not rewrite a dose.
 *
 * Testing this only against the 35 rulings we hold today would prove almost
 * nothing — none of them exercise the failure the guard exists for. So most of
 * this file is adversarial: strings built specifically to make an expansion
 * rule eat, merge, split or reorder a figure, plus a mutation block that
 * corrupts the expander in memory and asserts the guard notices.
 */

import {
  expandClinicianText,
  extractFigures,
  verifyNoFigureChanged,
  expandRuling,
  expandRulings,
  getExpandedRuling,
} from '../clinicianRulingsDisplay';
import { CLINICIAN_RULINGS, rulingDoseMcg } from '../clinicianRulings';

describe('extractFigures', () => {
  it('reads every number-unit pair in order', () => {
    expect(extractFigures('250 mcg – 12mg')).toEqual(['250mcg', '12mg']);
    expect(extractFigures('1 mg – 2 mg 3 times weekly')).toEqual(['1mg', '2mg', '3']);
  });

  it('keeps a bare number in the sequence, so a dropped count is visible', () => {
    expect(extractFigures('3 times weekly')).toEqual(['3']);
    expect(extractFigures('times weekly')).toEqual([]);
  });

  it('treats unit spacing and case as noise, not as a change', () => {
    expect(extractFigures('12mg')).toEqual(extractFigures('12 MG'));
    expect(extractFigures('30 units')).toEqual(extractFigures('30 unit'));
  });

  it('does not conflate 1 mg with 1 mcg', () => {
    expect(extractFigures('1 mg')).not.toEqual(extractFigures('1 mcg'));
  });

  it('keeps decimals intact', () => {
    expect(extractFigures('1.2 mg – 2.4 mg')).toEqual(['1.2mg', '2.4mg']);
    expect(extractFigures('1.2 mg')).not.toEqual(extractFigures('12 mg'));
  });
});

describe('verifyNoFigureChanged', () => {
  const cases: [string, string, string][] = [
    ['a dropped figure', '200 mcg – 500 mcg', '200 mcg'],
    ['an added figure', '200 mcg', '200 mcg – 500 mcg'],
    ['a changed figure', '200 mcg – 500 mcg', '200 mcg – 5000 mcg'],
    ['a changed unit', '1 mg – 2 mg', '1 mcg – 2 mcg'],
    ['reordered figures', '330 mcg – 1 mg', '1 mg – 330 mcg'],
    ['a lost decimal point', '2.5 mg – 15 mg', '25 mg – 15 mg'],
    ['a lost dose count', '1 mg 3 times weekly', '1 mg three times weekly'],
  ];

  it.each(cases)('rejects %s', (_label, before, after) => {
    expect(() => verifyNoFigureChanged(before, after, 'test')).toThrow(/changed the figures/);
  });

  it('accepts a pure wording change', () => {
    expect(() =>
      verifyNoFigureChanged('1 mg, am on empty stomach', '1 mg, in the morning on an empty stomach'),
    ).not.toThrow();
  });
});

describe('expandClinicianText', () => {
  it('expands the abbreviation that actually misreads', () => {
    expect(expandClinicianText('1 mg – 2 mg 3 times weekly, am on empty stomach, prior to workout')).toBe(
      '1 mg – 2 mg 3 times weekly, in the morning on an empty stomach, before training',
    );
  });

  it('leaves "min" alone — it is minutes as often as minimum', () => {
    expect(expandClinicianText('inject over 5 min')).toBe('Inject over 5 min');
  });

  it('does not expand a unit letter sequence hiding inside a word', () => {
    // "amino" starts with "am"; "warm" ends with it. A word-boundary miss here
    // would produce "in the morningino acid".
    expect(expandClinicianText('amino acid, warm to room temperature')).toBe(
      'Amino acid, warm to room temperature',
    );
  });

  it('spaces a unit off its number without altering either', () => {
    expect(expandClinicianText('250 mcg – 12mg')).toBe('250 mcg – 12 mg');
  });

  it('does not put a space inside a word that ends in a unit letter', () => {
    expect(expandClinicianText('reconstitute in 3ml bac water')).toContain('3 ml');
  });

  it('returns empty string for absent input rather than throwing', () => {
    expect(expandClinicianText(undefined)).toBe('');
    expect(expandClinicianText(null)).toBe('');
    expect(expandClinicianText('')).toBe('');
  });

  it('is idempotent — expanding an expansion changes nothing further', () => {
    for (const r of CLINICIAN_RULINGS) {
      if (!r.dose?.verbatim) continue;
      const once = expandClinicianText(r.dose.verbatim);
      expect(expandClinicianText(once)).toBe(once);
    }
  });
});

describe('every ruling we actually hold', () => {
  it('expands without changing a single figure', () => {
    for (const r of CLINICIAN_RULINGS) {
      // expandRuling throws internally if a figure moved; this asserts the
      // whole set passes rather than asserting on any one string.
      expect(() => expandRuling(r)).not.toThrow();
    }
  });

  it('keeps the parsed safety range identical to the verbatim record', () => {
    // The overdose guard reads rulingDoseMcg(verbatim). If display ever fed
    // that instead, the numbers must still land in the same place.
    for (const r of CLINICIAN_RULINGS) {
      if (!r.dose) continue;
      const expanded = expandRuling(r);
      expect(extractFigures(expanded.dose ?? '')).toEqual(extractFigures(r.dose.verbatim));
      const { minMcg, maxMcg } = rulingDoseMcg(r.dose);
      expect(minMcg).toBeLessThanOrEqual(maxMcg);
    }
  });

  it('preserves her wording alongside the expansion, for provenance', () => {
    for (const e of expandRulings(CLINICIAN_RULINGS)) {
      const source = CLINICIAN_RULINGS.find((r) => r.peptideId === e.peptideId)!;
      expect(e.verbatim.dose).toBe(source.dose?.verbatim);
      expect(e.verbatim.cycle).toBe(source.cycle?.verbatim);
      expect(e.verbatim.notes).toEqual(source.notes);
    }
  });

  it('does not state a schedule twice in one summary', () => {
    // MOTS-c carries "3 times weekly" inside the dose AND in frequency.
    const motsc = getExpandedRuling('mots-c');
    expect(motsc).not.toBeNull();
    const occurrences = motsc!.summary.split('3 times weekly').length - 1;
    expect(occurrences).toBe(1);
  });

  it('reads as one sentence, not a run of capitalised fragments', () => {
    for (const e of expandRulings(CLINICIAN_RULINGS)) {
      if (!e.summary) continue;
      // No ", Capital" joins — those are two table cells stapled together.
      expect(e.summary).not.toMatch(/, [A-Z][a-z]/);
      expect(e.summary).not.toMatch(/\s{2,}/);
      expect(e.summary.trim()).toBe(e.summary);
    }
  });

  it('returns null for a peptide she never ruled on', () => {
    expect(getExpandedRuling('not-a-real-peptide')).toBeNull();
  });
});

describe('mutation: the guard has to actually guard', () => {
  // Each mutation is an expansion rule that eats a figure. If the guard is
  // sound, every one of them throws. A rule set that silently rewrites a dose
  // is the failure this whole module exists to make impossible.
  const badExpansions: [string, (s: string) => string][] = [
    ['drops a trailing range', (s) => s.replace(/\s*–\s*[\d.]+\s*(mcg|mg)/i, '')],
    ['rounds a decimal', (s) => s.replace(/([\d]+)\.\d+/g, '$1')],
    ['swaps mcg for mg', (s) => s.replace(/mcg/gi, 'mg')],
    ['spells out a count', (s) => s.replace(/\b3\b/g, 'three')],
    ['duplicates the first figure', (s) => s.replace(/([\d.]+\s*(?:mcg|mg))/i, '$1 $1')],
  ];

  it.each(badExpansions)('%s is rejected on at least one real ruling', (_label, mutate) => {
    const caught = CLINICIAN_RULINGS.some((r) => {
      const v = r.dose?.verbatim;
      if (!v) return false;
      const bad = mutate(v);
      if (bad === v) return false;
      try {
        verifyNoFigureChanged(v, bad, r.peptideId);
        return false;
      } catch {
        return true;
      }
    });
    expect(caught).toBe(true);
  });
});
