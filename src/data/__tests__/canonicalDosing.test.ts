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
  it("ranks Jamie's rulings first, then the self-verifying ladder", () => {
    expect(SOURCE_PRECEDENCE[0]).toBe('clinician_ruling');
    expect(SOURCE_PRECEDENCE[1]).toBe('reconstitution_ladder');
    expect(SOURCE_PRECEDENCE[SOURCE_PRECEDENCE.length - 1]).toBe('protocols');
  });

  it("a clinician ruling outranks every stored source", () => {
    // NAD+: Jamie ruled 50–200 mg. The ladder's 60 mg is inside it and still
    // reported; her ruling is the adjudication, so it is not a conflict.
    const nad = getCanonicalDose('nad-plus');
    expect(nad).not.toBeNull();
    expect(nad!.source).toBe('clinician_ruling');
    expect([nad!.minMcg, nad!.maxMcg]).toEqual([50000, 200000]);
    expect(nad!.sources.map((s) => s.source)).toContain('reconstitution_ladder');
    expect(nad!.conflict).toBe(false);
  });

  it('prefers the ladder over the table when she has not ruled', () => {
    // melanotan-1: no ruling; ladder 100-125 mcg vs table 250-1000 mcg.
    const m = getCanonicalDose('melanotan-1');
    expect(m).not.toBeNull();
    expect(m!.source).toBe('reconstitution_ladder');
    expect(m!.verified).toBe(true);
    expect(m!.sources.map((s) => s.source)).toContain('master_table');
    expect(m!.conflict).toBe(true);
  });

  it('falls through to a lower-precedence source when the ladder is silent', () => {
    // mk-677 has no ruling and no ladder entry; it must still resolve, from a
    // lower source, rather than going unguarded.
    const t = getCanonicalDose('mk-677');
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

    // melanotan-1: ladder 100-125 vs table 250-1000 — no overlap at all, so
    // at least one source is wrong about this compound.
    expect(ids).toContain('melanotan-1');

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
