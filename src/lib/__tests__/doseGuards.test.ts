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
    expect(rangeOf('BPC-157')).toBe('333 mcg–333 mcg');
  });

  it('renders at or above 1000 mcg as mg', () => {
    expect(rangeOf('MK-677')).toBe('10 mg–25 mg');
  });

  it('switches units mid-range at the 1000 mcg boundary', () => {
    // The single most informative fixture: one string exercising both branches,
    // the two-decimal mg format and the zero-decimal mcg format.
    expect(rangeOf('TB-500')).toBe('500 mcg–1.5 mg');
  });

  it('never shows a raw micrograms figure where mg was meant', () => {
    // A dropped conversion would surface as e.g. "1500 mcg" instead of "1.5 mg".
    expect(rangeOf('TB-500')).not.toContain('1500');
    expect(rangeOf('MK-677')).not.toContain('10000');
  });
});
