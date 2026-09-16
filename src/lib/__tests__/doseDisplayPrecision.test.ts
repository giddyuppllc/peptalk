/**
 * No dosing figure renders at two decimals.
 *
 * Work order 2026-09-15: "handle rounding so no dosing figure ever renders at
 * two decimals". SS-31 read "Beginner 5 mg – 16.55 mg / Advanced 28.1 mg –
 * 40 mg"; across the whole dataset the same thirds split put 125 such figures
 * on the peptide screen (Quick dose pills, Cycle plan per-dose and totals, the
 * intensity tiles) plus two in the master dosing table.
 *
 * This walks EVERY protocol × intensity × dosing surface through the functions
 * the screens call — not a re-typed formula — and fails on any rendered dose
 * with two or more decimals, or an IU figure with any decimal.
 *
 * Rule (src/lib/doseUnits roundDoseForDisplay): whole mcg below 1 mg; mg to at
 * most 1dp; whole IU; ml to at most 1dp.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROTOCOL_TEMPLATES, getProtocolsByPeptide } from '../../data/protocols';
import { PEPTIDES } from '../../data/peptides';
import { getDosingTableEntry } from '../../data/peptideDosingTable';
import { getDosingReference } from '../../data/peptideDosingReference';
import { getCalculatorMetadata } from '../../data/calculatorMetadata';
import { formatDose } from '../../utils/calculatorV2';
import {
  computeCyclePlan,
  intensityToDose,
  intensityToDoseRange,
  planStarterDose,
  type ProtocolIntensity,
} from '../protocolDoseMath';
import {
  formatDoseAmount,
  formatDoseBand,
  normalizeDoseRange,
  roundDoseFiguresInText,
  roundDoseForDisplay,
} from '../doseUnits';
import type { ProtocolTemplate } from '../../types';

const ROOT = path.join(__dirname, '..', '..', '..');
const INTENSITIES: ProtocolIntensity[] = ['mild', 'standard', 'aggressive'];

/** A dose figure with two or more decimals, e.g. "16.55 mg" or "0.25mg". */
const TWO_DP = /\d\.\d{2,}/;
/** An IU figure carrying any decimal. */
const FRACTIONAL_IU = /\d\.\d+\s?IU\b/;

/**
 * The dosing calculator is deliberately exact: it prints the dose beside the
 * syringe volume computed from that same number (see formatDoseAmountExact).
 * These are the reconstitution-ladder doses it shows at 2dp. The list must
 * match reality in BOTH directions — a new one fails, and so does one that
 * stops rendering without being removed here.
 */
const CALCULATOR_EXACT_DOSES = new Map<string, string>([
  ['semaglutide|1.25 mg', 'Microdosing step, doseMcg 1250 — "1-1.5 mg (10-15 units)", drawn at 1.25 mg'],
  ['ghk-cu|2.67 mg', 'Standard step, doseMcg 2667 — 8 units at 33.33 mg/mL'],
]);

interface Figure {
  surface: string;
  subject: string;
  text: string;
}

