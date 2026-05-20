/**
 * Verification harness for src/services/doseCalculator.ts.
 *
 * Drives the legacy reconstitution screen + the Calculator sub-tab.
 * The newer canonical calculator (src/utils/calculatorV2.ts §14) has
 * its own harness; this one covers the parallel legacy module that's
 * still imported by app/calculators/reconstitution.tsx and the
 * "Calculator" sub-tab.
 *
 * A 10× error here means a user draws 10× the intended peptide. The
 * function has divide-by-zero guards — this harness ensures they
 * actually fire, AND that `suggestBacWaterForRoundUnits` returns a
 * sane BAC volume in the practical 0.5–5 ml range.
 *
 * Run:
 *   npm run verify:dosecalc
 */

import {
  calculateReconstitution,
  suggestBacWaterForRoundUnits,
  formatDose,
  formatVolume,
} from '../src/services/doseCalculator';

interface Check {
  name: string;
  passed: boolean;
  expected?: unknown;
  got?: unknown;
}

const checks: Check[] = [];

function assertEq(name: string, got: unknown, expected: unknown) {
  checks.push({ name, passed: got === expected, expected, got });
}

function assertClose(name: string, got: number, expected: number, tol = 0.01) {
  checks.push({
    name,
    passed: Math.abs(got - expected) < tol,
    expected,
    got,
  });
}

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

// ─── calculateReconstitution — canonical case ───────────────────────────────
//
// 10 mg vial / 2 ml BAC water / 250 mcg desired dose
//   vialMcg            = 10 × 1000        = 10000 mcg
//   concentration      = 10 / 2           = 5 mg/mL
//   concentration/tick = 10000 / (2×10)   = 500 mcg per 0.1 ml
//   volume/dose        = 250 / (5 × 1000) = 0.05 ml
//   ticksU100          = 250 / 500        = 0.5 ticks
//   units (U-100)      = 0.05 × 100       = 5 units
//   doses/vial         = floor(10000/250) = 40

{
  const r = calculateReconstitution({
    vialMg: 10, bacWaterMl: 2, desiredDoseMcg: 250,
  });
  assertClose('10mg/2ml @ 250mcg — concentration', r.concentrationMgPerMl, 5);
  assertClose('10mg/2ml @ 250mcg — volume', r.volumePerDoseMl, 0.05);
  assertClose('10mg/2ml @ 250mcg — syringeUnits (U-100)', r.syringeUnits, 5);
  assertEq('10mg/2ml @ 250mcg — doses/vial', r.dosesPerVial, 40);
  assertClose('10mg/2ml @ 250mcg — concentration/tick', r.concentrationMcgPerTick, 500);
  assertClose('10mg/2ml @ 250mcg — ticksU100', r.ticksU100, 0.5);
}

// ─── U-40 syringe ────────────────────────────────────────────────────────────
{
  const r = calculateReconstitution({
    vialMg: 10, bacWaterMl: 2, desiredDoseMcg: 250, syringe: 'U-40',
  });
  // U-40: 40 units = 1 ml → 0.05 ml = 2 units
  assertClose('U-40 syringe — units', r.syringeUnits, 2);
}

// ─── Divide-by-zero guards ───────────────────────────────────────────────────
{
  const r = calculateReconstitution({ vialMg: 0, bacWaterMl: 2, desiredDoseMcg: 250 });
  assertEq('vialMg=0 → all zeros', r.volumePerDoseMl, 0);
  assertEq('vialMg=0 → concentration 0', r.concentrationMgPerMl, 0);
  assertEq('vialMg=0 → no NaN', Number.isFinite(r.syringeUnits), true);
}
{
  const r = calculateReconstitution({ vialMg: 10, bacWaterMl: 0, desiredDoseMcg: 250 });
  assertEq('bacWater=0 → no Infinity', Number.isFinite(r.concentrationMgPerMl), true);
  assertEq('bacWater=0 → volume 0', r.volumePerDoseMl, 0);
}
{
  const r = calculateReconstitution({ vialMg: 10, bacWaterMl: 2, desiredDoseMcg: 0 });
  assertEq('desiredDose=0 → no NaN', Number.isFinite(r.volumePerDoseMl), true);
}

