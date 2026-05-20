/**
 * Verification harness for src/services/labParsers/inbody.ts.
 *
 * InBody 270/570/770 body-composition printouts feed
 * useBodyCompositionStore which drives the body-comp dashboard +
 * Aimee's weekly delta reports. A wrong unit (kg interpreted as lb)
 * means a 75 kg user appears as 75 lb — and the delta cards report
 * impossible weight loss.
 *
 * Synthetic fixtures (real format, no PHI).
 *
 * Run:
 *   npm run verify:inbody
 */

import { inbodyParser } from '../src/services/labParsers/inbody';

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

function assertClose(name: string, got: number, expected: number, tol = 0.05) {
  checks.push({
    name,
    passed: typeof got === 'number' && Math.abs(got - expected) < tol,
    expected,
    got,
  });
}

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

// ─── detection ──────────────────────────────────────────────────────────────

assertEq('detect: InBody 570 text', inbodyParser.detect('InBody 570 Scan'), true);
assertEq('detect: SMM: alias', inbodyParser.detect('SMM: 35'), true);
assertEq('detect: empty', inbodyParser.detect(''), false);
assertEq('detect: unrelated', inbodyParser.detect('LabCorp Results'), false);

// ─── device id ──────────────────────────────────────────────────────────────

{
  const r = inbodyParser.parseText('InBody 770 Test\nWeight 180.5');
  assertEq('device: 770 → InBody 770', r.device, 'InBody 770');
}
{
  const r = inbodyParser.parseText('InBody 270 Test\nWeight 180.5');
  assertEq('device: 270 → InBody 270', r.device, 'InBody 270');
}
{
  const r = inbodyParser.parseText('Some other scanner\nSMM: 35');
  assertEq('device: unknown → Other', r.device, 'Other');
}

// ─── lb printout — direct passthrough ───────────────────────────────────────

const LB_FIXTURE = `InBody 570 Body Composition Analysis

Test Date: 2026.05.17

Weight 180.5
Percent Body Fat 17.5
Skeletal Muscle Mass 85.2
Body Fat Mass 31.6
ECW/TBW 0.382
Basal Metabolic Rate 1822
Visceral Fat Level 7
Right Arm 9.1
Left Arm 9.0
Trunk 38.5
Right Leg 14.2
Left Leg 14.1`;

{
  const r = inbodyParser.parseText(LB_FIXTURE);
  assertEq('lb: device InBody 570', r.device, 'InBody 570');
  assertEq('lb: scan date 2026-05-17', r.drawDate, '2026-05-17');
  assertClose('lb: weight 180.5 lb', r.scan.weightLb ?? 0, 180.5);
  assertClose('lb: body fat % 17.5', r.scan.bodyFatPercent ?? 0, 17.5);
  assertClose('lb: lean mass 85.2 lb', r.scan.leanMassLb ?? 0, 85.2);
  assertClose('lb: fat mass 31.6 lb', r.scan.fatMassLb ?? 0, 31.6);
  assertClose('lb: ECW/TBW 0.382', r.scan.ecwTbwRatio ?? 0, 0.382);
  assertEq('lb: BMR 1822', r.scan.bmrKcal, 1822);
  assertEq('lb: visceral fat 7', r.scan.visceralFatLevel, 7);
  assertTrue('lb: segmental populated', !!r.scan.segmental, r.scan.segmental);
  assertClose('lb: segmental right arm 9.1', r.scan.segmental?.rightArm ?? 0, 9.1);
}

// ─── kg printout — converts to lb ───────────────────────────────────────────

const KG_FIXTURE = `InBody 770 Body Composition Analysis

Test Date: 2026.05.17

Weight (kg) 82.0
Percent Body Fat 17.5
Skeletal Muscle Mass 38.6
Body Fat Mass 14.3`;

{
  const r = inbodyParser.parseText(KG_FIXTURE);
  // 82 kg × 2.20462 ≈ 180.78 lb
  assertClose('kg: weight 82 kg → ~180.78 lb', r.scan.weightLb ?? 0, 180.78, 0.5);
  // 38.6 kg × 2.20462 ≈ 85.10 lb
  assertClose('kg: lean 38.6 kg → ~85.10 lb', r.scan.leanMassLb ?? 0, 85.10, 0.5);
  // BMR + body fat % aren't converted (they're % / kcal, not mass)
  assertClose('kg: body fat % unchanged', r.scan.bodyFatPercent ?? 0, 17.5);
}

// ─── ECW/TBW boundary — has slash in label ──────────────────────────────────

{
  const r = inbodyParser.parseText(`InBody 570\nECW/TBW 0.39`);
  assertClose('ECW/TBW with slash in label', r.scan.ecwTbwRatio ?? 0, 0.39);
}

// ─── partial scan — missing fields stay undefined ───────────────────────────

{
  const r = inbodyParser.parseText(`InBody 270\nWeight 180.5`);
  assertClose('partial: weight present', r.scan.weightLb ?? 0, 180.5);
  assertEq('partial: body fat % undefined', r.scan.bodyFatPercent, undefined);
  assertEq('partial: lean undefined', r.scan.leanMassLb, undefined);
  assertEq('partial: BMR undefined', r.scan.bmrKcal, undefined);
}

// ─── date variants ──────────────────────────────────────────────────────────

{
  const r = inbodyParser.parseText(`InBody 570\nDate: 2026-05-17\nWeight 180`);
  assertEq('date: dashed 2026-05-17', r.drawDate, '2026-05-17');
}
{
  const r = inbodyParser.parseText(`InBody 570\nDate: 2026/05/17\nWeight 180`);
  assertEq('date: slashed 2026/05/17', r.drawDate, '2026-05-17');
}
{
  const r = inbodyParser.parseText(`InBody 570\nWeight 180`);
  assertEq('date: missing → undefined', r.drawDate, undefined);
}

// ─── negative value tolerated (some InBody printouts emit negative
//      delta values in the "Change" column — readNumberAfter captures
//      the first number after the label so we should NOT misread one)
{
  const r = inbodyParser.parseText(`InBody 570\nWeight -0.5\nPercent Body Fat 17.5`);
  // Note: this is a fake "negative weight" test — real printouts wouldn't
  // emit -0.5 for absolute weight. But the regex MUST NOT crash, and
  // body fat % which follows must still parse correctly.
  assertEq('negative tolerated — bf% still parses',
    Math.abs((r.scan.bodyFatPercent ?? 0) - 17.5) < 0.1, true);
}

// ─── crash-safety ───────────────────────────────────────────────────────────

assertTrue('survives empty input',
  ((): boolean => {
    try { inbodyParser.parseText(''); return true; }
    catch { return false; }
  })());

assertTrue('survives huge input',
  ((): boolean => {
    try { inbodyParser.parseText('x'.repeat(100_000)); return true; }
    catch { return false; }
  })());

assertTrue('survives garbage input',
  ((): boolean => {
    try { inbodyParser.parseText('!@#$%^&*()' + '\n'.repeat(1000)); return true; }
    catch { return false; }
  })());

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— InBody parser harness —');
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

console.log('\n✓ All InBody parser checks passed.\n');
process.exit(0);