/** Every dose string the dosing surfaces render, computed as the screens compute it. */
function renderedFigures(protocols: ProtocolTemplate[] = PROTOCOL_TEMPLATES): Figure[] {
  const out: Figure[] = [];
  const add = (surface: string, subject: string, text: string) => out.push({ surface, subject, text });
  for (const p of protocols) {
    // Quick dose reference pills (app/peptide/[id].tsx BeginnerAdvancedDoseCard)
    for (const i of ['mild', 'aggressive'] as const) {
      add(`quick-dose ${i}`, p.id, formatDoseBand(intensityToDoseRange(p, i), ' – '));
      add(`quick-dose ${i} a11y`, p.id, formatDoseBand(intensityToDoseRange(p, i), ' to '));
    }
    for (const i of INTENSITIES) {
      // Cycle plan card
      const plan = computeCyclePlan(p, i);
      add(`cycle-plan ${i} per-dose`, p.id, plan.perDoseLabel);
      add(`cycle-plan ${i} total`, p.id, plan.totalDoseLabel);
      // Calculator intensity tiles (ProtocolIntensityPicker) and, for mild, the
      // "Start tracking this peptide" card's TARGET DOSE.
      const d = intensityToDose(p, i);
      add(`intensity-tile ${i}`, p.id, formatDoseAmount(d.value, d.unit));
    }
    // Titration ladder card
    for (const s of p.titrationSchedule ?? []) {
      add('titration', p.id, formatDoseAmount(s.dose, s.unit));
    }
    // Plan Your Cycle "Start cycle" prompt
    const starter = planStarterDose(p);
    add('plan-start-cycle', p.id, formatDoseAmount(starter.dose, starter.unit));
  }
  for (const pep of PEPTIDES) {
    // Dosing reference table card
    const entry = getDosingTableEntry(pep.id);
    if (entry) add('dosing-table', pep.id, roundDoseFiguresInText(entry.dosingRange));
    // Dosing calculator ladder rows
    const ref = getDosingReference(pep.id);
    if (ref) {
      const { displayUnit } = getCalculatorMetadata(pep.id);
      for (const ph of ref.schedule) add('calculator-ladder', pep.id, formatDose(ph.doseMcg / 1000, displayUnit));
    }
  }
  return out;
}

describe('no rendered dose has two decimals', () => {
  const figures = renderedFigures();

  it('examines the full dataset (positive control)', () => {
    expect(PROTOCOL_TEMPLATES.length).toBeGreaterThanOrEqual(40);
    expect(figures.length).toBeGreaterThanOrEqual(600);
    for (const s of ['quick-dose mild', 'cycle-plan standard total', 'intensity-tile standard', 'titration', 'dosing-table', 'calculator-ladder', 'plan-start-cycle']) {
      expect(figures.some((f) => f.surface === s)).toBe(true);
    }
    // The pattern itself catches the defect it exists for.
    expect(TWO_DP.test('5 mg – 16.55 mg')).toBe(true);
    expect(TWO_DP.test('0.25mg-12mg')).toBe(true);
    expect(FRACTIONAL_IU.test('75 IU – 149.25 IU')).toBe(true);
    expect(TWO_DP.test('16.6 mg')).toBe(false);
  });

  it('no reference surface renders a 2dp figure or a fractional IU', () => {
    const bad = figures
      .filter((f) => f.surface !== 'calculator-ladder')
      .filter((f) => TWO_DP.test(f.text) || FRACTIONAL_IU.test(f.text))
      .map((f) => `${f.surface} | ${f.subject} | ${f.text}`);
    expect(bad).toEqual([]);
  });

  it('the calculator shows exactly the known exact-precision doses — no more, none silently gone', () => {
    const live = new Set(
      figures
        .filter((f) => f.surface === 'calculator-ladder' && (TWO_DP.test(f.text) || FRACTIONAL_IU.test(f.text)))
        .map((f) => `${f.subject}|${f.text}`),
    );
    expect([...live].sort()).toEqual([...CALCULATOR_EXACT_DOSES.keys()].sort());
  });

  it("SS-31's old 5–40 mg would now render at 1dp, from the same split", () => {
    const ss31 = getProtocolsByPeptide('ss-31')[0];
    const old: ProtocolTemplate = { ...ss31, typicalDose: { min: 5, max: 40, unit: 'mg' }, doseBands: undefined };
    expect(formatDoseBand(intensityToDoseRange(old, 'mild'), ' – ')).toBe('5 mg – 16.6 mg');
    expect(formatDoseBand(intensityToDoseRange(old, 'aggressive'), ' – ')).toBe('28.1 mg – 40 mg');
    // The maths underneath is unchanged — only the display rounds.
    expect(intensityToDoseRange(old, 'mild').max).toBe(16550);
  });

  it('the dosing table rounds only the figures that need it', () => {
    expect(roundDoseFiguresInText('0.25mg-12mg')).toBe('250mcg-12mg');
    expect(roundDoseFiguresInText('0.33mg-1mg')).toBe('330mcg-1mg');
    expect(roundDoseFiguresInText('2mg-5mg sometimes 10mg')).toBe('2mg-5mg sometimes 10mg');
    expect(roundDoseFiguresInText('1.5 mg, 75 IU')).toBe('1.5 mg, 75 IU');
    expect(roundDoseFiguresInText('149.25 IU')).toBe('149 IU');
  });
});

