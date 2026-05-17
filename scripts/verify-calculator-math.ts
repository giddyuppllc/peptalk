/**
 * Verification harness for src/utils/calculatorV2.ts — §14 canonical
 * peptide dosing math.
 *
 * Run:
 *   npx tsx scripts/verify-calculator-math.ts
 *
 * Exits 0 on pass, 1 on any failure. Prints a summary table.
 *
 * Tracked as deferred task #75 from the 2026-05-17 audit. Lives here
 * rather than in __tests__ because the repo has no Jest/Vitest config
 * today; tsx executes the file directly and we can add a runner later
 * without rewriting the assertions.
 */

import {
  calculate,
  formatDose,
  formatUnits,
  formatVolumeMl,
  parseDoseToMg,
  parseCadence,
  generateCycleDates,
  U100_UNITS_PER_ML,
  type CalculatorInput,
  type CalculatorWarning,
} from '../src/utils/calculatorV2';

interface Check {
  name: string;
  passed: boolean;
  expected?: unknown;
  got?: unknown;
}

const checks: Check[] = [];

function assertClose(name: string, got: number, expected: number, tolerance = 0.001) {
  const passed = Math.abs(got - expected) < tolerance;
  checks.push({ name, passed, expected, got });
}

function assertEq(name: string, got: unknown, expected: unknown) {
  const passed = got === expected;
  checks.push({ name, passed, expected, got });
}

function assertContainsKind(
  name: string,
  warnings: CalculatorWarning[],
  kind: CalculatorWarning['kind'],
) {
  const passed = warnings.some((w) => w.kind === kind);
  checks.push({
    name,
    passed,
    expected: `warning kind ${kind}`,
    got: warnings.map((w) => w.kind),
  });
}

function assertEmpty(name: string, list: unknown[]) {
  const passed = list.length === 0;
  checks.push({ name, passed, expected: '[]', got: list });
}

// ─── §14 canonical math — BPC-157 standard case ──────────────────────────────
//
// 5 mg vial reconstituted in 2 mL. Per-shot dose 250 mcg = 0.25 mg.
// concentration = 5 / 2          = 2.5 mg/mL
// draw          = 0.25 / 2.5      = 0.1 mL
// units (U100)  = 0.1 × 100       = 10 units
// doses/vial    = 5 / 0.25        = 20 doses
{
  const input: CalculatorInput = {
    peptideMgInVial: 5,
    diluentVolumeMl: 2,
    vialSizeMl: 3,
    perShotDoseMg: 0.25,
  };
  const r = calculate(input);
  assertClose('BPC-157 5mg/2mL @ 250mcg — concentration mg/mL', r.concentrationMgPerMl, 2.5);
  assertClose('BPC-157 5mg/2mL @ 250mcg — draw mL', r.drawPerShotMl, 0.1);
  assertClose('BPC-157 5mg/2mL @ 250mcg — units U-100', r.drawPerShotUnits, 10);
  assertClose('BPC-157 5mg/2mL @ 250mcg — doses per vial', r.dosesPerVial, 20);
  assertEmpty('BPC-157 standard — no hard failures', r.hardFailures);
  assertEmpty('BPC-157 standard — no warnings', r.warnings);
}

// ─── §14 canonical math — Selank standard case ───────────────────────────────
// 10 mg vial reconstituted in 5 mL. Per-shot dose 1.5 mg.
// concentration = 10 / 5      = 2 mg/mL
// draw          = 1.5 / 2     = 0.75 mL → 75 units
// doses/vial    = 10 / 1.5    ≈ 6.667 doses
{
  const r = calculate({
    peptideMgInVial: 10,
    diluentVolumeMl: 5,
    vialSizeMl: 5,
    perShotDoseMg: 1.5,
  });
  assertClose('Selank 10mg/5mL @ 1.5mg — concentration', r.concentrationMgPerMl, 2);
  assertClose('Selank 10mg/5mL @ 1.5mg — draw mL', r.drawPerShotMl, 0.75);
  assertClose('Selank 10mg/5mL @ 1.5mg — units U-100', r.drawPerShotUnits, 75);
  assertClose('Selank 10mg/5mL @ 1.5mg — doses per vial', r.dosesPerVial, 10 / 1.5);
}

