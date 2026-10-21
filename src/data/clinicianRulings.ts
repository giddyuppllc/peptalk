/**
 * Clinician rulings — Jamie Esposito's dosing decisions for PepTalk.
 *
 * SHE IS THE AUTHORITY. Edward, 2026-09-15: "aimee is wrong jamie is right" and
 * "she is the master". When a ruling here disagrees with any other store —
 * protocols.ts, the master table, the reconstitution ladder, Aimee's knowledge
 * file or system prompt, the offline bot — the other store is wrong and gets
 * corrected. Nothing is held back because it trips a guard, looks unusual, or
 * disagrees with a label or a paper; a guard that disagrees with her moves to
 * her value.
 *
 * WHY THIS FILE EXISTS
 * Her review was saved to the clinical-review function (90 rows) on 2026-08-21
 * and `apply:review` wrote only `typicalDose` in protocols.ts — the LOWEST
 * precedence source in canonicalDosing. The master table, the ladder, Aimee's
 * knowledge and prompt kept the old numbers; two rulings (semaglutide,
 * cjc-1295) were withheld outright; cycle rulings were never applied. A
 * ruling that exists only in one store is a ruling users do not see.
 *
 * `clinicianRulings.test.ts` holds every store to every ruling below. Add a
 * ruling here and the test tells you each place still disagreeing.
 *
 * SOURCES (verbatim strings kept alongside the parsed numbers):
 *   review  = GET functions/v1/clinical-review (Jamie's token), snapshot
 *             2026-09-15: `edits[id].correctedDose / correctedCycle /
 *             citation / researchSummary`.
 *   text    = Jamie's text messages 13–14 Sep 2026, relayed in Edward's work
 *             order 2026-09-15.
 */

export type RulingSource = 'review-2026-08' | 'text-2026-09-13';

export interface DoseRuling {
  /** Exactly what she wrote. */
  verbatim: string;
  min: number;
  max: number;
  unit: 'mcg' | 'mg' | 'IU';
  /** Authored beginner/advanced points where she stated them. */
  beginner?: number;
  advanced?: number;
}

export interface CycleRuling {
  verbatim: string;
  /** Null for "As long as needed". */
  minWeeks: number | null;
  maxWeeks: number | null;
}

export interface ClinicianRuling {
  peptideId: string;
  dose?: DoseRuling;
  cycle?: CycleRuling;
  /** Frequency / administration she stated alongside the dose. */
  frequency?: string;
  /** Her citation or research-summary field, verbatim. */
  notes?: string[];
  source: RulingSource[];
}

export const RULINGS_APPROVER = 'Jamie Esposito';
export const RULINGS_SNAPSHOT_DATE = '2026-09-15';

const d = (verbatim: string, min: number, max: number, unit: DoseRuling['unit']): DoseRuling => ({
  verbatim,
  min,
  max,
  unit,
});
const c = (verbatim: string, minWeeks: number | null, maxWeeks: number | null): CycleRuling => ({
  verbatim,
  minWeeks,
  maxWeeks,
});
const R = 'review-2026-08' as const;

