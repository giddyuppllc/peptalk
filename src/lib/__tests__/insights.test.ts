/**
 * Insights — presenting the correlation engine's output honestly.
 *
 * watchCorrelationService computes a 7-day pre-protocol baseline, a during
 * average, a percentage change and a trend, per metric, per active protocol.
 * Its ONLY caller was the Aimee chat screen, which piped the result into the
 * bot's context. The analysis ran and reached the user only if they thought to
 * ask for it in a conversation. There was no screen.
 *
 * These cover the presentation rules, because the failure mode of a stats
 * screen is not a crash — it is a confident number that means nothing.
 */
import {
  rankCorrelations,
  trendMeta,
  formatChange,
  MIN_DATA_POINTS,
  type Correlation,
} from '../insights';
import { tallySymptoms, describeTally } from '../sideEffectSummary';

const c = (over: Partial<Correlation> = {}): Correlation => ({
  metric: 'hrvMs',
  label: 'HRV',
  changePercent: 10,
  trend: 'improving',
  dataPoints: 10,
  ...over,
});

describe('ranking', () => {
  it('puts the biggest movement first', () => {
    const out = rankCorrelations([
      c({ metric: 'a', changePercent: 4 }),
      c({ metric: 'b', changePercent: -22 }),
      c({ metric: 'c', changePercent: 9 }),
    ]);
    expect(out.map((x) => x.metric)).toEqual(['b', 'c', 'a']);
  });

  it('ranks by magnitude, so a big decline is not buried', () => {
    const out = rankCorrelations([
      c({ metric: 'up', changePercent: 5 }),
      c({ metric: 'down', changePercent: -30 }),
    ]);
    expect(out[0].metric).toBe('down');
  });

  it('sorts unmeasurable metrics LAST, not as zero', () => {
    // null means "could not measure"; 0 means "measured, did not move".
    // Treating them alike turns a gap in the data into a finding.
    const out = rankCorrelations([
      c({ metric: 'null', changePercent: null }),
      c({ metric: 'zero', changePercent: 0 }),
    ]);
    expect(out.map((x) => x.metric)).toEqual(['zero', 'null']);
  });

  it('breaks ties on the amount of evidence', () => {
    const out = rankCorrelations([
      c({ metric: 'thin', changePercent: 10, dataPoints: 3 }),
      c({ metric: 'thick', changePercent: 10, dataPoints: 40 }),
    ]);
    expect(out[0].metric).toBe('thick');
  });

  it('does not mutate the input', () => {
    const input = [c({ metric: 'a', changePercent: 1 }), c({ metric: 'b', changePercent: 50 })];
    rankCorrelations(input);
    expect(input.map((x) => x.metric)).toEqual(['a', 'b']);
  });

  it('handles an empty list', () => {
    expect(rankCorrelations([])).toEqual([]);
  });
});

describe('the evidence threshold', () => {
  it('is high enough that a two-point percentage is not a finding', () => {
    // "Your HRV improved 18%" off two readings is a coin flip with a decimal
    // place. The engine will happily report it; the screen must not.
    expect(MIN_DATA_POINTS).toBeGreaterThanOrEqual(5);
  });
});

describe('formatting a change', () => {
  it('never renders null as 0%', () => {
    // "Could not measure" and "did not change" are different answers and must
    // not look identical.
    expect(formatChange(null)).toBe('—');
    expect(formatChange(0)).toBe('0%');
  });

  it('is signed so direction reads without the icon', () => {
    expect(formatChange(18)).toBe('+18%');
    expect(formatChange(-7)).toBe('-7%');
  });

  it('rounds — a decimal implies precision a 7-day average does not have', () => {
    expect(formatChange(18.4)).toBe('+18%');
    expect(formatChange(-0.4)).toBe('0%');
  });

  it('survives NaN and Infinity rather than printing them', () => {
    // A zero baseline divides to Infinity, and "Infinity%" on a health screen
    // is worse than saying nothing.
    expect(formatChange(NaN)).toBe('—');
    expect(formatChange(Infinity)).toBe('—');
  });
});

describe('trend styling', () => {
  it('gives stable a neutral colour, not a warning colour', () => {
    // A metric that did not move is a real answer. Colouring it like a problem
    // makes an uneventful protocol look alarming.
    expect(trendMeta('stable').color).toBe('#9ca3af');
    expect(trendMeta('improving').color).toBe('#10b981');
    expect(trendMeta('declining').color).toBe('#ef4444');
  });

  it('every direction has an icon and a label', () => {
    for (const d of ['improving', 'stable', 'declining'] as const) {
      expect(trendMeta(d).icon).toBeTruthy();
      expect(trendMeta(d).label).toBeTruthy();
    }
  });
});

describe('side effects the user logged for a compound', () => {
  const e = (symptom: string, severity: 1 | 2 | 3 | 4 | 5, loggedAt: string) => ({
    id: `${symptom}-${loggedAt}`,
    symptom,
    severity,
    peptideId: 'semaglutide',
    loggedAt,
  });

  it('groups repeats instead of listing dates', () => {
    // The useful question is "does this keep happening to me?", which a flat
    // chronological list buries.
    const out = tallySymptoms([
      e('Nausea', 2, '2026-08-01T09:00:00Z'),
      e('Nausea', 4, '2026-08-05T09:00:00Z'),
      e('Headache', 1, '2026-08-03T09:00:00Z'),
    ]);
    expect(out[0].symptom).toBe('Nausea');
    expect(out[0].count).toBe(2);
    expect(out[0].worst).toBe(4);
    expect(out[0].lastLoggedAt).toBe('2026-08-05T09:00:00Z');
  });

  it('treats "Nausea" and "nausea " as the same symptom', () => {
    // Symptoms come from both a curated tag list and free text. Counting them
    // separately understates a recurring problem.
    const out = tallySymptoms([
      e('Nausea', 2, '2026-08-01T09:00:00Z'),
      e('nausea ', 3, '2026-08-02T09:00:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
  });

  it('ranks a single severe event above three mild ones', () => {
    const out = tallySymptoms([
      e('Mild thing', 1, '2026-08-01T09:00:00Z'),
      e('Mild thing', 1, '2026-08-02T09:00:00Z'),
      e('Bad thing', 5, '2026-08-03T09:00:00Z'),
      e('Bad thing', 5, '2026-08-04T09:00:00Z'),
    ]);
    expect(out[0].symptom).toBe('Bad thing');
  });

  it('skips unnamed symptoms rather than rendering a blank row', () => {
    expect(tallySymptoms([e('  ', 2, '2026-08-01T09:00:00Z')])).toEqual([]);
  });

  it('reads naturally for one occurrence and for many', () => {
    const [one] = tallySymptoms([e('Nausea', 3, '2026-08-01T09:00:00Z')]);
    expect(describeTally(one)).toBe('once · worst: Moderate');
    const [many] = tallySymptoms([
      e('Nausea', 3, '2026-08-01T09:00:00Z'),
      e('Nausea', 1, '2026-08-02T09:00:00Z'),
    ]);
    expect(describeTally(many)).toBe('2 times · worst: Moderate');
  });

  it('handles no entries', () => {
    expect(tallySymptoms([])).toEqual([]);
  });
});