// ─── Negative inputs treated as invalid ──────────────────────────────────────
{
  const r = calculateReconstitution({ vialMg: -1, bacWaterMl: 2, desiredDoseMcg: 250 });
  assertEq('negative vial → 0', r.volumePerDoseMl, 0);
}
{
  const r = calculateReconstitution({ vialMg: 10, bacWaterMl: -2, desiredDoseMcg: 250 });
  assertEq('negative BAC → 0', r.volumePerDoseMl, 0);
}

// ─── Dose floor — partial doses don't count ──────────────────────────────────
{
  // 10 mg vial / 333 mcg dose → 30.03 doses → floor to 30
  const r = calculateReconstitution({ vialMg: 10, bacWaterMl: 2, desiredDoseMcg: 333 });
  assertEq('dosesPerVial floors partial', r.dosesPerVial, 30);
}

// ─── Larger / smaller vials ──────────────────────────────────────────────────
{
  // 5 mg vial / 3 ml BAC / 100 mcg → conc 1.67 mg/ml → vol 0.06 ml → 6 units
  const r = calculateReconstitution({ vialMg: 5, bacWaterMl: 3, desiredDoseMcg: 100 });
  assertClose('5mg/3ml @ 100mcg — concentration', r.concentrationMgPerMl, 1.667, 0.01);
  assertClose('5mg/3ml @ 100mcg — units U-100', r.syringeUnits, 6, 0.5);
}

// ─── suggestBacWaterForRoundUnits ────────────────────────────────────────────

// Suggested BAC must land in the practical 0.5–5 ml range.
{
  const bac = suggestBacWaterForRoundUnits(5, 250);
  assertTrue('suggest: 5mg/250mcg — in 0.5..5 range',
    bac >= 0.5 && bac <= 5, bac);
  // And rounding to 0.5 ml steps
  assertTrue('suggest: rounded to 0.5 ml step',
    (bac * 2) % 1 === 0, bac);
}
{
  const bac = suggestBacWaterForRoundUnits(10, 1000);
  assertTrue('suggest: 10mg/1000mcg — in 0.5..5', bac >= 0.5 && bac <= 5, bac);
}
{
  // Edge: 0 or negative inputs → 0 fallback
  assertEq('suggest: 0 vial → 0', suggestBacWaterForRoundUnits(0, 250), 0);
  assertEq('suggest: 0 dose → 0', suggestBacWaterForRoundUnits(5, 0), 0);
  assertEq('suggest: negative → 0', suggestBacWaterForRoundUnits(-1, 250), 0);
}
{
  // Sanity: with bac=suggested, the resulting units should be reasonable
  const bac = suggestBacWaterForRoundUnits(5, 250);
  const r = calculateReconstitution({
    vialMg: 5, bacWaterMl: bac, desiredDoseMcg: 250,
  });
  assertTrue('suggest: resulting units 5..50',
    r.syringeUnits >= 5 && r.syringeUnits <= 50, r.syringeUnits);
}

// ─── formatDose ─────────────────────────────────────────────────────────────

assertEq('formatDose: 999 mcg → "999 mcg"', formatDose(999), '999 mcg');
assertEq('formatDose: 1500 → "1.5 mg"', formatDose(1500), '1.5 mg');
assertEq('formatDose: 1000 → "1 mg"', formatDose(1000), '1 mg');
assertEq('formatDose: 2000 → "2 mg"', formatDose(2000), '2 mg');
assertEq('formatDose: 250 → "250 mcg"', formatDose(250), '250 mcg');
assertEq('formatDose: 0.4 → "0 mcg" (rounded)', formatDose(0.4), '0 mcg');

// ─── formatVolume ────────────────────────────────────────────────────────────

assertEq('formatVolume: 0.05 → "0.050 ml"', formatVolume(0.05), '0.050 ml');
assertEq('formatVolume: 1.2 → "1.20 ml"', formatVolume(1.2), '1.20 ml');
assertEq('formatVolume: 0.5 → "0.500 ml"', formatVolume(0.5), '0.500 ml');
assertEq('formatVolume: 2 → "2.00 ml"', formatVolume(2), '2.00 ml');

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Dose calculator harness —');
console.log(`Total checks: ${checks.length}`);
console.log(`Passed:       ${passed}`);
console.log(`Failed:       ${failed.length}`);

if (failed.length > 0) {
  console.log('\nFailures:');
  for (const f of failed) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    got:      ${JSON.stringify(f.got)}`);
  }
  process.exit(1);
}

console.log('\n✓ All dose calculator checks passed.\n');
process.exit(0);
