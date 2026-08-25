/**
 * Canonical dosing — the single source of truth.
 *
 * PepTalk kept a dose for the same compound in three files and none agreed.
 * The least attributable one (protocols.ts, zero citations) drove the most
 * behaviour, including the overdose guard. This module applies one documented
 * precedence — reconstitution ladder > master table > protocols — and reports
 * the provenance instead of silently picking.
 *
 * The ladder ranks first because it is the only source whose numbers can be
 * checked without trusting the author: it stores vial mg, diluent mL, syringe
 * units AND the resulting mcg, so concentration x volume must equal the dose.
 */
import {
  getCanonicalDose,
  getDoseConflicts,
  parseRangeToMcg,
  toMcg,
  SOURCE_PRECEDENCE,
} from '../canonicalDosing';

describe('unit conversion', () => {
  it('converts to micrograms', () => {
    expect(toMcg(1, 'mg')).toBe(1000);
    expect(toMcg(2.5, 'mg')).toBe(2500);
    expect(toMcg(250, 'mcg')).toBe(250);
    expect(toMcg(1, 'g')).toBe(1_000_000);
  });
});

describe('parseRangeToMcg', () => {
  it.each([
    ['200-600 mcg', 200, 600],
    ['1-2 mg', 1000, 2000],
    ['250mcg – 1mg', 250, 1000],   // en-dash + mixed units
    ['100 to 300 mcg', 100, 300],
    ['250-1000 mcg', 250, 1000],   // bare first number inherits the unit
    ['5 mg', 5000, 5000],          // single value = a point
  ])('parses %p', (raw, min, max) => {
    expect(parseRangeToMcg(raw)).toEqual({ minMcg: min, maxMcg: max });
  });

  it('returns null rather than guessing at unparseable text', () => {
    expect(parseRangeToMcg('as directed')).toBeNull();
    expect(parseRangeToMcg('')).toBeNull();
    expect(parseRangeToMcg(undefined)).toBeNull();
  });

  it('orders a reversed range instead of returning a negative window', () => {
    expect(parseRangeToMcg('600-200 mcg')).toEqual({ minMcg: 200, maxMcg: 600 });
  });
});

describe('precedence', () => {
  it('ranks the self-verifying ladder first', () => {
    expect(SOURCE_PRECEDENCE[0]).toBe('reconstitution_ladder');
    expect(SOURCE_PRECEDENCE[SOURCE_PRECEDENCE.length - 1]).toBe('protocols');
  });

  it('prefers the ladder over the other two when it has an entry', () => {
    // NAD+ is the clearest case: the master table records 200-600 mcg for a
    // compound the ladder doses at 60,000 mcg — a 100x transcription error.
    // Reading the table here would set an overdose ceiling ~100x too low and
    // flag every real NAD+ dose.
    const nad = getCanonicalDose('nad-plus');
    expect(nad).not.toBeNull();
    expect(nad!.source).toBe('reconstitution_ladder');
    expect(nad!.verified).toBe(true);
    expect(nad!.minMcg).toBe(60000);
    // and it still reports what the other sources claimed
    expect(nad!.sources.map((s) => s.source)).toContain('master_table');
    expect(nad!.conflict).toBe(true);
  });

  it('falls through to a lower-precedence source when the ladder is silent', () => {
    // tirzepatide has no ladder entry; it must still resolve, from a lower
    // source, rather than going unguarded.
    const t = getCanonicalDose('tirzepatide');
    expect(t).not.toBeNull();
    expect(t!.source).not.toBe('reconstitution_ladder');
    expect(t!.verified).toBe(false);
    expect(t!.maxMcg).toBeGreaterThan(0);
  });

  it('returns null for a compound no source knows', () => {
    expect(getCanonicalDose('definitely-not-a-peptide')).toBeNull();
  });
});

describe('conflict reporting', () => {
  it('flags disjoint ranges and does not flag overlapping ones', () => {
    const conflicts = getDoseConflicts();
    const ids = conflicts.map((c) => c.peptideId);

    // melanotan-2: ladder 100-125 vs table 250-1000 — no overlap at all, so
    // at least one source is wrong about this compound.
    expect(ids).toContain('melanotan-2');

    // Every reported conflict must genuinely be disjoint somewhere.
    for (const c of conflicts) {
      const disjoint = c.sources.some((a) =>
        c.sources.some((b) => a.maxMcg < b.minMcg || b.maxMcg < a.minMcg),
      );
      expect(disjoint).toBe(true);
    }
  });

  it('never reports a conflict for a compound with only one source', () => {
    const singles = getDoseConflicts().filter((c) => c.sources.length < 2);
    expect(singles).toEqual([]);
  });

  it('exposes every source it consulted, so a human can adjudicate', () => {
    const m = getCanonicalDose('melanotan-2');
    expect(m!.sources.length).toBeGreaterThanOrEqual(2);
    for (const s of m!.sources) {
      expect(s.minMcg).toBeGreaterThan(0);
      expect(s.maxMcg).toBeGreaterThanOrEqual(s.minMcg);
    }
  });
});
