/**
 * doseUnits tests.
 *
 * Anchored on the four protocols that were actually rendering wrong, so a
 * regression reproduces the real defect rather than an abstract one.
 */
import {
  formatDoseAmount,
  formatDoseRange,
  formatMassMcg,
  isMassUnit,
  normalizeDoseRange,
  toDisplayUnitPair,
} from '../doseUnits';
import { formatDose as formatDoseV2 } from '../../utils/calculatorV2';

describe('isMassUnit', () => {
  it('treats mcg and mg as mass, IU and ml as not', () => {
    expect(isMassUnit('mcg')).toBe(true);
    expect(isMassUnit('mg')).toBe(true);
    expect(isMassUnit('IU')).toBe(false);
    expect(isMassUnit('ml')).toBe(false);
  });
});

describe('normalizeDoseRange — mass units', () => {
  it('converts mg to mcg', () => {
    expect(normalizeDoseRange(1, 2, 'mg')).toEqual({
      min: 1000, max: 2000, unit: 'mcg', massBased: true,
    });
  });

  it('leaves mcg alone', () => {
    expect(normalizeDoseRange(200, 400, 'mcg')).toEqual({
      min: 200, max: 400, unit: 'mcg', massBased: true,
    });
  });
});

describe('normalizeDoseRange — the units that were being silently mangled', () => {
  it('cerebrolysin 5-30 ml stays ml and is NOT mass-based', () => {
    // Previously rendered "5 mcg-30 mcg". Millilitres are a volume; there is no
    // mass to convert to without a concentration this dataset does not carry.
    const r = normalizeDoseRange(5, 30, 'ml');
    expect(r).toEqual({ min: 5, max: 30, unit: 'ml', massBased: false });
    expect(formatDoseRange(r)).toBe('5 ml–30 ml');
    expect(formatDoseRange(r)).not.toContain('mcg');
  });

  it('hcg 250-1500 IU stays IU', () => {
    const r = normalizeDoseRange(250, 1500, 'IU');
    expect(r.unit).toBe('IU');
    expect(r.massBased).toBe(false);
    // 1500 must NOT roll up to "1.50 mg" — that rollup is mass-only.
    expect(formatDoseRange(r)).toBe('250 IU–1500 IU');
  });

  it('oxytocin 10-40 IU and hmg 75-300 IU stay IU', () => {
    expect(formatDoseRange(normalizeDoseRange(10, 40, 'IU'))).toBe('10 IU–40 IU');
    expect(formatDoseRange(normalizeDoseRange(75, 300, 'IU'))).toBe('75 IU–300 IU');
  });

  it('never marks a non-mass unit as mass-based, so vial maths stays disabled', () => {
    for (const u of ['IU', 'ml'] as const) {
      expect(normalizeDoseRange(1, 10, u).massBased).toBe(false);
    }
  });
});

describe('formatDoseAmount — mass rollup preserved', () => {
  it('keeps sub-1000 mcg as mcg', () => {
    expect(formatDoseAmount(250, 'mcg')).toBe('250 mcg');
    expect(formatDoseAmount(999, 'mcg')).toBe('999 mcg');
  });

  it('rolls up to mg at 1000 and trims trailing zeros', () => {
    // Edward: "we just wanted increments people would actually know."
    // These used to read "1.00 mg" / "10.0 mg" — trailing zeros claiming a
    // hundredth-of-a-mg precision the source data does not have.
    expect(formatDoseAmount(1000, 'mcg')).toBe('1 mg');
    expect(formatDoseAmount(2000, 'mcg')).toBe('2 mg');
    expect(formatDoseAmount(10000, 'mcg')).toBe('10 mg');
    expect(formatDoseAmount(60000, 'mcg')).toBe('60 mg');
  });

  it('shows mg to at most one decimal', () => {
    // Work order 2026-09-15: "no dosing figure ever renders at two decimals".
    // This used to assert 1250 mcg -> "1.25 mg"; SS-31's split rendered
    // "16.55 mg" through the same path.
    expect(formatDoseAmount(2500, 'mcg')).toBe('2.5 mg');
    expect(formatDoseAmount(1250, 'mcg')).toBe('1.3 mg');
    expect(formatDoseAmount(16550, 'mcg')).toBe('16.6 mg');
    expect(formatDoseAmount(0.25, 'mg')).toBe('250 mcg');
  });

  it('decides mcg vs mg after rounding', () => {
    expect(formatDoseAmount(999.6, 'mcg')).toBe('1 mg');
    expect(formatDoseAmount(999.4, 'mcg')).toBe('999 mcg');
  });

  it('rounds mcg rather than showing false precision', () => {
    expect(formatDoseAmount(333.4, 'mcg')).toBe('333 mcg');
  });

  it('does not fabricate decimals for whole IU/ml values', () => {
    expect(formatDoseAmount(30, 'ml')).toBe('30 ml');
    expect(formatDoseAmount(250, 'IU')).toBe('250 IU');
  });

  it('rounds a computed fraction: whole IU, ml to 1dp', () => {
    // Intensity shifting produces fractions (min + span*0.33).
    expect(formatDoseAmount(149.25, 'IU')).toBe('149 IU');
    expect(formatDoseAmount(13.25, 'ml')).toBe('13.3 ml');
  });
});