// ─── §14.1 hard failure — diluent exceeds vial size ─────────────────────────
{
  const r = calculate({
    peptideMgInVial: 5,
    diluentVolumeMl: 6,
    vialSizeMl: 3,
    perShotDoseMg: 0.25,
  });
  assertContainsKind('Diluent > vial size triggers hard failure', r.hardFailures, 'diluent_exceeds_vial');
}

// ─── §14.1 warning — draw exceeds 1.0 mL (U-100 cap) ────────────────────────
//
// 2 mg vial in 5 mL → concentration 0.4 mg/mL. Per-shot 0.5 mg → draw 1.25 mL.
// Should warn with suggestedSplit ≥ 2.
{
  const r = calculate({
    peptideMgInVial: 2,
    diluentVolumeMl: 5,
    vialSizeMl: 5,
    perShotDoseMg: 0.5,
  });
  assertContainsKind(
    'Draw > 1.0 mL triggers U-100 split warning',
    r.warnings,
    'draw_exceeds_u100',
  );
  const w = r.warnings.find((w) => w.kind === 'draw_exceeds_u100');
  if (w && w.kind === 'draw_exceeds_u100') {
    assertEq('Draw split suggestion rounds up to integer', w.suggestedSplit, 2);
  }
}

// ─── §14.1 warning — diluent deviates from recommendation ───────────────────
{
  const r = calculate({
    peptideMgInVial: 5,
    diluentVolumeMl: 3,                       // user picked 3 mL
    vialSizeMl: 5,
    perShotDoseMg: 0.25,
    recommendedReconstitutionMl: 2,           // reference says 2 mL
  });
  assertContainsKind(
    'Diluent deviation from reference triggers warning',
    r.warnings,
    'diluent_deviates_from_recommendation',
  );
}

// ─── §14.1 warning — dose outside protocol range ────────────────────────────
{
  const r = calculate({
    peptideMgInVial: 5,
    diluentVolumeMl: 2,
    vialSizeMl: 3,
    perShotDoseMg: 1.0,                       // 1 mg — too high
    protocolRangeMg: { min: 0.2, max: 0.5 },
  });
  assertContainsKind(
    'Dose above protocol max triggers warning',
    r.warnings,
    'dose_outside_protocol_range',
  );
}

// ─── Div-by-zero guard ───────────────────────────────────────────────────────
{
  const r = calculate({
    peptideMgInVial: 5,
    diluentVolumeMl: 0,                       // user mid-typing
    vialSizeMl: 3,
    perShotDoseMg: 0.25,
  });
  // safeDiluent falls back to 1 mL so we get 5 mg/mL, 0.05 mL draw, 5 units.
  // Crucially: no NaN/Infinity anywhere.
  assertEq('Zero diluent does not produce NaN concentration', Number.isFinite(r.concentrationMgPerMl), true);
  assertEq('Zero diluent does not produce NaN draw', Number.isFinite(r.drawPerShotMl), true);
  assertEq('Zero diluent does not produce NaN units', Number.isFinite(r.drawPerShotUnits), true);
}

// ─── Zero per-shot dose — no div-by-zero on dosesPerVial ────────────────────
{
  const r = calculate({
    peptideMgInVial: 5,
    diluentVolumeMl: 2,
    vialSizeMl: 3,
    perShotDoseMg: 0,
  });
  assertEq('Zero per-shot dose yields 0 doses (not Infinity)', r.dosesPerVial, 0);
}

// ─── U100_UNITS_PER_ML is the published constant ────────────────────────────
assertEq('U-100 constant equals 100 units/mL', U100_UNITS_PER_ML, 100);

// ─── formatDose / parseDoseToMg roundtrip ───────────────────────────────────
{
  // 250 mcg ↔ 0.25 mg
  assertEq('parseDoseToMg(250, mcg) = 0.25', parseDoseToMg(250, 'mcg'), 0.25);
  assertEq('parseDoseToMg(0.25, mg) = 0.25', parseDoseToMg(0.25, 'mg'), 0.25);

  // formatDose under each unit
  assertEq('formatDose(0.25, mg) → "0.25 mg"', formatDose(0.25, 'mg'), '0.25 mg');
  assertEq('formatDose(0.25, mcg) → "250 mcg"', formatDose(0.25, 'mcg'), '250 mcg');
  assertEq('formatDose(15, mg) shows 1 decimal', formatDose(15, 'mg'), '15.0 mg');
  assertEq('formatVolumeMl(0.1) → "0.10 mL"', formatVolumeMl(0.1), '0.10 mL');
  assertEq('formatUnits(10) → "10.0 units"', formatUnits(10), '10.0 units');
}

