/**
 * Every store that tells a user a dose must agree with Jamie Esposito's
 * rulings (src/data/clinicianRulings.ts). She is the approving clinician.
 *
 * Born 2026-09-15: her 90-row review had reached exactly one store
 * (protocols.ts, the lowest-precedence one). The overdose guard, the master
 * table, the reconstitution ladder and Aimee's knowledge + prompt kept older
 * figures — Aimee told users TB-500 was 2–5 mg against her 330 mcg – 1 mg,
 * and MOTS-c 5–10 mg against her 1–2 mg. Edward: "she is the master".
 *
 * If this fails after a data edit, the edit disagrees with her — fix the edit,
 * not the ruling. A ruling changes only when she changes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CLINICIAN_RULINGS, rulingDoseMcg } from '../clinicianRulings';
import { PROTOCOL_TEMPLATES } from '../protocols';
import { PEPTIDE_DOSING_TABLE } from '../peptideDosingTable';
import { PEPTIDE_DOSING_REFERENCE } from '../peptideDosingReference';
import { getCanonicalDose, parseRangeToMcg, toMcg } from '../canonicalDosing';

const ROOT = path.join(__dirname, '..', '..', '..');
const EPS = 0.001;
const dosed = CLINICIAN_RULINGS.filter((r) => r.dose && r.dose.unit !== 'IU');
const within = (v: number, lo: number, hi: number) => v >= lo - EPS && v <= hi + EPS;

/**
 * Titration ramps that START below her minimum. She ruled a dose range, not a
 * ramp, so these are not rewritten by guesswork — they are listed for her to
 * rule on, and this test fails if the list and the data drift apart in either
 * direction.
 */
const RAMPS_BELOW_MINIMUM_AWAITING_JAMIE = new Set([
  'proto-cagrilintide-subq@0.16mg',
  'proto-cagrilintide-subq@0.3mg',
  'proto-cagrilintide-subq@0.6mg',
  'proto-mazdutide-subq@1.5mg',
  'proto-survodutide-subq@0.6mg',
  'proto-survodutide-subq@1.2mg',
  'proto-survodutide-subq@1.8mg',
]);

