/**
 * Dose sanity — the numbers the peptide screen derives must be structurally
 * plausible, and a clinician-approved dose must be the dose every store holds.
 *
 * Born from SS-31: typicalDose 5–40 mg rendered "Beginner 5 mg – 16.55 mg /
 * Advanced 28.1 mg – 40 mg" and a cycle total of "140 mg–3360 mg". Jamie
 * Esposito's written correction (13–14 Sep 2026, via Edward's work order
 * 2026-09-15): 2–5 mg daily; 2 mg beginner, 5 mg advanced.
 *
 * Every assertion calls the functions the screens call (src/lib/protocolDoseMath),
 * not a re-typed copy of the formula.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ProtocolTemplate } from '../../types';
import { PROTOCOL_TEMPLATES, getProtocolsByPeptide } from '../../data/protocols';
import { getDosingTableEntry } from '../../data/peptideDosingTable';
import { getCanonicalDose } from '../../data/canonicalDosing';
import {
  computeCyclePlan,
  intensityToDose,
  intensityToDoseRange,
} from '../protocolDoseMath';
import { formatDoseBand } from '../doseUnits';
import {
  LIVE_DOSING_DATA,
  auditAllDosing,
  auditProtocol,
  auditSources,
  findingKey,
  type DoseSanityInput,
} from '../doseSanity';

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Findings that were ALREADY in the data when this check was written
 * (2026-09-15). They are not waived: each is listed in the dosing audit for
 * Jamie, and the check below fails if this list and reality differ in EITHER
 * direction — a new finding fails, and so does fixing one of these without
 * removing it here. Do not add to this list to make a test pass; a new entry
 * needs the approving clinician's answer first.
 */
const OPEN_FINDINGS_AWAITING_JAMIE = new Map<string, string>([
  [
    'dose-exceeds-vial|thymalin|proto-thymalin-im',
    'typicalDose 5–20 mg IM; the only known vial is 10 mg, so the top dose is two vials per injection.',
  ],
  [
    'sources-disjoint-10x|nad-plus|table~ladder',
    'Master table "200mcg-600mcg" vs ladder 60 mg — ~100x, almost certainly mcg written for mg.',
  ],
  [
    'sources-disjoint-10x|nad-plus|table~proto-nad-plus',
    'Master table "200mcg-600mcg" vs protocol 50–200 mg — same table row, same slip.',
  ],
]);

const ss31 = () => getProtocolsByPeptide('ss-31')[0];

// ── SS-31: what the screens now compute ─────────────────────────────────────

describe('SS-31 renders Jamie\'s approved dose', () => {
  it('Quick dose reference: Beginner 2 mg, Advanced 5 mg', () => {
    const p = ss31();
    expect(p).toBeDefined();
    expect(formatDoseBand(intensityToDoseRange(p, 'mild'), ' – ')).toBe('2 mg');
    expect(formatDoseBand(intensityToDoseRange(p, 'aggressive'), ' – ')).toBe('5 mg');
  });

  it('Cycle plan: 2 mg–5 mg per dose, once daily, 4–12 weeks, 28–84 injections, 56 mg–420 mg', () => {
    const p = ss31();
    const plan = computeCyclePlan(p);
    expect(plan.perDoseLabel).toBe('2 mg–5 mg');
    expect(p.frequencyLabel).toBe('Once daily');
    expect(plan.weeksLabel).toBe('4–12 weeks');
    expect(plan.injectionCountLabel).toBe('28–84 injections');
    expect(plan.totalDoseLabel).toBe('56 mg–420 mg');
  });

  it('calculator intensities land on the same two doses', () => {
    const p = ss31();
    expect(intensityToDose(p, 'mild').value).toBe(2000);
    expect(intensityToDose(p, 'aggressive').value).toBe(5000);
    expect(computeCyclePlan(p, 'mild').perDoseLabel).toBe('2 mg');
    expect(computeCyclePlan(p, 'aggressive').perDoseLabel).toBe('5 mg');
  });

  it('carries provenance naming the approver', () => {
    const prov = ss31().doseProvenance ?? [];
    expect(prov.length).toBeGreaterThan(0);
    const last = prov[prov.length - 1];
    expect(last.approver).toContain('Jamie Esposito');
    expect(last.approved?.typicalDose).toEqual({ min: 2, max: 5, unit: 'mg' });
  });
});

