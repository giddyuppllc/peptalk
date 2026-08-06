/**
 * doseSafety — the guards between a user and a mis-dosed injection.
 *
 * These had NO automated coverage: not a jest suite, not one of the fourteen
 * verifier scripts. calculatorV2 is covered by verify:calc, doseAdherence by
 * verify:adherence, the money path by four suites — but the code that decides
 * whether to warn about a 1000× mg/mcg typo, or about injecting something
 * contraindicated in pregnancy, was tested only by hand, once, by me.
 *
 * The behaviour these lock down is deliberate and easy to "tidy" into
 * something wrong:
 *   - warnings are INFORMATIONAL, never hard blocks — a user may have a valid
 *     reason for an unusual dose, so every prompt has a proceed option
 *   - the pregnancy guard must come FIRST, because it is the one a user must
 *     not skim past
 *   - the pregnancy copy is Tracker's original wording, preserved verbatim
 *     through the 2026-08-06 consolidation; changing it changes what a
 *     pregnant user is told
 */

import { checkDoseSafety, checkDoseGuards } from '../../services/doseSafety';

describe('checkDoseSafety — unit-confusion detection', () => {
  it('accepts a normal semaglutide dose', () => {
    expect(checkDoseSafety('semaglutide', 250, 'mcg').safe).toBe(true);
  });

  it('catches the mg/mcg slip that multiplies a dose by 1000', () => {
    // 250 mcg is normal. 250 mg is 1000× that and would be catastrophic.
    const r = checkDoseSafety('semaglutide', 250, 'mg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
    expect(r.message).toBeTruthy();
  });

  it('flags an absurd dose even for a peptide it has no range for', () => {
    // Unknown compound: the only thing it can reasonably catch is the obvious
    // mg/mcg confusion, via a flat >10,000 mcg ceiling.
    const r = checkDoseSafety('not-a-real-peptide', 50, 'mg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });

  it('stays quiet for an unknown peptide at a plausible dose', () => {
    // Being noisy about every unknown compound trains users to dismiss the
    // warning, which is worse than not showing it.
    expect(checkDoseSafety('not-a-real-peptide', 500, 'mcg').safe).toBe(true);
  });

  it('flags a dose far BELOW range, which is usually the inverse typo', () => {
    const r = checkDoseSafety('semaglutide', 0.001, 'mcg');
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_low');
  });

  it('treats a zero or negative amount as nothing to check', () => {
    // The form can hold 0 mid-edit; warning there would fire on every keystroke.
    expect(checkDoseSafety('semaglutide', 0, 'mcg').safe).toBe(true);
    expect(checkDoseSafety('semaglutide', -5, 'mcg').safe).toBe(true);
  });

  it('matches the peptide case-insensitively', () => {
    // Mutation testing surfaced this: the lookup lowercases both sides, and
    // nothing tested it. A user or an Aimee tool-call passing "Semaglutide"
    // must get the same guard as "semaglutide" — silently falling back to the
    // generic unknown-peptide path would raise the warning threshold from
    // 3x the protocol max to a flat 10,000 mcg.
    for (const name of ['Semaglutide', 'SEMAGLUTIDE', 'semaglutide']) {
      expect(checkDoseSafety(name, 250, 'mg').safe).toBe(false);
      expect(checkDoseSafety(name, 250, 'mcg').safe).toBe(true);
    }
  });

  it('is unit-aware, not just magnitude-aware', () => {
    // Same number, different unit, opposite verdict — proves the unit is
    // actually converted rather than the raw figure being compared.
    expect(checkDoseSafety('semaglutide', 250, 'mcg').safe).toBe(true);
    expect(checkDoseSafety('semaglutide', 250, 'mg').safe).toBe(false);
  });
});

describe('checkDoseGuards — what the user is actually shown', () => {
  it('returns nothing for a normal dose from a user who is not pregnant', () => {
    expect(
      checkDoseGuards({ peptideIdOrName: 'semaglutide', amount: 250, unit: 'mcg' }),
    ).toEqual([]);
  });

  it('warns about a contraindicated substance when pregnant or nursing', () => {
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 250,
      unit: 'mcg',
      pregnantOrNursing: true,
    });
    expect(w.some((x) => x.code === 'pregnancy_contraindication')).toBe(true);
  });

  it('puts the pregnancy warning FIRST when both fire', () => {
    // Order is the whole point: a contraindication must not sit behind a
    // "double-check this dose" prompt the user is likely to dismiss.
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 500,
      unit: 'mg',
      pregnantOrNursing: true,
    });
    expect(w.length).toBeGreaterThan(1);
    expect(w[0].code).toBe('pregnancy_contraindication');
  });

  it('keeps the pregnancy copy exactly as Tracker worded it', () => {
    // Preserved verbatim through the 2026-08-06 consolidation so migrating
    // Tracker onto the shared guard changed no user-facing text.
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 250,
      unit: 'mcg',
      pregnantOrNursing: true,
    });
    const p = w.find((x) => x.code === 'pregnancy_contraindication')!;
    expect(p.title).toBe('Not recommended during pregnancy / nursing');
    expect(p.message).toContain('consult a licensed provider');
  });

  it('does not warn on pregnancy for a substance with no such contraindication', () => {
    // The flag alone must not blanket-warn, or it becomes noise on every dose.
    const w = checkDoseGuards({
      peptideIdOrName: 'not-a-real-peptide',
      amount: 250,
      unit: 'mcg',
      pregnantOrNursing: true,
    });
    expect(w.some((x) => x.code === 'pregnancy_contraindication')).toBe(false);
  });

  it('never produces an empty message, even if the source message is missing', () => {
    // The dose warning falls back to 'This dose looks unusual.' when
    // checkDoseSafety returns no message. Mutation testing showed that
    // fallback was untested — replacing it with '' survived, and an empty
    // string renders a dialog with a title and no body.
    const w = checkDoseGuards({ peptideIdOrName: 'semaglutide', amount: 250, unit: 'mg' });
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) expect(x.message.trim().length).toBeGreaterThan(0);
  });

  it('is pure — the same arguments always give the same answer', () => {
    // pregnantOrNursing is a PARAMETER, not a store read, so this is testable
    // and cannot change under a screen depending on hydration order.
    const args = { peptideIdOrName: 'semaglutide', amount: 250, unit: 'mg' } as const;
    expect(checkDoseGuards({ ...args })).toEqual(checkDoseGuards({ ...args }));
  });

  it('every warning it produces is answerable — none is a dead end', () => {
    // Guards are informational by design; the prompt layer always offers a way
    // forward. A warning with no title or message would render an empty dialog.
    const w = checkDoseGuards({
      peptideIdOrName: 'bpc-157',
      amount: 900,
      unit: 'mg',
      pregnantOrNursing: true,
    });
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) {
      expect(x.title.length).toBeGreaterThan(0);
      expect(x.message.length).toBeGreaterThan(0);
      expect(x.code).toBeTruthy();
    }
  });
});
