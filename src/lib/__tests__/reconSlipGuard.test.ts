/**
 * The mg/mcg slip on the reconstitution calculator.
 *
 * That screen has three free-text inputs and TWO unit toggles, and doseUnit
 * defaults to 'mg'. A user typing 250 meaning 250 mcg, without noticing the
 * toggle, gets a syringe draw computed for 250 mg — 1000x — presented with the
 * same confidence as a correct answer. It was the only calculator the dose
 * guards were never wired into.
 *
 * WHY NOT doseSafety's unknown-compound path
 * The first implementation used checkDoseSafety('', amount, unit), which flags
 * anything over 10,000 mcg as probable mg/mcg confusion. A test caught that it
 * fires on LEGITIMATE input: 20 mg is 20,000 mcg, so Cerebrolysin (20-30 mg)
 * and thymalin (up to 20 mg) would warn on every correct entry. A warning that
 * fires when nothing is wrong is how users learn to ignore warnings.
 *
 * This screen knows the VIAL as well as the dose, so it can use a rule that is
 * always true: a single dose cannot exceed the vial's entire contents. No
 * compound knowledge, no unit assumptions, and it cannot fire on a correct
 * entry. These tests pin both halves — that it catches the slip, and that it
 * stays silent on every realistic correct entry.
 */

/** Mirrors the screen's normalisation and guard exactly. */
function slipWarning(
  vialAmount: number,
  vialUnit: 'mg' | 'mcg',
  doseAmount: number,
  doseUnit: 'mg' | 'mcg',
): string | null {
  const vialMcg = vialUnit === 'mg' ? vialAmount * 1000 : vialAmount;
  const doseMcg = doseUnit === 'mg' ? doseAmount * 1000 : doseAmount;
  if (vialMcg <= 0 || doseMcg <= 0) return null;
  if (doseMcg <= vialMcg) return null;
  return 'exceeds vial';
}

describe('catches the slip', () => {
  it('250 typed as mg against a 10 mg vial', () => {
    // The exact reported shape: meant 250 mcg, left the toggle on mg.
    expect(slipWarning(10, 'mg', 250, 'mg')).not.toBeNull();
  });

  it('any dose larger than the vial, at any vial size', () => {
    expect(slipWarning(5, 'mg', 100, 'mg')).not.toBeNull();
    expect(slipWarning(10, 'mg', 500, 'mg')).not.toBeNull();
    expect(slipWarning(30, 'mg', 1000, 'mg')).not.toBeNull();
  });

  it('catches it when the VIAL toggle is the one that slipped', () => {
    // 10 mcg vial is itself a slip; a normal 250 mcg dose then exceeds it.
    expect(slipWarning(10, 'mcg', 250, 'mcg')).not.toBeNull();
  });
});

describe('stays silent on correct entries', () => {
  it('a normal mcg dose from an mg vial', () => {
    // The overwhelmingly common case: 250 mcg out of a 10 mg vial.
    expect(slipWarning(10, 'mg', 250, 'mcg')).toBeNull();
    expect(slipWarning(5, 'mg', 500, 'mcg')).toBeNull();
  });

  it('genuinely mg-dosed powders — the case that broke the first attempt', () => {
    // Cerebrolysin 20-30 mg, thymalin 5-20 mg, snap-8 3-10 mg. The old
    // >10,000 mcg rule warned on every one of these.
    expect(slipWarning(30, 'mg', 20, 'mg')).toBeNull();
    expect(slipWarning(30, 'mg', 30, 'mg')).toBeNull();
    expect(slipWarning(20, 'mg', 20, 'mg')).toBeNull();
    expect(slipWarning(10, 'mg', 5, 'mg')).toBeNull();
  });

  it('a dose exactly equal to the vial', () => {
    // Single-dose vials are real; equality must not warn.
    expect(slipWarning(10, 'mg', 10000, 'mcg')).toBeNull();
    expect(slipWarning(10, 'mg', 10, 'mg')).toBeNull();
  });

  it('while the form is still incomplete', () => {
    // A warning before the user has finished typing is pure noise.
    expect(slipWarning(0, 'mg', 250, 'mg')).toBeNull();
    expect(slipWarning(10, 'mg', 0, 'mg')).toBeNull();
    expect(slipWarning(0, 'mg', 0, 'mg')).toBeNull();
  });
});

describe('boundary', () => {
  it('fires just above the vial and not at it', () => {
    expect(slipWarning(10, 'mg', 10000, 'mcg')).toBeNull();
    expect(slipWarning(10, 'mg', 10001, 'mcg')).not.toBeNull();
  });
});
