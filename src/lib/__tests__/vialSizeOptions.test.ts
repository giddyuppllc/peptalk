/**
 * Vial-size quick-picks.
 *
 * Edward: "vial size can change incrementally based on an individual supplier
 * — we should have the standard vial size options for the calc to do math and
 * let people select theirs off."
 *
 * That is the right model, and the app had the wrong one. Vial size is a
 * property of the SUPPLIER, not the compound: the same peptide ships as 5 mg
 * from one source and 10 or 30 from another. The mg field prefilled from the
 * reference, so anyone holding a different vial had to notice the mismatch and
 * retype it. That is exactly the retatrutide failure — a 10 mg vial silently
 * got 5 mg maths, and therefore the wrong unit count on every draw.
 */
import {
  STANDARD_VIAL_MG,
  getVialSizeOptions,
  getSupplierVialSizes,
} from '../../data/supplierVialSizes';

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

  it('contains only strengths actually observed in the supplier catalog', () => {
    // Every value here was read off a real product listing. If someone adds a
    // plausible-looking number that nobody sells, this is the guard.
    const observed = new Set([2, 5, 10, 15, 20, 30, 50, 60, 100]);
    for (const mg of STANDARD_VIAL_MG) expect(observed.has(mg)).toBe(true);
  });

  it('covers the sizes the catalog actually sells most', () => {
    for (const mg of [5, 10, 30]) expect(STANDARD_VIAL_MG).toContain(mg);
  });
});

describe('the supplier catalog does NOT narrow the options', () => {
  /**
   * Edward, correcting the first cut of this: "this isnt a supplier app / its
   * education resource / just have it do the fuckin math for them let them
   * explore."
   *
   * The first version returned the supplier's own list where we had one, so
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

  it('a compound we stock and one we do not are offered the same choices', () => {
    // The single strongest statement of the model: what the supplier happens to
    // sell has no bearing on what the calculator will compute.
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

describe('recorded supplier data stays internally consistent', () => {
  it('every recorded vial list is ascending and positive', () => {
    for (const id of ['tirzepatide', 'ghrp-2', 'aod-9604', 'cerebrolysin']) {
      const v = getSupplierVialSizes(id)!;
      expect(v.vialMg.length).toBeGreaterThan(0);
      for (const mg of v.vialMg) expect(mg).toBeGreaterThan(0);
      expect(v.vialMg).toEqual([...v.vialMg].sort((a, b) => a - b));
    }
  });

  it('the white-label codes carry a CAS number', () => {
    // The CAS is what makes "GLP-2TZ is tirzepatide" auditable rather than a
    // plausible reading of a product name.
    for (const id of ['tirzepatide', 'semaglutide', 'retatrutide', 'survodutide', 'mazdutide', 'cagrilintide']) {
      expect(getSupplierVialSizes(id)?.cas).toMatch(/^\d+-\d+-\d$/);
    }
  });
});
