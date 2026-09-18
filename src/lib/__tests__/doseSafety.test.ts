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
    // 2000 mcg is the discriminating dose: it exceeds 3x BPC-157's maximum
    // (Jamie's ruling, 500 mcg), but sits UNDER the flat 10,000 mcg ceiling used
    // for compounds with no known range. So it is flagged only if the name
    // actually resolves. (This used semaglutide at 8000 mcg until her 12 mg
    // ruling put 3x semaglutide above the flat ceiling, where no dose can tell
    // the two paths apart.)
    //
    // My first attempt at this test used 250 mg and passed while killing no
    // mutant — at that dose both the known and unknown paths flag it, so
    // breaking the lookup changed nothing. A test that cannot distinguish the
    // two paths does not test the lookup.
    expect(checkDoseSafety('bpc-157', 2000, 'mcg').safe).toBe(false);
    expect(checkDoseSafety('Bpc-157', 2000, 'mcg').safe).toBe(false);
    expect(checkDoseSafety('BPC-157', 2000, 'mcg').safe).toBe(false);
    // Control: an unknown compound at the same dose is NOT flagged, which is
    // what makes the three assertions above meaningful.
    expect(checkDoseSafety('zzz-not-real', 2000, 'mcg').safe).toBe(true);
  });

  it('flags 25 mg of semaglutide — knowing the compound is not a licence to log more', () => {
    // RESTORED 2026-09-16. This fixture was moved off semaglutide when
    // clinician rulings took precedence: Jamie's ruling spans the whole
    // titration (250 mcg to 12 mg), so `maxMcg * 3` became a 36 mg ceiling and
    // 25, 30 and 35 mg logged with NO warning — while typing "Ozempic", which
    // resolves to nothing, still warned at the same dose. The guard got looser
    // the more the app knew.
    //
    // A titration span is not a per-dose window. Until there is a per-compound
    // max-per-dose figure (Edward/Jamie), a resolved compound is held to the
    // stricter of its own 3x ceiling and the mg/mcg-confusion ceiling.
    for (const mg of [25, 30, 35]) {
      const r = checkDoseSafety('semaglutide', mg, 'mg');
      expect(r.safe).toBe(false);
      expect(r.code).toBe('unusually_high');
      expect(r.message).toBeTruthy();
    }
    // The top of Jamie's own range is NOT flagged: no clinical number moved.
    expect(checkDoseSafety('semaglutide', 12, 'mg').safe).toBe(true);
    // And the unresolved brand name behaves the same way, which is the point.
    expect(checkDoseSafety('Ozempic', 25, 'mg').safe).toBe(false);
  });

  it.each([
    ['retatrutide', 30, 'mg'],
    ['glutathione', 1000, 'mg'],
    ['nad-plus', 600, 'mg'],
    ['ipamorelin', 1500, 'mcg'],
    ['melanotan-2', 1500, 'mcg'],
    ['epithalon', 100, 'mg'],
    ['mazdutide', 30, 'mg'],
    ['survodutide', 30, 'mg'],
    ['ghk-cu', 100, 'mg'],
  ])('flags %s at %i %s, as it did before clinician rulings widened the ranges', (id, amount, unit) => {
    const r = checkDoseSafety(id as string, amount as number, unit as string);
    expect(r.safe).toBe(false);
    expect(r.code).toBe('unusually_high');
  });

  it('does NOT warn on a compound whose own documented range is in milligrams', () => {
    // The flat 10 mg ceiling is a mg/mcg-confusion heuristic. Where the
    // compound's own reference range says hundreds of milligrams are normal,
    // that is positive evidence the unknown path does not have — so the
    // ceiling lifts to the documented maximum. Without this the guard would
    // fire on 21 compounds' own reference doses, which is how a warning stops
    // being read.
    expect(checkDoseSafety('alpha-gpc', 600, 'mg').safe).toBe(true);
    expect(checkDoseSafety('l-carnitine', 1000, 'mg').safe).toBe(true);
    expect(checkDoseSafety('mk-677', 25, 'mg').safe).toBe(true);
    expect(checkDoseSafety('glutathione', 400, 'mg').safe).toBe(true);
    expect(checkDoseSafety('nad-plus', 200, 'mg').safe).toBe(true);
    expect(checkDoseSafety('tirzepatide', 15, 'mg').safe).toBe(true);
    // ...but one step past the documented maximum, it warns.
    expect(checkDoseSafety('glutathione', 401, 'mg').safe).toBe(false);
    expect(checkDoseSafety('mk-677', 26, 'mg').safe).toBe(false);
  });

  it('holds a resolved compound to the flat ceiling when its own range is small', () => {
    // bpc-157's range is measured in micrograms, so 10 mg is over BOTH rules
    // and the compound-specific message wins. 11 mg of an unresolved compound
    // gets the unit-confusion message. Neither is new copy.
    const known = checkDoseSafety('bpc-157', 11, 'mg');
    expect(known.safe).toBe(false);
    expect(known.message).toContain('typical maximum');
    const unknown = checkDoseSafety('zzz-not-real', 11, 'mg');
    expect(unknown.safe).toBe(false);
    expect(unknown.message).toContain('mg vs mcg');
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
