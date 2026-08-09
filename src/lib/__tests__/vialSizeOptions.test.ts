/**
 * Vial-size quick-picks.
 *
 * Edward: "we should have the standard vial size options for the calc to do
 * math and let people select theirs off." Then, correcting the first cut:
 * "this isnt a supplier app / its education resource / just have it do the
 * fuckin math for them let them explore" — and "if this is peptalk, there is
 * zero suppliers and sales, this is all education."
 *
 * Vial size is a property of the VIAL, not the compound: the same peptide
 * turns up as 5 mg from one source and 10 or 30 from another. The mg field
 * prefilled from the reference, so anyone holding a different vial had to
 * notice the mismatch and retype it — exactly the retatrutide failure, where a
 * 10 mg vial silently got 5 mg maths and the wrong unit count on every draw.
 *
 * The fix is NOT to encode who stocks what. It is to offer every compound the
 * same realistic ladder and compute whatever the reader enters.
 */
import {
  STANDARD_VIAL_MG,
  getVialSizeOptions,
  getKnownVialSizes,
} from '../../data/vialSizes';

describe('the standard ladder', () => {
  it('is offered for every compound, known or not', () => {
    expect(getVialSizeOptions('some-unknown-peptide')).toEqual(STANDARD_VIAL_MG);
    expect(getVialSizeOptions('')).toEqual(STANDARD_VIAL_MG);
  });

  it('is sorted ascending, with no duplicates', () => {
    // Chips render in array order; an unsorted ladder reads as arbitrary.
    const sorted = [...STANDARD_VIAL_MG].sort((a, b) => a - b);
    expect(STANDARD_VIAL_MG).toEqual(sorted);
    expect(new Set(STANDARD_VIAL_MG).size).toBe(STANDARD_VIAL_MG.length);
  });

  it('contains only strengths that actually occur', () => {
    // Every value here was observed on a real vial. If someone adds a
    // plausible-looking round number that does not exist, this is the guard.
    const observed = new Set([2, 5, 10, 15, 20, 30, 50, 60, 100]);
    for (const mg of STANDARD_VIAL_MG) expect(observed.has(mg)).toBe(true);
  });

  it('covers the strengths that turn up most often', () => {
    for (const mg of [5, 10, 30]) expect(STANDARD_VIAL_MG).toContain(mg);
  });
});

describe('known per-compound strengths do NOT narrow the options', () => {
  /**
   * Edward, correcting the first cut of this: "this isnt a supplier app / its
   * education resource / just have it do the fuckin math for them let them
   * explore."
   *
   * The first version returned the per-compound list where we had one, so
   * Cerebrolysin offered 60 mg and nothing else and Follistatin-344 offered
   * only 1 mg. That is a catalogue, not a teaching tool — it tells a reader
   * their vial does not exist and refuses to do the arithmetic. These tests are
   * the inversion of the three that used to assert the narrowing.
   */
  it('cerebrolysin gets the full ladder, not just its 60 mg listing', () => {
    expect(getVialSizeOptions('cerebrolysin')).toEqual(STANDARD_VIAL_MG);
    expect(getVialSizeOptions('cerebrolysin')).toContain(5);
  });

  it('follistatin-344 gets the full ladder, not just its 1 mg listing', () => {
    expect(getVialSizeOptions('follistatin-344')).toEqual(STANDARD_VIAL_MG);
  });

  it('a compound we have data for and one we do not are offered the same choices', () => {
    // The single strongest statement of the model: what we happen to know
    // about a compound has no bearing on what the calculator will compute.
    expect(getVialSizeOptions('tirzepatide')).toEqual(getVialSizeOptions('not-a-real-peptide'));
  });

  it('takes no id at all', () => {
    // The options do not depend on the compound, so the argument is optional.
    // If a future change makes them compound-specific, this stops compiling —
    // which is the intended tripwire.
    expect(getVialSizeOptions()).toEqual(STANDARD_VIAL_MG);
  });

  it('never returns an empty list', () => {
    // An empty list renders no chips and silently removes the feature.
    for (const id of ['tirzepatide', 'cerebrolysin', 'unknown', 'ghrp-2', '']) {
      expect(getVialSizeOptions(id).length).toBeGreaterThan(0);
    }
  });
});

describe('recorded vial data stays internally consistent', () => {
  it('every recorded vial list is ascending and positive', () => {
    for (const id of ['tirzepatide', 'ghrp-2', 'aod-9604', 'cerebrolysin']) {
      const v = getKnownVialSizes(id)!;
      expect(v.vialMg.length).toBeGreaterThan(0);
      for (const mg of v.vialMg) expect(mg).toBeGreaterThan(0);
      expect(v.vialMg).toEqual([...v.vialMg].sort((a, b) => a - b));
    }
  });

  it('the GLP-* codes carry a CAS number', () => {
    // The CAS is what makes "GLP-2TZ is tirzepatide" auditable rather than a
    // plausible reading of a name.
    for (const id of ['tirzepatide', 'semaglutide', 'retatrutide', 'survodutide', 'mazdutide', 'cagrilintide']) {
      expect(getKnownVialSizes(id)?.cas).toMatch(/^\d+-\d+-\d$/);
    }
  });
});