export const CLINICIAN_RULINGS: ClinicianRuling[] = [
  { peptideId: '5-amino-1mq-inj', dose: d('500 mcg – 2 mg', 500, 2000, 'mcg'), source: [R] },
  { peptideId: '9-me-bc', dose: d('15 mg – 30 mg', 15, 30, 'mg'), source: [R] },
  { peptideId: 'adipotide', cycle: c('4 weeks', 4, 4), source: [R] },
  { peptideId: 'aicar', dose: d('5 mg – 25 mg', 5, 25, 'mg'), source: [R] },
  { peptideId: 'bpc-157', dose: d('200 mcg – 500 mcg', 200, 500, 'mcg'), source: [R] },
  { peptideId: 'cagrilintide', dose: d('1.2 mg – 2.4 mg', 1.2, 2.4, 'mg'), source: [R] },
  {
    peptideId: 'cjc-1295',
    dose: d('1 mg – 2 mg', 1, 2, 'mg'),
    frequency: 'Every 4-6 days',
    notes: ['Dosages should be given every 4-6 days due to DAC extending the half life.'],
    source: [R],
  },
  { peptideId: 'coq10', dose: d('50 mg – 200 mg', 50, 200, 'mg'), source: [R] },
  { peptideId: 'dsip', dose: d('100 mcg – 300 mcg', 100, 300, 'mcg'), cycle: c('2–6 weeks', 2, 6), source: [R] },
  { peptideId: 'epithalon', dose: d('5 mg – 10 mg', 5, 10, 'mg'), source: [R] },
  {
    peptideId: 'ghk-cu',
    dose: d('1 mg – 5 mg', 1, 5, 'mg'),
    cycle: c('As long as needed', null, null),
    source: [R],
  },
  {
    peptideId: 'glutathione',
    dose: d('200 mg – 400 mg', 200, 400, 'mg'),
    cycle: c('As long as needed', null, null),
    source: [R],
  },
  { peptideId: 'hcg', cycle: c('8–52 weeks', 8, 52), source: [R] },
  { peptideId: 'hexarelin', dose: d('100 mcg – 200 mcg', 100, 200, 'mcg'), source: [R] },
  { peptideId: 'igf-1-lr3', dose: d('20 mcg – 80 mcg', 20, 80, 'mcg'), cycle: c('4–6 weeks', 4, 6), source: [R] },
  { peptideId: 'ipamorelin', dose: d('100 mcg – 500 mcg', 100, 500, 'mcg'), cycle: c('8–12 weeks', 8, 12), source: [R] },
  { peptideId: 'kisspeptin-10', dose: d('30 mcg – 100 mcg', 30, 100, 'mcg'), cycle: c('1–4 weeks', 1, 4), source: [R] },
  { peptideId: 'kpv-inj', dose: d('200 mcg – 500 mcg', 200, 500, 'mcg'), cycle: c('4-12 Weeks', 4, 12), source: [R] },
  { peptideId: 'll-37', dose: d('50 mcg – 200 mcg', 50, 200, 'mcg'), cycle: c('2–4 weeks', 2, 4), source: [R] },
  { peptideId: 'mazdutide', dose: d('3 mg – 9 mg', 3, 9, 'mg'), source: [R] },
  { peptideId: 'melanotan-2', dose: d('250 mcg – 500 mcg', 250, 500, 'mcg'), source: [R] },
  {
    peptideId: 'mots-c',
    dose: d('1 mg – 2 mg 3 times weekly, am on empty stomach, prior to workout', 1, 2, 'mg'),
    frequency: '3 times weekly, AM on an empty stomach, prior to workout',
    cycle: c('6–10 weeks', 6, 10),
    source: [R],
  },
  { peptideId: 'nad-plus', dose: d('50 mg – 200 mg', 50, 200, 'mg'), source: [R] },
  {
    peptideId: 'pt-141',
    dose: d('500 mcg – 2 mg', 500, 2000, 'mcg'),
    cycle: c('1–24 weeks', 1, 24),
    notes: ['Maximum 8 doses monthly'],
    source: [R],
  },
  { peptideId: 'retatrutide', dose: d('1 mg – 12 mg', 1, 12, 'mg'), source: [R] },
  { peptideId: 'selank', dose: d('200 mcg – 500 mcg', 200, 500, 'mcg'), cycle: c('2–4 weeks', 2, 4), source: [R] },
  { peptideId: 'semaglutide', dose: d('250 mcg – 12mg', 250, 12000, 'mcg'), source: [R] },
  { peptideId: 'semax', cycle: c('2–4 weeks', 2, 4), source: [R] },
  { peptideId: 'sermorelin', cycle: c('12–24 weeks', 12, 24), source: [R] },
  {
    peptideId: 'ss-31',
    dose: { ...d('2–5 mg daily; 2 mg beginner, 5 mg advanced', 2, 5, 'mg'), beginner: 2, advanced: 5 },
    frequency: 'Once daily',
    cycle: c('4–12 weeks', 4, 12),
    source: [R, 'text-2026-09-13'],
  },
  { peptideId: 'survodutide', dose: d('2.4 mg – 6 mg', 2.4, 6, 'mg'), source: [R] },
  { peptideId: 'tb-500', dose: d('330 mcg – 1 mg', 330, 1000, 'mcg'), cycle: c('4–12 weeks', 4, 12), source: [R] },
  { peptideId: 'tesamorelin', dose: d('500 mcg – 1 mg', 500, 1000, 'mcg'), source: [R] },
  { peptideId: 'thymosin-alpha-1', dose: d('1 mg – 1.6 mg', 1, 1.6, 'mg'), cycle: c('4–26 weeks', 4, 26), source: [R] },
  { peptideId: 'tirzepatide', dose: d('2.5 mg – 15 mg', 2.5, 15, 'mg'), source: [R] },
];

/** Interaction pairs she marked reviewed (no change requested). */
export const REVIEWED_INTERACTIONS = [
  'aod-9604+retatrutide',
  'bpc-157+kpv-inj',
  'cagrilintide+semaglutide',
  'cjc-1295-no-dac+ipamorelin',
  'cjc-1295+retatrutide',
];

export function getClinicianRuling(peptideId: string): ClinicianRuling | undefined {
  return CLINICIAN_RULINGS.find((r) => r.peptideId === peptideId);
}

/** A dose ruling expressed in micrograms (IU is carried through unconverted). */
export function rulingDoseMcg(r: DoseRuling): { minMcg: number; maxMcg: number } {
  const f = r.unit === 'mg' ? 1000 : 1;
  return { minMcg: r.min * f, maxMcg: r.max * f };
}
