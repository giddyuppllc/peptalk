/**
 * doseSanity — structural plausibility checks on every dose the peptide screen
 * derives, run against the SAME functions the screens call.
 *
 * WHY
 * SS-31 shipped as typicalDose 5–40 mg. Nothing in the repo could object: the
 * thirds split turned it into "Beginner 5 mg – 16.55 mg / Advanced 28.1 mg –
 * 40 mg" and the Cycle plan multiplied it out to "140 mg–3360 mg", every step
 * arithmetically correct. Jamie caught it by reading the screen. The top of
 * that range was four 10 mg vials per injection, and the master table beside it
 * said 2–5 mg — facts already in this codebase that nothing compared.
 *
 * WHAT IT CHECKS — none of these needs a clinical opinion
 *   invalid-number       dose/weeks not a finite positive number
 *   unknown-unit         a unit the formatter does not know
 *   min-gt-max           typicalDose or durationWeeks inverted
 *   unknown-frequency    no injections-per-week for the enum (the cycle maths
 *                        would silently fall back to 1/week)
 *   mass-dose-ceiling    a single mass dose above 1 g — the signature of a
 *                        mcg value typed into an mg field
 *   band-order           beginner above advanced
 *   band-outside-range   a beginner/advanced band outside typicalDose
 *   cycle-total-mismatch the Cycle plan's injections/total disagree with an
 *                        independent per-dose × per-week × weeks recomputation
 *   dose-exceeds-vial    per-dose max larger than the largest vial the app
 *                        knows the compound comes in
 *   sources-disjoint-10x two mass sources for the same compound that do not
 *                        overlap and sit >= 10x apart (a unit or decimal slip)
 *   provenance-mismatch  a protocol carrying an approved value (doseProvenance)
 *                        whose live numbers — or master-table row — differ
 *
 * WHAT IT DOES NOT DO
 * It does not decide which of two clinical figures is right. A finding means
 * "a human must look", and the fix belongs to the approving clinician.
 */
import type { ProtocolTemplate } from '../types';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { PEPTIDE_DOSING_TABLE } from '../data/peptideDosingTable';
import { PEPTIDE_DOSING_REFERENCE } from '../data/peptideDosingReference';
import { KNOWN_VIAL_SIZES } from '../data/vialSizes';
import { parseRangeToMcg } from '../data/canonicalDosing';
import { normalizeDoseRange } from './doseUnits';
import {
  FREQUENCY_PER_WEEK,
  computeCyclePlan,
  intensityToDoseRange,
  type ProtocolIntensity,
} from './protocolDoseMath';

export type DoseRule =
  | 'invalid-number'
  | 'unknown-unit'
  | 'min-gt-max'
  | 'unknown-frequency'
  | 'mass-dose-ceiling'
  | 'band-order'
  | 'band-outside-range'
  | 'cycle-total-mismatch'
  | 'dose-exceeds-vial'
  | 'sources-disjoint-10x'
  | 'provenance-mismatch';

export interface DoseFinding {
  rule: DoseRule;
  peptideId: string;
  /** Protocol id, or a source label for cross-source findings. */
  subject: string;
  detail: string;
}

/** Stable key for comparing finding sets. */
export const findingKey = (f: DoseFinding) => `${f.rule}|${f.peptideId}|${f.subject}`;

/** One gram. No single peptide dose in this dataset is legitimately above it. */
export const MASS_DOSE_CEILING_MCG = 1_000_000;

const KNOWN_UNITS = new Set(['mcg', 'mg', 'IU', 'ml']);
const INTENSITIES: ProtocolIntensity[] = ['mild', 'standard', 'aggressive'];

/** Relative float tolerance — the split multiplies by 0.33 / 0.66. */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);
const finitePos = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export interface DoseSanityInput {
  protocols: ProtocolTemplate[];
  table: { peptideId: string; dosingRange: string }[];
  ladder: { peptideId: string; vialMg: number; schedule: { doseMcg: number }[] }[];
  vials: Record<string, { vialMg: number[] }>;
}

export const LIVE_DOSING_DATA: DoseSanityInput = {
  protocols: PROTOCOL_TEMPLATES,
  table: PEPTIDE_DOSING_TABLE,
  ladder: PEPTIDE_DOSING_REFERENCE,
  vials: KNOWN_VIAL_SIZES,
};