describe('every store holding an SS-31 dose agrees', () => {
  it('master table row prints 2–5 mg and nothing above it', () => {
    expect(getDosingTableEntry('ss-31')?.dosingRange).toBe('2mg-5mg');
  });

  it('canonical resolver (which the overdose guard reads) resolves 2–5 mg with no conflict', () => {
    const c = getCanonicalDose('ss-31');
    expect(c).not.toBeNull();
    expect([c!.minMcg, c!.maxMcg]).toEqual([2000, 5000]);
    expect(c!.conflict).toBe(false);
    for (const s of c!.sources) expect([s.minMcg, s.maxMcg]).toEqual([2000, 5000]);
  });

  it("Aimee's baked knowledge base carries 2-5 mg", () => {
    const kb = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat/_knowledge.json'), 'utf8'),
    );
    const rows = (kb.protocols as { peptideId: string; dose: string }[]).filter((r) => r.peptideId === 'ss-31');
    expect(rows.length).toBe(1);
    expect(rows[0].dose).toBe('2-5 mg');
  });
});

// ── The guard itself ────────────────────────────────────────────────────────

describe('dose sanity over the live data', () => {
  it('actually examines the dataset (positive control)', () => {
    expect(PROTOCOL_TEMPLATES.length).toBeGreaterThanOrEqual(40);
    expect(LIVE_DOSING_DATA.table.length).toBeGreaterThanOrEqual(40);
    expect(LIVE_DOSING_DATA.ladder.length).toBeGreaterThanOrEqual(20);
  });

  it('finds exactly the known open findings — no new ones, none silently fixed', () => {
    const live = auditAllDosing();
    const unexpected = live.filter((f) => !OPEN_FINDINGS_AWAITING_JAMIE.has(findingKey(f)));
    const liveKeys = new Set(live.map(findingKey));
    const resolved = [...OPEN_FINDINGS_AWAITING_JAMIE.keys()].filter((k) => !liveKeys.has(k));
    // Printed in the failure so the offender is named, not just counted.
    expect(unexpected.map((f) => `${findingKey(f)} — ${f.detail}`)).toEqual([]);
    expect(resolved).toEqual([]);
  });
});

/**
 * Mutation fixtures: each rule must fire on a record built to break it.
 * A check that passes the live data without being able to fail proves nothing.
 */
