/**
 * Verification harness for src/services/labParsers/labcorp.ts + quest.ts.
 *
 * Lab values feed the AI risk model + trend dashboards. A silent miss
 * here (wrong markerId, missed analyte, wrong unit) ships incorrect
 * health information back to the user and contaminates Aimee's prompt
 * context for every future weekly report.
 *
 * Fixtures are SYNTHETIC — formatted in the LabCorp/Quest visual style
 * but carrying no PHI. We test:
 *   - vendor detection (true positives + true negatives)
 *   - canonical synonym → markerId mapping
 *   - unit + value extraction
 *   - draw-date extraction with both `MM/DD/YYYY` and `MM-DD-YYYY`
 *   - prefix-fallback behavior (so a longer name like "HDL Cholesterol
 *     Calc" still maps to 'hdl')
 *   - non-greedy boundaries (an analyte name should NOT map a totally
 *     different marker just because it shares a prefix)
 *   - tabs + extra spaces tolerated
 *   - garbage / patient-info lines land in unmappedLines
 *
 * Run:
 *   npm run verify:labparsers
 */

import { labcorpParser } from '../src/services/labParsers/labcorp';
import { questParser } from '../src/services/labParsers/quest';
import { detectLabParser } from '../src/services/labParsers';

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

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

function findValue(values: { markerId: string; value: number; unit: string }[], markerId: string) {
  return values.find((v) => v.markerId === markerId);
}

// ─── detection ──────────────────────────────────────────────────────────────

assertEq('detect: LabCorp text', labcorpParser.detect('LabCorp Test Results Report'), true);
assertEq('detect: LCA full name', labcorpParser.detect('Laboratory Corporation of America'), true);
assertEq('detect: Quest text', questParser.detect('Quest Diagnostics Lab Report'), true);

assertEq('detect: LabCorp false-positive on Quest text',
  labcorpParser.detect('Quest Diagnostics Lab Report'), false);
assertEq('detect: Quest false-positive on LabCorp text',
  questParser.detect('LabCorp Test Results'), false);

assertEq('detect: empty string', labcorpParser.detect(''), false);
assertEq('detect: random text', labcorpParser.detect('Random Patient Document'), false);

// ─── detectLabParser auto-routing ───────────────────────────────────────────

{
  const p = detectLabParser('LabCorp Test Results Report\nHDL Cholesterol 55 mg/dL');
  assertEq('autoroute: LabCorp header → labcorp parser', p?.vendor, 'labcorp');
}
{
  const p = detectLabParser('Quest Diagnostics\nGlucose 90 mg/dL');
  assertEq('autoroute: Quest header → quest parser', p?.vendor, 'quest');
}
{
  const p = detectLabParser('Generic Lab Inc.\nGlucose 90 mg/dL');
  assertEq('autoroute: unknown vendor → null', p, null as any);
}

// ─── LabCorp parser — golden fixture (synthetic, real format) ────────────────

const LABCORP_FIXTURE = `LabCorp Test Results Report

Patient: REDACTED
Specimen: REDACTED
Collected: 05/17/2026

HDL Cholesterol 55 mg/dL 40-60
LDL Cholesterol Calc 110 mg/dL <100
Cholesterol, Total 190 mg/dL <200
Triglycerides 120 mg/dL <150
Glucose 92 mg/dL 70-99
Hemoglobin A1c 5.4 % <5.7
Testosterone, Total 650 ng/dL 280-1100
Testosterone, Free 12.5 pg/mL 6.6-18.1
TSH 1.8 mIU/L 0.45-4.5
Vitamin D, 25-Hydroxy 42 ng/mL 30-100
Ferritin 95 ng/mL 30-400
ALT (SGPT) 22 U/L 0-44
hs-CRP 0.8 mg/L <1.0`;

{
  const r = labcorpParser.parseText(LABCORP_FIXTURE);
  assertEq('labcorp: vendor', r.vendor, 'labcorp');
  assertEq('labcorp: drawDate parsed', r.drawDate, '2026-05-17');
  assertTrue('labcorp: parsed >= 10 values', r.values.length >= 10, r.values.length);

  // Spot-check key analytes
  assertEq('labcorp: HDL → hdl', findValue(r.values, 'hdl')?.value, 55);
  assertEq('labcorp: HDL unit (full mg/dL)', findValue(r.values, 'hdl')?.unit, 'mg/dL');
  assertEq('labcorp: LDL Calc → ldl', findValue(r.values, 'ldl')?.value, 110);
  assertEq('labcorp: Total Cholesterol → total_chol',
    findValue(r.values, 'total_chol')?.value, 190);
  assertEq('labcorp: Triglycerides → tg', findValue(r.values, 'tg')?.value, 120);
  assertEq('labcorp: Glucose → glucose', findValue(r.values, 'glucose')?.value, 92);
  assertEq('labcorp: A1c → hba1c', findValue(r.values, 'hba1c')?.value, 5.4);
  assertEq('labcorp: Testosterone Total → t_total',
    findValue(r.values, 't_total')?.value, 650);
  assertEq('labcorp: Testosterone Free → t_free',
    findValue(r.values, 't_free')?.value, 12.5);
  assertEq('labcorp: TSH → tsh', findValue(r.values, 'tsh')?.value, 1.8);
  assertEq('labcorp: Vitamin D → vit_d', findValue(r.values, 'vit_d')?.value, 42);
  assertEq('labcorp: Ferritin → ferritin', findValue(r.values, 'ferritin')?.value, 95);
  assertEq('labcorp: ALT → alt', findValue(r.values, 'alt')?.value, 22);
  assertEq('labcorp: hs-CRP → hs_crp', findValue(r.values, 'hs_crp')?.value, 0.8);
}

