/**
 * Supplies estimator — the vial count a user is told to buy.
 *
 * Work order 2026-09-15: "a 40 mg ceiling has been telling users to buy far
 * more vials than a cycle needs". SS-31 was typicalDose 5–40 mg; Jamie
 * Esposito's ruling is 2–5 mg daily for 4–12 weeks. With a 10 mg vial and 2 mL
 * of BAC water per vial, the full 12-week cycle went from 42–336 vials
 * (672 mL BAC) to 17–42 vials (84 mL). These pin the corrected counts, computed
 * by estimateSupplies — the function SuppliesEstimatorCard renders verbatim.
 */
import { getProtocolsByPeptide } from '../../data/protocols';
import type { ProtocolTemplate } from '../../types';
import { computeCyclePlan, estimateSupplies } from '../protocolDoseMath';

const ss31 = () => getProtocolsByPeptide('ss-31')[0];
const TEN_MG = 10_000;

describe('SS-31, 10 mg vial, 2 mL BAC water', () => {
  it('reads the same protocol range as the Cycle plan (2–5 mg, 4–12 weeks, daily)', () => {
    const p = ss31();
    expect(p.typicalDose).toEqual({ min: 2, max: 5, unit: 'mg' });
    expect(p.durationWeeks).toEqual({ min: 4, max: 12 });
    expect(p.frequency).toBe('daily');
  });

  it('Standard: 2–4 vials a week, 3–7 for two, 17–42 for the full 12-week cycle', () => {
    const s = estimateSupplies(ss31(), { vialMcg: TEN_MG, bacWaterMl: 2 });
    expect(s.periods.map((x) => [x.label, x.vialsLabel, x.bacWaterLabel, x.syringesLabel, x.swabsLabel])).toEqual([
      ['1 week', '2–4 vials', '8 mL', '7', '14'],
      ['2 weeks', '3–7 vials', '14 mL', '14', '28'],
      ['Full cycle (12 wks)', '17–42 vials', '84 mL', '84', '168'],
    ]);
    expect(s.hasVialMath).toBe(true);
  });

  it('Beginner (2 mg) needs 17 vials and Advanced (5 mg) 42 over 12 weeks', () => {
    expect(estimateSupplies(ss31(), { vialMcg: TEN_MG, intensity: 'mild' }).periods[2].vialsLabel).toBe('17 vials');
    expect(estimateSupplies(ss31(), { vialMcg: TEN_MG, intensity: 'aggressive' }).periods[2].vialsLabel).toBe('42 vials');
  });

  it('the Cycle plan agrees: 6–42 vials across 4–12 weeks', () => {
    expect(computeCyclePlan(ss31(), 'standard', TEN_MG).vialsLabel).toBe('6–42 vials');
  });

  it('the old 5–40 mg range asked for 42–336 vials — the defect being pinned against', () => {
    const old: ProtocolTemplate = { ...ss31(), typicalDose: { min: 5, max: 40, unit: 'mg' }, doseBands: undefined };
    const s = estimateSupplies(old, { vialMcg: TEN_MG, bacWaterMl: 2 });
    expect(s.periods[2].vialsLabel).toBe('42–336 vials');
    expect(s.periods[2].bacWaterLabel).toBe('672 mL');
  });
});

describe('estimator edges', () => {
  it('rounds vials UP — a part-used vial still has to be bought', () => {
    // 2 mg × 7 doses = 14 mg over a 10 mg vial.
    expect(estimateSupplies(ss31(), { vialMcg: TEN_MG, intensity: 'mild' }).periods[0].vialsLabel).toBe('2 vials');
  });

  it('BAC water is shown to 0.1 mL, not as a float tail', () => {
    const p: ProtocolTemplate = { ...ss31(), doseBands: undefined };
    const s = estimateSupplies(p, { vialMcg: TEN_MG, bacWaterMl: 1.1, intensity: 'standard' });
    for (const x of s.periods) expect(x.bacWaterLabel).toMatch(/^\d+(\.\d)? mL$/);
    expect(s.periods[0].bacWaterLabel).toBe('4.4 mL');
  });

  it('without a vial size, or for a non-mass dose, it counts no vials', () => {
    expect(estimateSupplies(ss31()).periods.every((x) => x.vialsLabel === '—')).toBe(true);
    const hcg = getProtocolsByPeptide('hcg')[0];
    const s = estimateSupplies(hcg, { vialMcg: TEN_MG });
    expect(s.doseIsMassBased).toBe(false);
    expect(s.hasVialMath).toBe(false);
  });
});
