/**
 * The exact edges of every dose threshold, and each branch of the
 * contraindication matcher.
 *
 * Stryker kept flipping `>` to `>=` (and `<` to `<=`) in doseSafety and nothing
 * failed, because every existing test sat comfortably inside a range rather than
 * on its edge. An off-by-one there is not academic: it decides whether a user is
 * asked to confirm a dose or not.
 *
 * The contraindication matcher is three OR'd conditions, and each could be
 * replaced with `false` without a single test noticing — so only one of the
 * three was ever exercised. Each now has its own case.
 *
 * Numbers are measured against the real catalog, not guessed:
 *   BPC-157 canonical 200-500 mcg (Jamie's ruling) → high fires AT and above
 *   3× (1500), low fires BELOW /10 (20)
 *   unknown compound          → mg/mcg confusion fires ABOVE 10000 mcg
 *   resolved compound         → the same 10000 mcg ceiling, lifted only to the
 *                               compound's own documented maximum
 */
import { checkDoseSafety, checkDoseGuards } from '../../services/doseSafety';

describe('the 3× ceiling is INCLUSIVE', () => {
  // CHANGED 2026-09-16, deliberately. This asserted that exactly 3× the
  // maximum is allowed. Once clinician rulings took precedence, the ceiling
  // moved with them: ipamorelin's and melanotan-2's maxima became 500 mcg, so
  // exactly 3× is 1500 mcg — a dose that warned before the rulings and went
  // silent after, on an exclusive comparison. Making it inclusive can only ADD
  // warnings (swept: 4108 cells, 0 lost, 155 added), and 1500 mcg is not a
  // dose a guard should wave through on a rounding technicality.
  it('flags exactly 3× the maximum', () => {
    const r = checkDoseSafety('BPC-157', 1500, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });
  it('allows one microgram below it', () => {
    expect(checkDoseSafety('BPC-157', 1499, 'mcg').safe).toBe(true);
  });
  it('flags one microgram past it', () => {
    const r = checkDoseSafety('BPC-157', 1501, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });
});

describe('the mg/mcg ceiling applies to a RESOLVED compound too', () => {
  // Lifted to the compound's own documented maximum, so a compound whose
  // reference range is in milligrams is not warned about at its own dose.
  it('holds a mcg-scale compound to the flat 10 mg ceiling', () => {
    // BPC-157's 3× ceiling (1500 mcg) is the stricter of the two here, so the
    // range-naming message wins; the point is that neither rule is skipped.
    expect(checkDoseSafety('BPC-157', 10, 'mg').safe).toBe(false);
  });
  it('lifts it to the documented maximum for a mg-scale compound', () => {
    // Glutathione's clinician range is 200–400 mg. 400 mg is its own maximum
    // and must not warn; 401 mg is past everything the data supports.
    expect(checkDoseSafety('glutathione', 400, 'mg').safe).toBe(true);
    expect(checkDoseSafety('glutathione', 401, 'mg').safe).toBe(false);
  });
});

describe('the <1/10 floor is exclusive', () => {
  it('allows a dose just above a tenth of the minimum', () => {
    expect(checkDoseSafety('BPC-157', 20, 'mcg').safe).toBe(true);
  });
  it('flags one just below it', () => {
    const r = checkDoseSafety('BPC-157', 19, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_low');
  });
});

describe('the unknown-compound mg/mcg ceiling is exclusive', () => {
  it('allows exactly 10000 mcg', () => {
    expect(checkDoseSafety('zzz-unknown-compound', 10000, 'mcg').safe).toBe(true);
  });
  it('flags 10001', () => {
    const r = checkDoseSafety('zzz-unknown-compound', 10001, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });
  it('reaches the same ceiling through the mg conversion', () => {
    // 10 mg == 10000 mcg exactly: allowed. 11 mg is over.
    expect(checkDoseSafety('zzz-unknown-compound', 10, 'mg').safe).toBe(true);
    expect(checkDoseSafety('zzz-unknown-compound', 11, 'mg').safe).toBe(false);
  });
});

describe('each branch of the contraindication matcher, separately', () => {
  const preg = (q: string) =>
    checkDoseGuards({
      peptideIdOrName: q, amount: 250, unit: 'mcg', pregnantOrNursing: true,
    }).some((w) => w.code === 'pregnancy_contraindication');

  it('branch 1 — the query IS the peptide id', () => {
    expect(preg('bpc-157')).toBe(true);
  });

  it('branch 2 — the query is part of the protocol NAME, not the id', () => {
    // "BPC-157 Standard SubQ Protocol". This branch alone must carry it.
    expect(preg('standard subq')).toBe(true);
  });

  it('branch 3 — the query CONTAINS the peptide id', () => {
    // Someone typing a fuller phrase must still be warned.
    expect(preg('bpc-157 injection morning')).toBe(true);
  });

  it('and a query matching none of the three warns about nothing', () => {
    expect(preg('zzz-unknown-compound')).toBe(false);
  });
});