function largestVialMg(peptideId: string, data: DoseSanityInput): number | null {
  const sizes = [
    ...(data.vials[peptideId]?.vialMg ?? []),
    ...data.ladder.filter((l) => l.peptideId === peptideId).map((l) => l.vialMg),
  ].filter(finitePos);
  return sizes.length ? Math.max(...sizes) : null;
}

/** Checks that need only the protocol itself. */
export function auditProtocol(p: ProtocolTemplate, data: DoseSanityInput = LIVE_DOSING_DATA): DoseFinding[] {
  const out: DoseFinding[] = [];
  const add = (rule: DoseRule, detail: string) =>
    out.push({ rule, peptideId: p.peptideId, subject: p.id, detail });

  const { typicalDose: d, durationWeeks: w } = p;
  if (!finitePos(d?.min) || !finitePos(d?.max)) {
    add('invalid-number', `typicalDose ${d?.min}–${d?.max}`);
    return out;
  }
  if (!finitePos(w?.min) || !finitePos(w?.max)) {
    add('invalid-number', `durationWeeks ${w?.min}–${w?.max}`);
    return out;
  }
  if (!KNOWN_UNITS.has(d.unit)) {
    add('unknown-unit', `unit "${d.unit}"`);
    return out;
  }
  if (d.min > d.max) add('min-gt-max', `typicalDose ${d.min}–${d.max} ${d.unit}`);
  if (w.min > w.max) add('min-gt-max', `durationWeeks ${w.min}–${w.max}`);

  const perWeek = FREQUENCY_PER_WEEK[p.frequency];
  if (!finitePos(perWeek)) add('unknown-frequency', `frequency "${p.frequency}"`);

  const typical = normalizeDoseRange(d.min, d.max, d.unit);
  if (typical.massBased && typical.max > MASS_DOSE_CEILING_MCG) {
    add('mass-dose-ceiling', `per-dose max ${typical.max} mcg exceeds ${MASS_DOSE_CEILING_MCG} mcg`);
  }

  // Beginner / Advanced exactly as the Quick dose reference computes them.
  const beginner = intensityToDoseRange(p, 'mild');
  const advanced = intensityToDoseRange(p, 'aggressive');
  for (const [label, b] of [['beginner', beginner], ['advanced', advanced]] as const) {
    if (b.min > b.max) add('band-order', `${label} band ${b.min}–${b.max} is inverted`);
    if (b.min < typical.min - 1e-9 || b.max > typical.max + 1e-9) {
      add('band-outside-range', `${label} ${b.min}–${b.max} ${b.unit} outside typicalDose ${typical.min}–${typical.max}`);
    }
  }
  if (beginner.min > advanced.min || beginner.max > advanced.max) {
    add('band-order', `beginner ${beginner.min}–${beginner.max} above advanced ${advanced.min}–${advanced.max} (${beginner.unit})`);
  }

  // Cycle plan, recomputed independently of computeCyclePlan's internals.
  if (finitePos(perWeek)) {
    for (const intensity of INTENSITIES) {
      const plan = computeCyclePlan(p, intensity);
      const r = intensityToDoseRange(p, intensity);
      const injMin = perWeek * w.min;
      const injMax = perWeek * w.max;
      const ok =
        close(plan.totalInjMin, injMin) &&
        close(plan.totalInjMax, injMax) &&
        close(plan.totalRange.min, r.min * injMin) &&
        close(plan.totalRange.max, r.max * injMax) &&
        plan.totalRange.unit === r.unit &&
        plan.totalRange.min <= plan.totalRange.max;
      if (!ok) {
        add(
          'cycle-total-mismatch',
          `${intensity}: plan ${plan.totalInjMin}–${plan.totalInjMax} inj, ${plan.totalRange.min}–${plan.totalRange.max} ${plan.totalRange.unit}; ` +
            `expected ${injMin}–${injMax} inj, ${r.min * injMin}–${r.max * injMax} ${r.unit}`,
        );
      }
    }
  }

  const vialMg = largestVialMg(p.peptideId, data);
  if (typical.massBased && vialMg != null && typical.max > vialMg * 1000) {
    add('dose-exceeds-vial', `per-dose max ${typical.max / 1000} mg > largest known vial ${vialMg} mg`);
  }

  // Approved values must still be the live values.
  const approval = p.doseProvenance?.[p.doseProvenance.length - 1]?.approved;
  if (approval) {
    const a = approval.typicalDose;
    if (a.min !== d.min || a.max !== d.max || a.unit !== d.unit) {
      add('provenance-mismatch', `typicalDose ${d.min}–${d.max} ${d.unit} ≠ approved ${a.min}–${a.max} ${a.unit}`);
    }
    const ab = approval.doseBands;
    const pb = p.doseBands;
    const sameBand = (x?: { min: number; max: number }, y?: { min: number; max: number }) =>
      (!x && !y) || (!!x && !!y && x.min === y.min && x.max === y.max);
    if (!sameBand(ab?.beginner, pb?.beginner) || !sameBand(ab?.advanced, pb?.advanced)) {
      add('provenance-mismatch', `doseBands ${JSON.stringify(pb)} ≠ approved ${JSON.stringify(ab)}`);
    }
    const row = data.table.find((t) => t.peptideId === p.peptideId);
    const parsed = row ? parseRangeToMcg(row.dosingRange) : null;
    const approvedMcg = normalizeDoseRange(a.min, a.max, a.unit);
    // A third number trailing the range — "2mg-5mg sometimes 10mg" — parses as
    // 2–5 but still PRINTS 10 mg on the Dosing reference card.
    const numbersInRow = (row?.dosingRange.match(/\d+(?:\.\d+)?/g) ?? []).length;
    if (row && approvedMcg.massBased && (!parsed || parsed.minMcg !== approvedMcg.min || parsed.maxMcg !== approvedMcg.max || numbersInRow > 2)) {
      add('provenance-mismatch', `master table "${row.dosingRange}" ≠ approved ${a.min}–${a.max} ${a.unit}`);
    }
  }

  return out;
}