describe('clinician rulings are what every store says', () => {
  it('actually examines the rulings (positive control)', () => {
    expect(dosed.length).toBeGreaterThanOrEqual(30);
  });

  it.each(dosed.map((r) => [r.peptideId, r]))('%s: overdose guard resolves to her range', (_id, r) => {
    const want = rulingDoseMcg(r.dose!);
    const c = getCanonicalDose(r.peptideId);
    expect(c?.source).toBe('clinician_ruling');
    expect([c!.minMcg, c!.maxMcg]).toEqual([want.minMcg, want.maxMcg]);
  });

  it.each(dosed.map((r) => [r.peptideId, r]))('%s: master table row equals her range', (_id, r) => {
    const row = PEPTIDE_DOSING_TABLE.find((e) => e.peptideId === r.peptideId);
    if (!row) return;
    const want = rulingDoseMcg(r.dose!);
    expect(parseRangeToMcg(row.dosingRange)).toEqual(want);
  });

  it.each(dosed.map((r) => [r.peptideId, r]))('%s: protocol doses sit inside her range', (_id, r) => {
    const want = rulingDoseMcg(r.dose!);
    for (const p of PROTOCOL_TEMPLATES.filter((x) => x.peptideId === r.peptideId)) {
      expect(within(toMcg(p.typicalDose.min, p.typicalDose.unit), want.minMcg, want.maxMcg)).toBe(true);
      expect(within(toMcg(p.typicalDose.max, p.typicalDose.unit), want.minMcg, want.maxMcg)).toBe(true);
      for (const s of p.titrationSchedule ?? []) {
        const v = toMcg(s.dose, s.unit);
        expect(v).toBeLessThanOrEqual(want.maxMcg + EPS);
      }
    }
  });

  it('titration ramps below her minimum are exactly the listed open questions', () => {
    const found = new Set<string>();
    for (const r of dosed) {
      const want = rulingDoseMcg(r.dose!);
      for (const p of PROTOCOL_TEMPLATES.filter((x) => x.peptideId === r.peptideId)) {
        for (const s of p.titrationSchedule ?? []) {
          if (toMcg(s.dose, s.unit) < want.minMcg - EPS) found.add(`${p.id}@${s.dose}${s.unit}`);
        }
      }
    }
    expect([...found].sort()).toEqual([...RAMPS_BELOW_MINIMUM_AWAITING_JAMIE].sort());
  });

  it.each(dosed.map((r) => [r.peptideId, r]))('%s: reconstitution ladder steps sit inside her range', (_id, r) => {
    const want = rulingDoseMcg(r.dose!);
    const entry = PEPTIDE_DOSING_REFERENCE.find((e) => e.peptideId === r.peptideId);
    for (const step of entry?.schedule ?? []) {
      expect(within(step.doseMcg, want.minMcg, want.maxMcg)).toBe(true);
    }
  });

  it("Aimee's knowledge file: every protocol row sits inside her range", () => {
    const kb = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat/_knowledge.json'), 'utf8'),
    ) as { protocols: { peptideId: string; name: string; dose: string }[] };
    const bad: string[] = [];
    for (const r of dosed) {
      const want = rulingDoseMcg(r.dose!);
      for (const row of kb.protocols.filter((p) => p.peptideId === r.peptideId)) {
        const got = parseRangeToMcg(row.dose);
        if (!got || !within(got.minMcg, want.minMcg, want.maxMcg) || !within(got.maxMcg, want.minMcg, want.maxMcg)) {
          bad.push(`${row.name}: "${row.dose}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("Aimee's knowledge file is regenerated from protocols.ts (not a stale copy)", () => {
    const kb = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat/_knowledge.json'), 'utf8'),
    ) as { protocols: unknown[] };
    expect(kb.protocols.length).toBe(PROTOCOL_TEMPLATES.length);
  });

  // The streaming prompt is prose, so it is held line by line for the compounds
  // whose figures it states. Each expected fragment is her range as the line
  // writes it; the forbidden fragments are the figures it used to give.
  const PROMPT_LINES: [string, string, string[]][] = [
    ['TB-500 — 10 mg vial', '330 mcg (10 units) – 1 mg (30 units)', ['1.5 mg', '500 mcg (15 units)']],
    ['Thymosin-α-1 — 5 mg vial', '1-1.6 mg', ['300 mcg', '500 mcg']],
    ['CJC-1295 w/ DAC — 5 mg vial', '1-2 mg (40-80 units) every 4-6 days', ['Mon/Thu', '300 mcg']],
    ['MOTS-c (40 mg vial)', '1-2 mg (7.5-15 units) 3× weekly', ['200 mcg']],
    ['MOTS-c (10 mg vial)', '1-2 mg (30-60 units) 3× weekly', ['200 mcg']],
    ['NAD+ — 500 mg vial', '50-200 units (50-200 mg)', ['20-100']],
    ['Tesamorelin — [Rx] 10 mg vial', '500 mcg-1 mg', ['2 mg/day']],
    ['PT-141 — [Rx] 10 mg vial', '0.5-2 mg', ['0.5-1.5 mg']],
    ['Selank — 10 mg vial', '200-500 mcg', ['300-500 mcg']],
    ['Cagrilintide — [Rx] 10 mg vial', '1.2-2.4 mg', ['0.6-4.5']],
    ['Glutathione — 1500 mg vial', '200-400 mg', ['50-150']],
    ['DSIP — 10 mg vial', '100-300 mcg', ['by wk 8']],
    ['Melanotan II — 10 mg vial', '250-500 mcg', ['50-200 mcg']],
    ['Hexarelin — 10 mg vial', '100-200 mcg', ['200-300']],
    ['5-Amino-1MQ (injectable)', '500 mcg-2 mg', ['no validated human dose']],
    ['Thymosin Alpha 1 (grid range)', '1-1.6 mg', ['0.5-2 mg']],
    ['Tirzepatide — [Rx]', '2.5-15 mg', ['0.5-5 mg']],
    ['Survodutide — [Rx]', '2.4-6 mg', ['0.6-2.7']],
    ['Kisspeptin —', '30-100 mcg', ['50-200']],
    ['SS-31 (Elamipretide)', '2-5 mg', ['40 mg']],
  ];
  const prompt = fs
    .readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat-stream/_prompt.ts'), 'utf8')
    .split('\n');

  it.each(PROMPT_LINES)("Aimee's prompt line %s states her figure", (start, expected, forbidden) => {
    const lines = prompt.filter((l) => l.startsWith(start));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(expected);
    for (const f of forbidden) expect(lines[0]).not.toContain(f);
  });
});
