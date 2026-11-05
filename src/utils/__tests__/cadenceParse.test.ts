import { parseCadence, generateCycleDates } from '../calculatorV2';
import { PEPTIDE_DOSING_REFERENCE } from '../../data/peptideDosingReference';

/*
 * Every frequency phrasing the dosing reference actually ships, and the cadence
 * "Schedule cycle" must plan for it. Before this, "Mon + Thu", "2× weekly",
 * "nightly" and five-on/two-off all planned ONE dose a week.
 */
const EXPECTED: Record<string, string> = {
  'daily': 'daily',
  'once daily': 'daily',
  'once daily at night': 'daily',
  'twice daily': 'daily',
  'twice daily (1250 mcg total)': 'daily',
  '2-3× daily': 'daily',
  'nightly (or AM/PM split)': 'daily',
  'daily, 30-60 min before bed': 'daily',
  'Mon + Thu': 'mon_thu',
  '2× weekly': 'mon_thu',
  'twice weekly': 'mon_thu',
  '2-3× weekly': 'mon_thu',
  'biweekly': 'mon_thu',
  'weekly': 'weekly',
  'once weekly': 'weekly',
  'five_on_two_off': 'five_on_two_off',
  'daily, 5 on / 2 off': 'five_on_two_off',
  'daily, 5 days on / 2 off': 'five_on_two_off',
  '≤8× per month': 'weekly',
};

describe('parseCadence — the dosing reference’s own phrasings', () => {
  it.each(Object.entries(EXPECTED))('%s → %s', (f, want) => {
    expect(parseCadence(f)).toBe(want);
  });

  it('covers every frequency string the reference ships (no silent fallbacks)', () => {
    const seen = new Set<string>();
    const walk = (o: unknown) => {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k === 'frequency' && typeof v === 'string') seen.add(v);
        else walk(v);
      }
    };
    walk(PEPTIDE_DOSING_REFERENCE);
    const missing = [...seen].filter((f) => !(f in EXPECTED));
    expect(missing).toEqual([]);
  });

  it('keeps the existing ASCII spellings', () => {
    expect(parseCadence('Mon/Thu')).toBe('mon_thu');
    expect(parseCadence('2x/week')).toBe('mon_thu');
    expect(parseCadence('Mon/Wed/Fri')).toBe('mon_wed_fri');
    expect(parseCadence('3x/week')).toBe('mon_wed_fri');
    expect(parseCadence('EOD')).toBe('eod');
    expect(parseCadence('open — titrate')).toBe('weekly');
  });
});

describe('generateCycleDates — counts a user can check', () => {
  it('Mon + Thu for 4 weeks from a Monday = 8 doses', () => {
    expect(generateCycleDates('2026-11-02', '4 weeks', 'Mon + Thu')).toHaveLength(8);
  });
  it('5 on / 2 off for 4 weeks = 20 doses, days 6–7 of each week skipped', () => {
    const d = generateCycleDates('2026-11-02', '4 weeks', 'daily, 5 on / 2 off');
    expect(d).toHaveLength(20);
    expect(d.slice(0, 6)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
  });
  it('nightly for 2 weeks = 14 doses', () => {
    expect(generateCycleDates('2026-11-02', '2 weeks', 'nightly (or AM/PM split)')).toHaveLength(14);
  });
});
