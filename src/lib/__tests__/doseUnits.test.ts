/**
 * doseUnits tests.
 *
 * Anchored on the four protocols that were actually rendering wrong, so a
 * regression reproduces the real defect rather than an abstract one.
 */
import {
  formatDoseAmount,
  formatDoseRange,
  isMassUnit,
  normalizeDoseRange,
} from '../doseUnits';

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

  it('rolls up to mg at 1000 and uses one decimal past 10000', () => {
    // Matches the previous formatDose() exactly — this behaviour was correct.
    expect(formatDoseAmount(1000, 'mcg')).toBe('1.00 mg');
    expect(formatDoseAmount(2000, 'mcg')).toBe('2.00 mg');
    expect(formatDoseAmount(10000, 'mcg')).toBe('10.0 mg');
  });

  it('rounds mcg rather than showing false precision', () => {
    expect(formatDoseAmount(333.4, 'mcg')).toBe('333 mcg');
  });

  it('does not fabricate decimals for whole IU/ml values', () => {
    expect(formatDoseAmount(30, 'ml')).toBe('30 ml');
    expect(formatDoseAmount(250, 'IU')).toBe('250 IU');
  });

  it('trims a computed fraction to 2dp for IU/ml', () => {
    // Intensity shifting produces fractions (min + span*0.33).
    expect(formatDoseAmount(13.25, 'ml')).toBe('13.25 ml');
    expect(formatDoseAmount(13.256, 'ml')).toBe('13.26 ml');
  });
});

describe('formatDoseRange', () => {
  it('collapses when both ends are equal', () => {
    expect(formatDoseRange({ min: 500, max: 500, unit: 'mcg', massBased: true })).toBe('500 mcg');
  });

  it('mots-c 1-2mg reads as mg after normalisation', () => {
    // Jamie: MOTS-c is 1-2 mg, not mcg.
    expect(formatDoseRange(normalizeDoseRange(1, 2, 'mg'))).toBe('1.00 mg–2.00 mg');
  });
});