describe('each rule fires on a record that breaks it', () => {
  const base: ProtocolTemplate = {
    id: 'proto-fixture',
    peptideId: 'fixture',
    name: 'Fixture',
    typicalDose: { min: 2, max: 5, unit: 'mg' },
    route: 'subcutaneous',
    frequency: 'daily',
    frequencyLabel: 'Once daily',
    durationWeeks: { min: 4, max: 12 },
    storageNotes: '',
    importantNotes: [],
    source: 'fixture',
  };
  const data = (over: Partial<DoseSanityInput> = {}): DoseSanityInput => ({
    protocols: [],
    table: [],
    ladder: [],
    vials: { fixture: { vialMg: [10] } },
    ...over,
  });
  const rules = (p: ProtocolTemplate, d = data()) => auditProtocol(p, d).map((f) => f.rule);

  it('a clean fixture produces nothing', () => {
    expect(rules(base)).toEqual([]);
  });

  it('SS-31\'s old 5–40 mg exceeds a 10 mg vial', () => {
    expect(rules({ ...base, typicalDose: { min: 5, max: 40, unit: 'mg' } })).toContain('dose-exceeds-vial');
  });

  it('inverted dose and weeks', () => {
    expect(rules({ ...base, typicalDose: { min: 5, max: 2, unit: 'mg' } })).toContain('min-gt-max');
    expect(rules({ ...base, durationWeeks: { min: 12, max: 4 } })).toContain('min-gt-max');
  });

  it('beginner above advanced, and bands outside the range', () => {
    expect(rules({ ...base, doseBands: { beginner: { min: 5, max: 5 }, advanced: { min: 2, max: 2 } } })).toContain('band-order');
    expect(rules({ ...base, doseBands: { beginner: { min: 1, max: 1 }, advanced: { min: 5, max: 5 } } })).toContain('band-outside-range');
  });

  it('a mcg figure typed into an mg field trips the per-dose ceiling', () => {
    expect(rules({ ...base, typicalDose: { min: 250, max: 5000, unit: 'mg' } }, data({ vials: {} }))).toContain('mass-dose-ceiling');
  });

  it('an unknown frequency or unit is not silently treated as something else', () => {
    expect(rules({ ...base, frequency: 'fortnightly' as any })).toContain('unknown-frequency');
    expect(rules({ ...base, typicalDose: { min: 2, max: 5, unit: 'units' as any } })).toContain('unknown-unit');
    expect(rules({ ...base, typicalDose: { min: NaN, max: 5, unit: 'mg' } })).toContain('invalid-number');
  });

  it('provenance: live numbers, bands and the table row must equal the approval', () => {
    const approved = {
      ...base,
      doseBands: { beginner: { min: 2, max: 2 }, advanced: { min: 5, max: 5 } },
      doseProvenance: [{
        value: 'x', source: 'x', approver: 'x', date: '2026-09-15',
        approved: {
          typicalDose: { min: 2, max: 5, unit: 'mg' as const },
          doseBands: { beginner: { min: 2, max: 2 }, advanced: { min: 5, max: 5 } },
        },
      }],
    };
    expect(rules(approved, data({ table: [{ peptideId: 'fixture', dosingRange: '2mg-5mg' }] }))).toEqual([]);
    // reintroduce the old figures
    expect(rules({ ...approved, typicalDose: { min: 5, max: 40, unit: 'mg' } })).toContain('provenance-mismatch');
    // drop the authored bands (back to the thirds split)
    expect(rules({ ...approved, doseBands: undefined })).toContain('provenance-mismatch');
    // the table row that parses as 2–5 but still prints 10 mg
    expect(rules(approved, data({ table: [{ peptideId: 'fixture', dosingRange: '2mg-5mg sometimes 10mg' }] }))).toContain('provenance-mismatch');
    expect(rules(approved, data({ table: [{ peptideId: 'fixture', dosingRange: '5mg-40mg' }] }))).toContain('provenance-mismatch');
  });

  it('two mass sources >= 10x apart and disjoint', () => {
    const found = auditSources('fixture', data({
      protocols: [base],
      table: [{ peptideId: 'fixture', dosingRange: '20mcg-40mcg' }],
    }));
    expect(found.map((f) => f.rule)).toEqual(['sources-disjoint-10x']);
    // disjoint but only 5x apart (400 mcg vs 2 mg) is a disagreement for
    // verify:dosingconsistency, not an order-of-magnitude slip
    expect(auditSources('fixture', data({
      protocols: [base],
      table: [{ peptideId: 'fixture', dosingRange: '200mcg-400mcg' }],
    }))).toEqual([]);
    // overlapping ranges are different clinical windows, not an error
    expect(auditSources('fixture', data({
      protocols: [base],
      table: [{ peptideId: 'fixture', dosingRange: '1mg-2mg' }],
    }))).toEqual([]);
    // IU rows are not masses and must not be compared as mcg
    expect(auditSources('fixture', data({
      protocols: [base],
      table: [{ peptideId: 'fixture', dosingRange: '10iu-40iu' }],
    }))).toEqual([]);
  });
});