describe('rounding never collapses or merges the bands', () => {
  it('two ends that display the same print once, never "1 mg – 1 mg"', () => {
    // 1000 and 1040 mcg are different numbers that both display as 1 mg.
    expect(formatDoseBand({ min: 1000, max: 1040, unit: 'mcg', massBased: true }, ' – ')).toBe('1 mg');
    expect(formatDoseBand({ min: 1000, max: 1060, unit: 'mcg', massBased: true }, ' – ')).toBe('1 mg – 1.1 mg');
  });

  it('beginner stays below advanced, and each band stays ordered, after rounding', () => {
    const problems: string[] = [];
    for (const p of PROTOCOL_TEMPLATES) {
      const typical = normalizeDoseRange(p.typicalDose.min, p.typicalDose.max, p.typicalDose.unit);
      // A protocol whose own min equals its max has identical bands by
      // construction, not by rounding — nothing to keep apart.
      if (typical.min === typical.max) continue;
      const r = (v: number, u: typeof typical.unit) => roundDoseForDisplay(v, u);
      const b = intensityToDoseRange(p, 'mild');
      const a = intensityToDoseRange(p, 'aggressive');
      if (r(b.min, b.unit) > r(b.max, b.unit)) problems.push(`${p.id} beginner inverted`);
      if (r(a.min, a.unit) > r(a.max, a.unit)) problems.push(`${p.id} advanced inverted`);
      if (r(b.max, b.unit) >= r(a.min, a.unit)) problems.push(`${p.id} beginner top ${b.max} meets advanced floor ${a.min} after rounding`);
      if (formatDoseBand(b, ' – ') === formatDoseBand(a, ' – ')) problems.push(`${p.id} pills identical`);
    }
    expect(problems).toEqual([]);
  });
});

