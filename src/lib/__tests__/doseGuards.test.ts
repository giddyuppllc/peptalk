/**
 * Dose GUARDS — the pregnancy contraindication and the range formatter.
 *
 * Stryker left 60 mutants alive in `doseSafety.ts`, the module that decides
 * whether a dose is questioned before it is written. The two areas with the most
 * survivors are the ones below, and one of them is the most consequential branch
 * in the app: whether a pregnant or nursing user is warned at all.
 *
 * The matching there is three OR'd conditions. Any one of them could be inverted
 * or dropped and every existing test still passed — meaning the warning could
 * silently stop appearing.
 *
 * Fixtures are real compounds with real canonical ranges, chosen so the
 * assertions break if the numbers move:
 *   BPC-157  → 333 mcg–333 mcg   (both sides below 1000 → mcg)
 *   TB-500   → 500 mcg–1.5 mg    (STRADDLES the boundary → both branches)
 *   MK-677   → 10 mg–25 mg       (both sides above → mg)
 */
import { checkDoseGuards, checkDoseSafety } from '../../services/doseSafety';

describe('pregnancy / nursing contraindication', () => {
  it('warns a pregnant user about a contraindicated compound', () => {
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 250,
      unit: 'mcg',
      pregnantOrNursing: true,
    });
    expect(w.map((x) => x.code)).toContain('pregnancy_contraindication');
  });

  it('does NOT warn when the profile does not say pregnant', () => {
    for (const flag of [false, undefined]) {
      const w = checkDoseGuards({
        peptideIdOrName: 'bpc-157',
        amount: 250,
        unit: 'mcg',
        pregnantOrNursing: flag,
      });
      expect(w.map((x) => x.code)).not.toContain('pregnancy_contraindication');
    }
  });

  it('matches on the peptide id exactly', () => {
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157', amount: 250, unit: 'mcg', pregnantOrNursing: true,
    });
    expect(w.some((x) => x.code === 'pregnancy_contraindication')).toBe(true);
  });

  it('matches case-insensitively and around whitespace', () => {
    // The needle is trimmed and lower-cased. Flip either and a user who typed
    // the compound normally stops being warned.
    for (const q of ['BPC-157', '  bpc-157  ', 'Bpc-157']) {
      const w = checkDoseGuards({
        peptideIdOrName: q, amount: 250, unit: 'mcg', pregnantOrNursing: true,
      });
      expect(w.some((x) => x.code === 'pregnancy_contraindication')).toBe(true);
    }
  });

  it('says nothing about pregnancy for a compound we do not know', () => {
    const w = checkDoseGuards({
      peptideIdOrName: 'not-a-real-compound-xyz',
      amount: 250, unit: 'mcg', pregnantOrNursing: true,
    });
    expect(w.map((x) => x.code)).not.toContain('pregnancy_contraindication');
  });

  it('puts the contraindication FIRST when a dose warning also applies', () => {
    // Ordering is deliberate — the contraindication is the more serious of the
    // two and the caller chains a confirm per warning in order.
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 500,          // far above the 333 mcg ceiling → also unusually_high
      unit: 'mg',
      pregnantOrNursing: true,
    });
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w[0].code).toBe('pregnancy_contraindication');
    expect(w.map((x) => x.code)).toContain('unusually_high');
  });

  it('carries a title and a non-empty message on every warning', () => {
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157', amount: 500, unit: 'mg', pregnantOrNursing: true,
    });
    for (const x of w) {
      expect(x.title.length).toBeGreaterThan(0);
      expect(x.message.length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list when nothing is wrong', () => {
    expect(
      checkDoseGuards({ peptideIdOrName: 'bpc-157', amount: 250, unit: 'mcg' }),
    ).toEqual([]);
  });
});

describe('the range shown to the user', () => {
  const rangeOf = (name: string) =>
    checkDoseSafety(name, 99999, 'mg').message?.match(/\(([^)]+)\)/)?.[1] ?? '';

  it('renders under 1000 mcg as mcg, with no decimals', () => {
    expect(rangeOf('BPC-157')).toBe('200 mcg–500 mcg');
  });

  it('renders at or above 1000 mcg as mg', () => {
    // Was MK-677 until 2026-09-16, when it became a safety-information-only
    // compound and stopped printing a range at all (see the test below).
    // Methylene Blue exercises the same whole-mg branch.
    expect(rangeOf('Methylene Blue')).toBe('5 mg–25 mg');
  });

  /**
   * Safety-information-only compounds (Edward, 2026-09-16): the guard still
   * FIRES, it just stops naming the recommended window. Both halves matter —
   * a test that only checked the range was gone would pass just as happily if
   * the guard had been switched off. See src/data/safetyOnlyCompounds.ts.
   */
  it('withholds the range for a safety-information-only compound, but still warns', () => {
    const result = checkDoseSafety('MK-677', 99999, 'mg');
    expect(result.safe).toBe(false);
    expect(result.code).toBe('unusually_high');
    expect(rangeOf('MK-677')).toBe('');
    expect(result.message).not.toContain('10 mg');
    expect(result.message).not.toContain('25 mg');
  });

  it('switches units mid-range at the 1000 mcg boundary', () => {
    // One string exercising both branches: the zero-decimal mcg format and the
    // mg format. (Jamie's TB-500 ruling: 330 mcg – 1 mg.)
    expect(rangeOf('TB-500')).toBe('330 mcg–1 mg');
  });

  it('keeps decimals in the mg format', () => {
    expect(rangeOf('thymosin-alpha-1')).toBe('1 mg–1.6 mg');
  });

  it('never shows a raw micrograms figure where mg was meant', () => {
    // A dropped conversion would surface as e.g. "1000 mcg" instead of "1 mg".
    expect(rangeOf('TB-500')).not.toContain('1000');
    expect(rangeOf('MK-677')).not.toContain('10000');
  });
});