describe('formatDoseRange', () => {
  it('collapses when both ends are equal', () => {
    expect(formatDoseRange({ min: 500, max: 500, unit: 'mcg', massBased: true })).toBe('500 mcg');
  });

  it('mots-c 1-2mg reads as mg after normalisation', () => {
    // Jamie: MOTS-c is 1-2 mg, not mcg.
    expect(formatDoseRange(normalizeDoseRange(1, 2, 'mg'))).toBe('1 mg–2 mg');
  });
});

describe('one implementation, not four', () => {
  it('formatMassMcg is what formatDoseAmount uses for mcg', () => {
    // Four functions used to render a dose and no two agreed: 1000 mcg came out
    // as "1.00 mg" (doseUnits), "1 mg" (doseCalculator, dead) and "1000 mcg"
    // (calculatorV2). Every caller now funnels through this one.
    for (const v of [100, 999, 1000, 1250, 60000]) {
      expect(formatDoseAmount(v, 'mcg')).toBe(formatMassMcg(v));
    }
  });

  it('calculatorV2 matches the app for whole doses but keeps the drawn precision', () => {
    // It honours an explicit mcg choice — that toggle is the user's. Whole and
    // 1dp doses read the same as everywhere else; a 2dp dose is NOT display-
    // rounded, because the calculator prints it beside the syringe volume
    // computed from it (formatDoseAmountExact).
    expect(formatDoseV2(1, 'mg')).toBe(formatMassMcg(1000));
    expect(formatDoseV2(60, 'mg')).toBe(formatMassMcg(60000));
    expect(formatDoseV2(2.5, 'mg')).toBe(formatMassMcg(2500));
    expect(formatDoseV2(1.25, 'mg')).toBe('1.25 mg');
  });

  it('an explicit mcg choice is still honoured', () => {
    expect(formatDoseV2(0.25, 'mcg')).toBe('250 mcg');
  });
});

describe('toDisplayUnitPair — the stored pair matches the printed one', () => {
  it('puts a sub-milligram mass in mcg', () => {
    // The live defect: planStarterDose returned tesamorelin as { 0.75, 'mg' },
    // the prompt printed "750 mcg" through formatDoseAmount, and every screen
    // that renders a STORED dose showed "0.75 mg".
    expect(toDisplayUnitPair(0.75, 'mg')).toEqual({ value: 750, unit: 'mcg' });
    expect(toDisplayUnitPair(0.6, 'mg')).toEqual({ value: 600, unit: 'mcg' });
    expect(toDisplayUnitPair(0.2, 'mg')).toEqual({ value: 200, unit: 'mcg' });
    expect(toDisplayUnitPair(750, 'mcg')).toEqual({ value: 750, unit: 'mcg' });
  });

  it('rolls up to mg at 1000 mcg, matching formatDoseAmount', () => {
    expect(toDisplayUnitPair(1000, 'mcg')).toEqual({ value: 1, unit: 'mg' });
    expect(toDisplayUnitPair(60000, 'mcg')).toEqual({ value: 60, unit: 'mg' });
    expect(toDisplayUnitPair(1.5, 'mg')).toEqual({ value: 1.5, unit: 'mg' });
  });

  it('relabels only — it never re-rounds the mass', () => {
    // roundDoseForDisplay would move 1250 mcg to 1.3 mg. A starter dose is a
    // figure someone draws, so a 4% shift here is a dose change, not a
    // display choice.
    expect(toDisplayUnitPair(1.25, 'mg')).toEqual({ value: 1.25, unit: 'mg' });
    expect(toDisplayUnitPair(1250, 'mcg')).toEqual({ value: 1.25, unit: 'mg' });
    expect(toDisplayUnitPair(333, 'mcg')).toEqual({ value: 333, unit: 'mcg' });
    // ...and the mass is preserved exactly through the ×1000, with no float tail.
    for (const mg of [0.029, 0.333, 0.75, 1.25, 2.5, 12.6]) {
      const p = toDisplayUnitPair(mg, 'mg');
      expect(p.unit === 'mg' ? p.value * 1000 : p.value).toBeCloseTo(mg * 1000, 6);
    }
  });

  it('leaves IU and ml alone — neither converts to a mass', () => {
    expect(toDisplayUnitPair(1500, 'IU')).toEqual({ value: 1500, unit: 'IU' });
    expect(toDisplayUnitPair(2.5, 'ml')).toEqual({ value: 2.5, unit: 'ml' });
  });

  it('the relabelled pair renders identically to the original', () => {
    for (const [v, u] of [[0.75, 'mg'], [1.25, 'mg'], [1000, 'mcg'], [333, 'mcg'], [0.2, 'mg']] as const) {
      const p = toDisplayUnitPair(v, u);
      expect(formatDoseAmount(p.value, p.unit)).toBe(formatDoseAmount(v, u));
    }
  });

  it('a display-rounded mass renders the same raw as it does formatted', () => {
    // This is the property the stored-dose screens depend on: they print the
    // pair with no formatter. It holds for any value already at display
    // precision — which planStarterDose guarantees, because it rounds before
    // relabelling. 1.25 mg is deliberately NOT in this list: relabelling must
    // not silently move a drawn dose to 1.3 mg (see the test above).
    for (const [v, u] of [[0.75, 'mg'], [1000, 'mcg'], [333, 'mcg'], [0.2, 'mg'], [1.5, 'mg']] as const) {
      const p = toDisplayUnitPair(v, u);
      expect(`${p.value} ${p.unit}`).toBe(formatDoseAmount(p.value, p.unit));
    }
  });
});