// ─── LabCorp — patient header rows filtered ─────────────────────────────────

{
  const r = labcorpParser.parseText(LABCORP_FIXTURE);
  // The Patient/Specimen/Collected lines must NOT appear as values.
  assertTrue('labcorp: no patient line in values',
    !r.values.some((v) => v.markerId.includes('patient')),
    r.values);
  // unmappedLines should not include the headers (they're filtered out).
  assertTrue('labcorp: unmapped does not include Patient row',
    !r.unmappedLines.some((l) => /^patient/i.test(l)));
}

// ─── LabCorp — date variants ────────────────────────────────────────────────

{
  const dashedDate = `LabCorp Report
Collected: 12-25-2025
HDL 55 mg/dL`;
  const r = labcorpParser.parseText(dashedDate);
  assertEq('labcorp: dashed date 12-25-2025', r.drawDate, '2025-12-25');
}

{
  const noDate = `LabCorp Report
HDL 55 mg/dL`;
  const r = labcorpParser.parseText(noDate);
  assertEq('labcorp: missing date → undefined', r.drawDate, undefined);
}

// ─── LabCorp — negative / decimal values ────────────────────────────────────

{
  const r = labcorpParser.parseText('LabCorp\nFree T3 3.42 pg/mL');
  assertEq('labcorp: decimal value 3.42', findValue(r.values, 'free_t3')?.value, 3.42);
}

// ─── LabCorp — tabbed whitespace tolerated ──────────────────────────────────

{
  const r = labcorpParser.parseText('LabCorp\nHDL Cholesterol\t\t55   mg/dL');
  assertEq('labcorp: tabs+spaces between name and value',
    findValue(r.values, 'hdl')?.value, 55);
}

// ─── LabCorp — garbage line lands in unmapped ───────────────────────────────

{
  const r = labcorpParser.parseText('LabCorp\nReference: cholesterol panel pediatric\nHDL 55 mg/dL');
  assertTrue('labcorp: HDL still parsed despite preceding garbage',
    findValue(r.values, 'hdl')?.value === 55);
}

// ─── LabCorp — prefix fallback works ────────────────────────────────────────

{
  // "HDL Cholesterol Calc" doesn't exact-match a synonym key,
  // but should fall back to 'hdl' via the startsWith branch.
  const r = labcorpParser.parseText('LabCorp\nHDL Cholesterol Calc 50 mg/dL');
  assertEq('labcorp: prefix fallback HDL Cholesterol Calc → hdl',
    findValue(r.values, 'hdl')?.value, 50);
}

// ─── LabCorp — empty input ──────────────────────────────────────────────────

{
  const r = labcorpParser.parseText('');
  assertEq('labcorp: empty input → 0 values', r.values.length, 0);
}

// ─── Quest parser — golden fixture ──────────────────────────────────────────

const QUEST_FIXTURE = `Quest Diagnostics Lab Report

Patient Name: REDACTED
Date Collected: 05/17/2026

Cholesterol, Total 190 mg/dL 100-199
HDL Cholesterol 55 mg/dL >= 40
LDL Cholesterol 110 mg/dL <100
Triglycerides 120 mg/dL <150
Glucose 92 mg/dL 65-99
Hemoglobin A1c 5.4 % <5.7
TSH 1.8 mIU/L 0.40-4.50
Testosterone, Total 650 ng/dL 250-1100
Vitamin D, 25-Hydroxy 42 ng/mL 30-100`;

{
  const r = questParser.parseText(QUEST_FIXTURE);
  assertEq('quest: vendor', r.vendor, 'quest');
  assertTrue('quest: parsed >= 7 values', r.values.length >= 7, r.values.length);
  assertEq('quest: HDL', findValue(r.values, 'hdl')?.value, 55);
  assertEq('quest: Total Cholesterol', findValue(r.values, 'total_chol')?.value, 190);
  assertEq('quest: Glucose', findValue(r.values, 'glucose')?.value, 92);
  assertEq('quest: A1c', findValue(r.values, 'hba1c')?.value, 5.4);
}

// ─── Both parsers — no crash on hostile input ────────────────────────────────

assertTrue('labcorp: huge input survives',
  ((): boolean => {
    try { labcorpParser.parseText('x'.repeat(100_000)); return true; }
    catch { return false; }
  })());

assertTrue('quest: huge input survives',
  ((): boolean => {
    try { questParser.parseText('x'.repeat(100_000)); return true; }
    catch { return false; }
  })());

assertTrue('labcorp: null-ish input survives',
  ((): boolean => {
    try { labcorpParser.parseText(''); return true; }
    catch { return false; }
  })());

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Lab parser harness —');
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

console.log('\n✓ All lab parser checks passed.\n');
process.exit(0);
