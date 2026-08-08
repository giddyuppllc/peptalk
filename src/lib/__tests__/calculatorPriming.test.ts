/**
 * The calculator must open ready to compute — for EVERY compound.
 *
 * Edward: "this isnt a supplier app / its education resource / just have it do
 * the fuckin math for them let them explore."
 *
 * It was not doing the maths for most of them. The priming effect in
 * app/doses/calculator.tsx bailed out with `if (!meta || !ref) return` when a
 * compound had no curated reconstitution reference. Only 33 of 79 compounds
 * have one, so for the other 46 — 58% of the library — the mg field stayed
 * empty, which made `result` null, which meant no concentration, no draw
 * volume, no vial duration. The screen rendered perfectly: inputs, labels,
 * chips, all present and all inert. Nothing said "unavailable", so it read as
 * a working calculator that simply had nothing to say.
 *
 * That is the house failure mode — the feature exists, it just never reaches
 * the user — so it gets a test that walks the whole library rather than a
 * sample.
 */
import { PEPTIDES } from '../../data/peptides';
import { getDosingReference } from '../../data/peptideDosingReference';
import { getCalculatorMetadata } from '../../data/calculatorMetadata';
import {
  getDefaultVialMg,
  getVialSizeOptions,
  DEFAULT_VIAL_MG,
  SUPPLIER_VIAL_SIZES,
} from '../../data/supplierVialSizes';
import { calculate } from '../../utils/calculatorV2';

/** Mirrors the priming effect in app/doses/calculator.tsx. */
function primeInputs(peptideId: string) {
  const ref = getDosingReference(peptideId);
  const meta = getCalculatorMetadata(peptideId);
  return {
    peptideMgInVial: getDefaultVialMg(peptideId, ref?.vialMg),
    diluentVolumeMl: meta.recommendedReconstitutionMl ?? meta.standardVialSizeMl,
    vialSizeMl: meta.standardVialSizeMl,
    hasReference: ref != null,
  };
}

describe('every compound primes to a computable state', () => {
  it('the library is big enough for this test to mean something', () => {
    // Guards against the suite silently passing on an empty import.
    expect(PEPTIDES.length).toBeGreaterThan(70);
  });

  it('most of the library has NO reference — which is why priming cannot depend on one', () => {
    // Records the actual ratio. If a future change makes references mandatory
    // again, the number here is the cost of that decision.
    const without = PEPTIDES.filter((p) => !getDosingReference(p.id));
    expect(without.length).toBeGreaterThan(PEPTIDES.length / 2);
  });

  it.each(PEPTIDES.map((p) => [p.id]))('%s computes a real concentration', (id) => {
    const { peptideMgInVial, diluentVolumeMl, vialSizeMl } = primeInputs(id);

    // Both inputs must be usable numbers — an empty string parses to NaN and
    // that NaN is precisely what returned null and blanked the screen.
    expect(Number.isFinite(peptideMgInVial)).toBe(true);
    expect(peptideMgInVial).toBeGreaterThan(0);
    expect(Number.isFinite(diluentVolumeMl)).toBe(true);
    expect(diluentVolumeMl).toBeGreaterThan(0);

    const result = calculate({
      peptideMgInVial,
      diluentVolumeMl,
      vialSizeMl,
      perShotDoseMg: 0, // no dose invented — see below
    });
    expect(result).not.toBeNull();

    // The number the whole screen is built on.
    const conc = peptideMgInVial / diluentVolumeMl;
    expect(Number.isFinite(conc)).toBe(true);
    expect(conc).toBeGreaterThan(0);
  });
});

describe('priming prefers real data over the default', () => {
  it('a curated reference wins over everything', () => {
    // Cerebrolysin's reference says 60 mg; its supplier listing also says 60.
    // Pass a deliberately different reference value to prove precedence rather
    // than coincidence.
    expect(getDefaultVialMg('cerebrolysin', 60)).toBe(60);
    expect(getDefaultVialMg('cerebrolysin', 25)).toBe(25);
  });

  it('falls back to the supplier catalog when there is no reference', () => {
    // Thymalin has no reconstitution reference but the catalog lists 10 mg.
    expect(getDosingReference('thymalin')).toBeNull();
    expect(getDefaultVialMg('thymalin', undefined)).toBe(10);
    // Follistatin-344 ships at 1 mg — well off the standard ladder. Real data
    // must beat the generic default, or this compound primes 10x wrong.
    expect(getDefaultVialMg('follistatin-344', undefined)).toBe(1);
    expect(SUPPLIER_VIAL_SIZES['follistatin-344'].vialMg).toEqual([1]);
  });

  it('falls back to the common default only when nothing is known', () => {
    expect(getDefaultVialMg('not-a-real-peptide', undefined)).toBe(DEFAULT_VIAL_MG);
    expect(getDefaultVialMg(undefined, undefined)).toBe(DEFAULT_VIAL_MG);
  });

  it('ignores a nonsense reference value rather than priming zero', () => {
    // A 0 or negative vialMg would divide through to an infinite or negative
    // concentration and poison every downstream number.
    expect(getDefaultVialMg('thymalin', 0)).toBe(10);
    expect(getDefaultVialMg('thymalin', -5)).toBe(10);
  });
});

describe('priming does NOT invent a dose', () => {
  /**
   * The line this app cannot cross. Choosing which number to put in an
   * editable vial-size box asserts nothing — the value is on screen with
   * one-tap alternatives beside it. Choosing a DOSE would assert clinical fact
   * we do not have, for a compound we deliberately have no protocol for.
   */
  it('a compound with no reference offers no schedule to draw a dose from', () => {
    for (const id of ['thymalin', 'ss-31', 'ara-290', 'noopept']) {
      expect(getDosingReference(id)).toBeNull();
    }
  });

  it('a zero dose still yields a usable concentration, just no draw', () => {
    // This is the intended resting state: the user learns what their vial
    // concentration is, then types the dose they want to explore.
    const { peptideMgInVial, diluentVolumeMl, vialSizeMl } = primeInputs('thymalin');
    const result = calculate({ peptideMgInVial, diluentVolumeMl, vialSizeMl, perShotDoseMg: 0 });
    expect(result).not.toBeNull();
    expect(peptideMgInVial / diluentVolumeMl).toBeCloseTo(10 / 3, 5);
  });
});

describe('the vial ladder stays available everywhere', () => {
  it.each(PEPTIDES.map((p) => [p.id]))('%s offers alternatives to the primed value', (id) => {
    // The prefill is only safe because changing it is one visible tap. If the
    // chips ever disappear for a compound, the primed number becomes a hidden
    // assumption again — which is the retatrutide failure exactly.
    expect(getVialSizeOptions(id).length).toBeGreaterThan(1);
  });
});
