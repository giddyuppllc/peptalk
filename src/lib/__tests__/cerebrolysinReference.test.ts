/**
 * Cerebrolysin — the first of the 16 injectables that had no reconstitution
 * reference, now closed with Jamie's spec.
 *
 * This compound has been wrong three separate ways in one week, so its numbers
 * are pinned rather than trusted:
 *   1. Dosed in 'ml' (the European ready-mixed ampoule) when what ships is a
 *      lyophilised powder dosed by mass.
 *   2. That 'ml' value then RENDERED as 'mcg', because the formatter converted
 *      only 'mg' and passed everything else through untouched.
 *   3. No dosing card at all, because it had no row in the dosing table.
 *
 * The spec's internal consistency is the reason it can be taken as given, so
 * that consistency is what gets asserted: 60 mg in 3 mL is 20 mg/mL, a U-100
 * syringe draws 100 units to 1 mL, and 1 mL at 20 mg/mL is the stated 20 mg.
 * If any one of those drifts, the other two catch it.
 */
import { getDosingReference } from '../../data/peptideDosingReference';
import { getProtocolsByPeptide } from '../../data/protocols';
import { getDosingTableEntry } from '../../data/peptideDosingTable';

const ref = () => getDosingReference('cerebrolysin');

describe('cerebrolysin reconstitution reference', () => {
  it('exists at all', () => {
    expect(ref()).not.toBeNull();
  });

  it('matches the supplier vial: 60 mg', () => {
    // Corroborated independently by the AgeReCode catalog listing
    // "Cerebrolysin (60mg), Lyophilized Powder".
    expect(ref()?.vialMg).toBe(60);
  });

  it('60 mg in 3 mL really is 20 mg/mL', () => {
    const r = ref()!;
    expect(r.diluentMl).toBe(3);
    expect(r.mgPerMl).toBe(20);
    // The stored concentration must equal the derived one — a stored value that
    // disagrees with its own inputs is how the MOTS-c defect worked.
    expect(r.mgPerMl).toBeCloseTo(r.vialMg / r.diluentMl, 5);
  });

  it('reconstitutes in bacteriostatic water', () => {
    expect(ref()?.diluent).toBe('bac_water');
  });
});

describe('cerebrolysin dose schedule', () => {
  it('the standard dose is 20 mg = 100 units = 1 mL', () => {
    const std = ref()!.schedule.find((s) => s.label === 'Standard')!;
    expect(std.doseMcg).toBe(20000);
    expect(std.units).toBe(100);
    // 100 units on a U-100 syringe is 1.0 mL; at 20 mg/mL that is 20 mg.
    const mlDrawn = std.units! / 100;
    expect(mlDrawn * ref()!.mgPerMl).toBeCloseTo(std.doseMcg / 1000, 5);
  });

  it('every scheduled dose sits inside the stated 10-30 mg range', () => {
    for (const s of ref()!.schedule) {
      expect(s.doseMcg).toBeGreaterThanOrEqual(10000);
      expect(s.doseMcg).toBeLessThanOrEqual(30000);
    }
  });

  it('every scheduled draw is arithmetically consistent with the concentration', () => {
    // Catches a units figure edited without recomputing the mg, or vice versa.
    const r = ref()!;
    for (const s of r.schedule) {
      if (s.units == null) continue;
      expect((s.units / 100) * r.mgPerMl).toBeCloseTo(s.doseMcg / 1000, 5);
    }
  });
});

describe('cerebrolysin protocol agrees with the reference', () => {
  it('is dosed in mg — never ml, never mcg', () => {
    const p = getProtocolsByPeptide('cerebrolysin')[0];
    expect(p.typicalDose.unit).toBe('mg');
    expect(p.typicalDose.min).toBe(10);
    expect(p.typicalDose.max).toBe(30);
  });

  it('is 5 doses a week, not 7', () => {
    // Folding 5-on-2-off into 'daily' overstates every vial and syringe count
    // by 40%, which is the number a user actually buys against.
    expect(getProtocolsByPeptide('cerebrolysin')[0].frequency).toBe('five_on_two_off');
  });

  it('renders a dosing card, in mg', () => {
    const card = getDosingTableEntry('cerebrolysin');
    expect(card).not.toBeNull();
    expect(card!.dosingRange).toContain('mg');
    expect(card!.dosingRange).not.toContain('mcg');
    expect(card!.dosingRange).not.toContain('ml');
  });
});