// ─── parseCadence — every supported phrasing ────────────────────────────────
{
  assertEq('parseCadence("daily")', parseCadence('daily'), 'daily');
  assertEq('parseCadence("twice daily")', parseCadence('twice daily'), 'daily');
  assertEq('parseCadence("EOD")', parseCadence('EOD'), 'eod');
  assertEq('parseCadence("every other day")', parseCadence('every other day'), 'eod');
  assertEq('parseCadence("once weekly")', parseCadence('once weekly'), 'weekly');
  assertEq('parseCadence("1x/week")', parseCadence('1x/week'), 'weekly');
  assertEq('parseCadence("Mon/Wed/Fri")', parseCadence('Mon/Wed/Fri'), 'mon_wed_fri');
  assertEq('parseCadence("3x/week")', parseCadence('3x/week'), 'mon_wed_fri');
  assertEq('parseCadence("Mon/Thu")', parseCadence('Mon/Thu'), 'mon_thu');
  assertEq('parseCadence("2x/week")', parseCadence('2x/week'), 'mon_thu');
  assertEq('parseCadence("unparseable nonsense") falls back to weekly', parseCadence('open — titrate'), 'weekly');
}

// ─── generateCycleDates — daily for 12 weeks = 84 dates ─────────────────────
{
  // Use a fixed start so the assertion is deterministic.
  const dates = generateCycleDates('2026-05-17', '12 weeks', 'daily');
  assertEq('Daily x 12 weeks → 84 dates', dates.length, 84);
  assertEq('First date == start', dates[0], '2026-05-17');
}

// ─── generateCycleDates — weekly for 4 weeks = 4 dates ──────────────────────
{
  const dates = generateCycleDates('2026-05-17', '4 weeks', 'once weekly');
  assertEq('Weekly x 4 weeks → 4 dates', dates.length, 4);
  // Each week is 7 days apart.
  if (dates.length === 4) {
    const days = dates.map((d) => new Date(d).getTime());
    const diffs = days.slice(1).map((t, i) => Math.round((t - days[i]) / 86_400_000));
    assertEq('Weekly cadence diffs all = 7', diffs.every((n) => n === 7), true);
  }
}

// ─── generateCycleDates — EOD for 20 days = 10 dates ────────────────────────
{
  const dates = generateCycleDates('2026-05-17', '20 days', 'EOD');
  assertEq('EOD x 20 days → 10 dates', dates.length, 10);
}

// ─── generateCycleDates — Mon/Wed/Fri respects weekday ──────────────────────
{
  // 2026-05-17 is a Sunday.
  const dates = generateCycleDates('2026-05-17', '1 week', 'Mon/Wed/Fri');
  assertEq('Mon/Wed/Fri x 1 week → 3 dates', dates.length, 3);
  // Verify each is actually a Mon, Wed, or Fri.
  // Use local-time parsing to match how the implementation reads the date,
  // otherwise `new Date("YYYY-MM-DD")` UTC-parses and we get the wrong dow
  // for any verifier west of UTC.
  const parseLocal = (s: string): Date => {
    const [y, mo, d] = s.split('-').map(Number);
    return new Date(y!, mo! - 1, d!);
  };
  const dows = dates.map((d) => parseLocal(d).getDay());
  assertEq('All dates are Mon (1), Wed (3), or Fri (5)', dows.every((d) => d === 1 || d === 3 || d === 5), true);
}

// ─── generateCycleDates — unparseable cycle falls back to 28 days ───────────
{
  const dates = generateCycleDates('2026-05-17', undefined, 'daily');
  assertEq('Undefined cycle length → 28-day default for daily cadence', dates.length, 28);
}

// ─── Summary + exit ──────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

const pad = (s: string, w: number) => s.padEnd(w, ' ');

console.log('\nCalculator math verification\n' + '─'.repeat(60));
for (const c of checks) {
  console.log(`  ${c.passed ? '✓' : '✗'} ${pad(c.name, 56)}`);
  if (!c.passed) {
    console.log(`      expected: ${JSON.stringify(c.expected)}`);
    console.log(`      got:      ${JSON.stringify(c.got)}`);
  }
}
console.log('─'.repeat(60));
console.log(`  ${passed} passed, ${failed.length} failed of ${checks.length} total\n`);

if (failed.length > 0) {
  process.exit(1);
}