/** Cross-source: mass ranges for one compound that cannot both be right. */
export function auditSources(peptideId: string, data: DoseSanityInput = LIVE_DOSING_DATA): DoseFinding[] {
  const ranges: { label: string; min: number; max: number }[] = [];
  const lad = data.ladder.find((l) => l.peptideId === peptideId);
  const ladDoses = (lad?.schedule ?? []).map((s) => s.doseMcg).filter(finitePos);
  if (ladDoses.length) ranges.push({ label: 'ladder', min: Math.min(...ladDoses), max: Math.max(...ladDoses) });
  const row = data.table.find((t) => t.peptideId === peptideId);
  // IU and syringe "units" are not masses; parseRangeToMcg would read them as mcg.
  if (row && !/iu|unit/i.test(row.dosingRange)) {
    const t = parseRangeToMcg(row.dosingRange);
    if (t) ranges.push({ label: 'table', min: t.minMcg, max: t.maxMcg });
  }
  for (const p of data.protocols.filter((x) => x.peptideId === peptideId)) {
    const r = normalizeDoseRange(p.typicalDose.min, p.typicalDose.max, p.typicalDose.unit);
    if (r.massBased) ranges.push({ label: p.id, min: r.min, max: r.max });
  }

  const out: DoseFinding[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const [lo, hi] = ranges[i].max < ranges[j].min ? [ranges[i], ranges[j]] : [ranges[j], ranges[i]];
      if (lo.max < hi.min && hi.min >= lo.max * 10) {
        out.push({
          rule: 'sources-disjoint-10x',
          peptideId,
          subject: `${lo.label}~${hi.label}`,
          detail: `${lo.label} ${lo.min}–${lo.max} mcg vs ${hi.label} ${hi.min}–${hi.max} mcg (${Math.round(hi.min / lo.max)}x apart)`,
        });
      }
    }
  }
  return out;
}

/** Every finding across the live dosing data, in a stable order. */
export function auditAllDosing(data: DoseSanityInput = LIVE_DOSING_DATA): DoseFinding[] {
  const ids = new Set<string>([
    ...data.protocols.map((p) => p.peptideId),
    ...data.table.map((t) => t.peptideId),
    ...data.ladder.map((l) => l.peptideId),
  ]);
  const findings = [
    ...data.protocols.flatMap((p) => auditProtocol(p, data)),
    ...[...ids].flatMap((id) => auditSources(id, data)),
  ];
  return findings.sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
}