describe('what the user logs matches what they were shown', () => {
  const rendered = PEPTIDES.map((pep) => getProtocolsByPeptide(pep.id)[0]).filter(
    (p): p is ProtocolTemplate => !!p,
  );

  it('"Start tracking this peptide" stores the exact dose its card displays, inside the range', () => {
    expect(rendered.length).toBeGreaterThanOrEqual(40);
    for (const p of rendered) {
      const d = intensityToDose(p, 'mild');
      const typical = normalizeDoseRange(p.typicalDose.min, p.typicalDose.max, p.typicalDose.unit);
      // Display-rounding the stored value is a no-op, so the card's TARGET DOSE
      // is the number ActivateProtocolButton persists.
      expect([p.id, roundDoseForDisplay(d.value, d.unit)]).toEqual([p.id, d.value]);
      expect(d.value).toBeGreaterThanOrEqual(typical.min);
      expect(d.value).toBeLessThanOrEqual(typical.max);
    }
  });

  it('"Start cycle" stores what its prompt prints, inside the range and below the max', () => {
    // 2026-09-16: the pair now comes back in the unit it is DISPLAYED in, not
    // the protocol's own unit, so the range comparisons below run in
    // micrograms. planStarterDose used to return tesamorelin as
    // { 0.75, 'mg' }: the prompt printed "750 mcg" through formatDoseAmount
    // while the stored PAIR rendered "0.75 mg" on every screen that shows a
    // stored dose — two numbers for one dose, one of them at two decimals.
    // The mass is unchanged; only the label moved, so the range assertions
    // still hold once both sides are in the same unit.
    const mcg = (v: number, u: string) => (u === 'mg' ? v * 1000 : v);
    for (const p of rendered) {
      const s = planStarterDose(p);
      expect([p.id, roundDoseForDisplay(s.dose, s.unit)]).toEqual([p.id, s.dose]);
      if (p.titrationSchedule?.length) continue;
      const { min, max, unit } = p.typicalDose;
      if (unit === 'mg' || unit === 'mcg') {
        // A mass reads in mcg below 1 mg and in mg from there; never both.
        expect([p.id, s.unit]).toEqual([p.id, mcg(s.dose, s.unit) >= 1000 ? 'mg' : 'mcg']);
      } else {
        expect(s.unit).toBe(unit);
      }
      expect(mcg(s.dose, s.unit)).toBeGreaterThanOrEqual(mcg(min, unit));
      expect(mcg(s.dose, s.unit)).toBeLessThanOrEqual(mcg(max, unit));
      // The stated purpose: "so the user isn't started at the max".
      if (min < max) {
        expect([p.id, mcg(s.dose, s.unit) < mcg(max, unit)]).toEqual([p.id, true]);
      }
    }
  });

  it('the starter pair is the pair the prompt prints — no second number for one dose', () => {
    // The specific regression: 0.75 mg and 750 mcg are the same mass, but the
    // prompt showed one and every stored-dose screen showed the other.
    for (const p of rendered) {
      const s = planStarterDose(p);
      if (s.unit !== 'mg' && s.unit !== 'mcg') continue;
      // Rendering the stored pair raw — which five screens do — must now give
      // the same string as rendering it through the formatter.
      expect([p.id, `${s.dose} ${s.unit}`]).toEqual([p.id, formatDoseAmount(s.dose, s.unit)]);
      // And no stored dosing figure carries two decimals.
      expect([p.id, (String(s.dose).split('.')[1] ?? '').length]).toEqual([p.id, expect.any(Number)]);
      expect([p.id, (String(s.dose).split('.')[1] ?? '').length <= 1]).toEqual([p.id, true]);
    }
  });

  it('pins the three compounds whole-unit rounding used to start at the max', () => {
    const start = (id: string) => {
      const s = planStarterDose(getProtocolsByPeptide(id)[0]);
      return formatDoseAmount(s.dose, s.unit);
    };
    expect(start('cjc-1295')).toBe('1.5 mg'); // was 2 mg, the max of 1–2 mg
    expect(start('tesamorelin')).toBe('750 mcg'); // was 1 mg, the max of 0.5–1 mg
    expect(start('somatropin')).toBe('600 mcg'); // was 1 mg, the max of 0.2–1 mg
  });
});

describe('the screens call these functions', () => {
  // The figures above are only what users see if the components render them.
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('each dosing surface renders through the tested function', () => {
    expect(read('src/components/DosingReferenceTableCard.tsx')).toContain('roundDoseFiguresInText(entry.dosingRange)');
    expect(read('src/components/SuppliesEstimatorCard.tsx')).toContain('estimateSupplies(protocol,');
    expect(read('src/components/ProtocolPlanCard.tsx')).toContain('computeCyclePlan(protocol, intensity, vialMcg)');
    expect(read('src/components/TitrationScheduleCard.tsx')).toContain('formatDoseAmount(step.dose');
    expect(read('src/components/ProtocolIntensityPicker.tsx')).toContain('formatDoseAmount(doseValue, unit)');
    const plan = read('app/calculators/plan.tsx');
    expect(plan).toContain('planStarterDose(template)');
    expect(plan).toContain('formatDoseAmount(starterDose, starterUnit)');
    const screen = read('app/peptide/[id].tsx');
    expect(screen).toContain("formatDoseBand");
    expect(screen).toContain('formatDoseAmount(starter.value, starter.unit)');
  });
});
