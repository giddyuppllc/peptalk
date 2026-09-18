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

  // Her range is the ramp's bounds: a titration starts at her minimum.
  it('titration ramps start at or above her minimum', () => {
    const below: string[] = [];
    for (const r of dosed) {
      const want = rulingDoseMcg(r.dose!);
      for (const p of PROTOCOL_TEMPLATES.filter((x) => x.peptideId === r.peptideId)) {
        for (const s of p.titrationSchedule ?? []) {
          if (toMcg(s.dose, s.unit) < want.minMcg - EPS) below.push(`${p.id}@${s.dose}${s.unit}`);
        }
      }
    }
    expect(below).toEqual([]);
  });

  // A weight-scaled range escapes her range (TB-500 at 80 kg was 2–5.6 mg).
  it('no ruled compound is dosed per kilogram', () => {
    const perKg = dosed
      .flatMap((r) => PROTOCOL_TEMPLATES.filter((p) => p.peptideId === r.peptideId))
      .filter((p) => p.dosingMode === 'weight_based' || p.dosePerKg)
      .map((p) => p.id);
    expect(perKg).toEqual([]);
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
    ['Tesamorelin — [Rx] 10 mg vial', '500 mcg-1 mg (15-30 units) per shot, twice daily', ['2 mg/day']],
    ['PT-141 — [Rx] 10 mg vial', '0.5-2 mg', ['0.5-1.5 mg']],
    ['Selank — 10 mg vial', '200-500 mcg', ['300-500 mcg']],
    ['Cagrilintide — [Rx] 10 mg vial', '1.2-2.4 mg', ['0.6-4.5']],
    ['Glutathione — 1500 mg vial', '200-400 mg', ['50-150']],
    ['DSIP — 10 mg vial', '100-300 mcg', ['by wk 8']],
    ['Melanotan II — 10 mg vial', '250-500 mcg', ['50-200 mcg']],
    ['Hexarelin — 10 mg vial', '100-200 mcg', ['200-300']],
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

  // Commit 30820db (June) rewrote lines of Edward's grid in Aimee's prompt with
  // caveats nobody supplied — "[no validated human dose]", "FAILED Phase 2b",
  // "community guesses" — and ab74eeb invented a Testosterone row out of the
  // Tesamorelin row. Those lines restate the grid (peptideDosingTable.ts) now.
  /**
   * 5-Amino-1MQ (injectable) used to be held here, asserting the prompt stated
   * Jamie's "500 mcg-2 mg". Edward made it safety-information-only on
   * 2026-09-16, so the prompt line must now state NO figure. Her ruling is
   * untouched in clinicianRulings.ts and every other store is still held to it
   * by the tests above — only the line a user can be quoted changed.
   *
   * The row is kept, not deleted, because the reason it existed still applies:
   * the line must stay present (the compound keeps its safety information) and
   * must not quietly reacquire a number.
   */
  it("Aimee's prompt states no figure for 5-Amino-1MQ (injectable)", () => {
    const lines = prompt.filter((l) => l.startsWith('5-Amino-1MQ (injectable)'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('SAFETY INFORMATION ONLY');
    expect(lines[0]).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:mcg|ug|mg|iu|units?|ml)/i);
    // The ORAL entry is NOT on Edward's list and keeps its figures.
    const oral = prompt.filter((l) => l.startsWith('5-Amino-1MQ (oral)'));
    expect(oral).toHaveLength(1);
    expect(oral[0]).toContain('50-150 mg/day');
  });

  it("Aimee's grid block carries no invented caveats or rows", () => {
    const text = prompt.join('\n');
    expect(text).not.toContain('[no validated human dose');
    expect(text).not.toMatch(/^Testosterone —/m);
    expect(text).not.toContain('Testosterone, HCG');
    expect(text).not.toContain('FAILED Phase 2b');
    expect(text).not.toContain('figures are community guesses');
  });
});
