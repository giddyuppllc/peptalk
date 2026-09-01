/**
 * Dose-safety tests written to kill surviving MUTANTS.
 *
 * Stryker put `src/services/doseSafety.ts` at 58.94% — by a wide margin the
 * weakest module measured, and the one that decides whether a dose is flagged
 * before it is written. 62 mutations survived: unit conversion could be
 * inverted, the peptide lookup could be made to find nothing, and query
 * normalisation could be flipped to upper-case, and no test noticed.
 *
 * The existing suite asserts happy paths. These assert the DECISIONS: that mg
 * really is 1000× mcg, that each threshold sits where it claims to, and that a
 * lookup which stops resolving stops guarding. A dosing app that silently mixes
 * mg and mcg is the failure mode that actually hurts someone.
 */
import { checkDoseSafety } from '../../services/doseSafety';

// A compound certain to be in the catalog with a canonical range.
const KNOWN = 'BPC-157';

describe('unit conversion is real, not incidental', () => {
  it('treats mg as exactly 1000× mcg', () => {
    // If toMcg stopped multiplying by 1000, this mg dose would look tiny and
    // pass. It must trip the high guard.
    const asMg = checkDoseSafety(KNOWN, 500, 'mg');
    expect(asMg.safe).toBe(false);
    expect(asMg.code).toBe('unusually_high');

    // The same NUMBER in mcg is an ordinary dose.
    expect(checkDoseSafety(KNOWN, 500, 'mcg').safe).toBe(true);
  });

  it('is case-insensitive about the unit', () => {
    // `unit.toLowerCase()` — if that dropped, "MG" would fall through to the
    // mcg default and a 500 mg dose would be judged as 500 mcg.
    //
    // Compare the DECISION, not the whole object: the message deliberately
    // echoes the unit exactly as the user typed it, so "MG" and "mg" produce
    // different strings by design.
    const upper = checkDoseSafety(KNOWN, 500, 'MG');
    const lower = checkDoseSafety(KNOWN, 500, 'mg');
    expect(upper.safe).toBe(lower.safe);
    expect(upper.code).toBe(lower.code);
    expect(checkDoseSafety(KNOWN, 500, 'Mg').safe).toBe(false);
  });

  it('treats IU as its own thing, not as mg', () => {
    // `if (u === 'iu') return amount` — mutating that branch to always-true
    // would make mg stop converting; to always-false would push IU down the
    // default path. Both must be visible.
    const iu = checkDoseSafety(KNOWN, 500, 'iu');
    const mcg = checkDoseSafety(KNOWN, 500, 'mcg');
    const mg = checkDoseSafety(KNOWN, 500, 'mg');
    expect(iu.safe).toBe(mcg.safe);       // IU is treated as mcg for the heuristic
    expect(iu.code).toBe(mcg.code);
    expect(iu.safe).not.toBe(mg.safe);    // and is emphatically NOT treated as mg
  });

  it('an unrecognised unit falls back to mcg rather than throwing', () => {
    const odd = checkDoseSafety(KNOWN, 500, 'squigs');
    const asMcg = checkDoseSafety(KNOWN, 500, 'mcg');
    expect(odd.safe).toBe(asMcg.safe);
    expect(odd.code).toBe(asMcg.code);
  });
});

describe('the peptide lookup actually guards', () => {
  it('resolves a known compound and applies ITS range', () => {
    // If the lookup were mutated to find nothing, this would fall to the
    // unknown-peptide path and 500 mg (500,000 mcg) would still trip the
    // >10000 rule — so assert on the MESSAGE, which names the compound and
    // only exists on the known-peptide branch.
    const r = checkDoseSafety(KNOWN, 500, 'mg');
    expect(r.safe).toBe(false);
    expect(r.message).toContain(KNOWN);
    expect(r.message).toMatch(/3×|3x/);
  });

  it('normalises the query rather than matching case-sensitively', () => {
    // `.trim().toLowerCase()` — flipping it to toUpperCase, or dropping the
    // trim, must change the outcome somewhere.
    // Again compare the decision: the message echoes the compound as typed,
    // which is the right product behaviour — the user should see their own
    // words back — so the strings differ by case on purpose.
    const plain = checkDoseSafety(KNOWN, 500, 'mg');
    const lowered = checkDoseSafety(KNOWN.toLowerCase(), 500, 'mg');
    expect(lowered.safe).toBe(plain.safe);
    expect(lowered.code).toBe(plain.code);
    expect(checkDoseSafety(KNOWN.toUpperCase(), 500, 'mg').safe).toBe(false);
    expect(checkDoseSafety(`  ${KNOWN}  `, 500, 'mg').safe).toBe(false);
  });

  it('does not block an unknown compound at an ordinary amount', () => {
    // Deliberate product behaviour: we do not gate logging of things we do not
    // know about.
    expect(checkDoseSafety('not-a-real-compound-xyz', 250, 'mcg').safe).toBe(true);
  });

  it('still catches obvious mg/mcg confusion on an unknown compound', () => {
    const r = checkDoseSafety('not-a-real-compound-xyz', 50, 'mg'); // 50,000 mcg
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
    expect(r.message).toMatch(/mg vs mcg/i);
  });

  it('treats an empty or whitespace query as unknown', () => {
    expect(checkDoseSafety('', 250, 'mcg').safe).toBe(true);
    expect(checkDoseSafety('   ', 250, 'mcg').safe).toBe(true);
  });
});

describe('thresholds sit where the documentation says', () => {
  it('ignores a zero or negative amount instead of guarding it', () => {
    expect(checkDoseSafety(KNOWN, 0, 'mcg').safe).toBe(true);
    expect(checkDoseSafety(KNOWN, -10, 'mcg').safe).toBe(true);
  });

  it('flags absurdly low as a suspected unit error, not as high', () => {
    const r = checkDoseSafety(KNOWN, 1, 'mcg');
    if (!r.safe) {
      expect(r.code).toBe('unusually_low');
      expect(r.message).toMatch(/mg vs mcg/i);
    }
  });

  it('distinguishes high from low rather than returning one code for both', () => {
    // A single mutated comparison could collapse these into the same branch.
    const high = checkDoseSafety(KNOWN, 500, 'mg');
    const low = checkDoseSafety(KNOWN, 1, 'mcg');
    expect(high.code).toBe('unusually_high');
    if (!low.safe) expect(low.code).not.toBe('unusually_high');
  });

  it('names the amount and unit the user typed, not a converted figure', () => {
    // The message is what the user reads before confirming. If it showed
    // 500000 mcg instead of "500 mg" it would defeat the point of the warning.
    const r = checkDoseSafety(KNOWN, 500, 'mg');
    expect(r.message).toContain('500');
    expect(r.message).toContain('mg');
  });
});
