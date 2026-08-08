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
  it('is offered when we have no supplier list for the compound', () => {
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

describe('supplier list wins where we have one', () => {
  it('tirzepatide offers the five strengths the supplier sells', () => {
    expect(getVialSizeOptions('tirzepatide')).toEqual([5, 10, 15, 30, 60]);
  });

  it('cerebrolysin offers only 60 mg — the one size it ships in', () => {
    // Offering a 5 mg chip here would invite a concentration for a vial that
    // does not exist.
    expect(getVialSizeOptions('cerebrolysin')).toEqual([60]);
  });

  it('follistatin-344 offers 1 mg, outside the standard ladder', () => {
    // Proves the supplier list genuinely overrides rather than merging: 1 mg is
    // deliberately not in STANDARD_VIAL_MG.
    expect(getVialSizeOptions('follistatin-344')).toEqual([1]);
    expect(STANDARD_VIAL_MG).not.toContain(1);
  });

  it('never returns an empty list', () => {
    // An empty list renders no chips and silently removes the feature.
    for (const id of ['tirzepatide', 'cerebrolysin', 'unknown', 'ghrp-2']) {
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
