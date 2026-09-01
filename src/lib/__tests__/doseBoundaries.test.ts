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
 *   BPC-157 canonical 333 mcg → high fires ABOVE 3× (999), low fires BELOW /10 (33.3)
 *   unknown compound          → mg/mcg confusion fires ABOVE 10000 mcg
 */
import { checkDoseSafety, checkDoseGuards } from '../../services/doseSafety';

describe('the >3x ceiling is exclusive', () => {
  it('allows exactly 3× the maximum', () => {
    expect(checkDoseSafety('BPC-157', 999, 'mcg').safe).toBe(true);
  });
  it('flags one microgram past it', () => {
    const r = checkDoseSafety('BPC-157', 1000, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });
});

describe('the <1/10 floor is exclusive', () => {
  it('allows a dose just above a tenth of the minimum', () => {
    expect(checkDoseSafety('BPC-157', 34, 'mcg').safe).toBe(true);
  });
  it('flags one just below it', () => {
    const r = checkDoseSafety('BPC-157', 33, 'mcg');
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
