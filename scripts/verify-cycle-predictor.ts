/**
 * Verification harness for src/services/cyclePredictor.ts.
 *
 * Women's health math: cycle stats, prediction windows, and phase
 * coloring drive the menstrual-cycle dashboard cards. Quiet defects
 * here (off-by-one phase boundaries, divide-by-zero in std-dev,
 * unfiltered outliers) ship bad health information.
 *
 * Run:
 *   npm run verify:cycle
 *
 * Exits 0 on pass, 1 on any failure.
 */

import {
  computeCycleStats,
  computeCyclePrediction,
  phaseForDate,
} from '../src/services/cyclePredictor';
import type { PeriodEntry, ContraceptionMethod } from '../src/types/cycle';

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

function assertNull(name: string, got: unknown) {
  checks.push({ name, passed: got === null, expected: null, got });
}

function assertNotNull(name: string, got: unknown) {
  checks.push({ name, passed: got !== null, expected: 'non-null', got });
}

function assertTrue(name: string, cond: boolean, detail?: unknown) {
  checks.push({ name, passed: cond, expected: true, got: detail ?? cond });
}

function period(startDate: string, endDate?: string): PeriodEntry {
  return { startDate, endDate, id: `p-${startDate}` } as any;
}

// ─── computeCycleStats ──────────────────────────────────────────────────────

// 1. Empty periods → null
assertNull('stats: empty array → null', computeCycleStats([]));

// 2. One period only → null (need 2 starts for a cycle length)
assertNull('stats: one period → null', computeCycleStats([period('2026-04-01', '2026-04-05')]));

// 3. Two periods 28 days apart → avg 28
{
  const r = computeCycleStats([
    period('2026-03-01', '2026-03-05'),
    period('2026-03-29', '2026-04-02'),
  ]);
  assertEq('stats: 2 periods 28d apart — avgCycleLength', r?.avgCycleLength, 28);
  assertEq('stats: 2 periods 28d apart — cycleCount', r?.cycleCount, 1);
  assertEq('stats: 2 periods 28d apart — irregularityScore', r?.irregularityScore, 0);
}

// 4. Three periods exactly 28 days apart → irregularity 0
{
  const r = computeCycleStats([
    period('2026-02-01', '2026-02-05'),
    period('2026-03-01', '2026-03-05'),
    period('2026-03-29', '2026-04-02'),
  ]);
  assertEq('stats: 3 periods 28d apart — count', r?.cycleCount, 2);
  assertEq('stats: 3 periods 28d apart — irregularity 0%', r?.irregularityScore, 0);
}

// 5. Variable cycle lengths 28/29/30/31 → small irregularity
{
  const r = computeCycleStats([
    period('2026-01-01'),
    period('2026-01-29'),  // 28 days
    period('2026-02-27'),  // 29
    period('2026-03-29'),  // 30
    period('2026-04-29'),  // 31
  ]);
  assertEq('stats: 28/29/30/31 — cycleCount', r?.cycleCount, 4);
  assertTrue('stats: 28/29/30/31 — irregularity in 3-5% range',
    (r?.irregularityScore ?? 0) >= 3 && (r?.irregularityScore ?? 0) <= 5,
    r?.irregularityScore);
}

// 6. 200-day outlier filtered (>90 cap)
{
  const r = computeCycleStats([
    period('2025-05-01'),
    period('2025-11-15'),  // 198 days — filtered
    period('2025-12-13'),  // 28 days from 2025-11-15
  ]);
  // 198-day outlier dropped, 28-day kept → cycleCount=1, avg=28
  assertEq('stats: 200-day outlier filtered — count', r?.cycleCount, 1);
  assertEq('stats: 200-day outlier filtered — avg=28', r?.avgCycleLength, 28);
}

// 7. shortest + longest captured
{
  const r = computeCycleStats([
    period('2026-01-01'),
    period('2026-01-28'),  // 27
    period('2026-02-25'),  // 28
    period('2026-03-30'),  // 33
  ]);
  assertEq('stats: shortest 27', r?.shortestCycle, 27);
  assertEq('stats: longest 33', r?.longestCycle, 33);
}

// ─── computeCyclePrediction — mode gating ───────────────────────────────────

const NOW = new Date(2026, 4, 17, 12, 0, 0); // 2026-05-17 local noon

function predict(method: ContraceptionMethod, periods: PeriodEntry[], opts: Partial<{ fallbackCycleLength: number; fallbackPeriodLength: number }> = {}) {
  return computeCyclePrediction({
    method,
    periods,
    now: NOW,
    fallbackCycleLength: opts.fallbackCycleLength,
    fallbackPeriodLength: opts.fallbackPeriodLength,
  });
}

// 8. IUD (continuous mode) → null
assertNull('predict: hormonal_iud (continuous) → null',
  predict('hormonal_iud', [period('2026-04-01', '2026-04-05')]));

// 9. Combined pill, no periods, no fallback → null
assertNull('predict: pill + no periods + no fallback → null',
  predict('combined_hormonal', []));

// 10. Combined pill, no periods, fallback=28 → low confidence prediction
{
  const p = predict('combined_hormonal', [], { fallbackCycleLength: 28 });
  assertNotNull('predict: pill + fallback → not null', p);
  assertEq('predict: pill + fallback → confidence low', p?.confidence, 'low');
}

// 11. No method (cyclical), 3 cycles → medium confidence
{
  const p = predict('none', [
    period('2026-02-01'),
    period('2026-03-01'),
    period('2026-03-29'),
    period('2026-04-26'),
  ]);
  assertNotNull('predict: 4 periods → not null', p);
  // 3 cycles, low irregularity → medium
  assertEq('predict: 3 cycles low irreg → medium', p?.confidence, 'medium');
}

// 12. 6+ cycles, low irregularity → high
{
  // 7 periods, each ~28-30 days apart. Real calendar dates so daysBetween
  // returns a positive integer (not NaN from an invalid date string).
  const p = predict('none', [
    period('2025-10-01'),
    period('2025-10-29'),  // 28
    period('2025-11-26'),  // 28
    period('2025-12-24'),  // 28
    period('2026-01-21'),  // 28
    period('2026-02-18'),  // 28
    period('2026-03-18'),  // 28
  ]);
  // 6 cycle deltas all 28 days → irregularity 0%, cycleCount=6 → high
  assertEq('predict: 7 periods (low irreg) → high', p?.confidence, 'high');
}

// 13. Stable cycle length math: last period 2026-05-01, cycle 28 → next = 2026-05-29
{
  const p = predict('none', [period('2026-04-03'), period('2026-05-01')]);
  assertEq('predict: last 2026-05-01 + 28d → next 2026-05-29',
    p?.nextPeriodDate, '2026-05-29');
}

// 14. daysUntilNextPeriod negative if late (now=2026-05-17, last=2026-04-01, cycle≈28 → next=2026-04-29)
{
  const p = predict('none', [period('2026-03-04'), period('2026-04-01')]);
  assertEq('predict: late → isLate true', p?.isLate, true);
  assertTrue('predict: late → daysUntil negative', (p?.daysUntilNextPeriod ?? 0) < 0);
}

// 15. ovulationDate is 14 days before next period
{
  const p = predict('none', [period('2026-04-03'), period('2026-05-01')]);
  // next = 2026-05-29; ovulation = 2026-05-15
  assertEq('predict: ovulation = next - 14', p?.ovulationDate, '2026-05-15');
}

// 16. Fertile window is 5 days ending at ovulation
{
  const p = predict('none', [period('2026-04-03'), period('2026-05-01')]);
  // ov = 2026-05-15; fertile = [2026-05-10, 2026-05-15]
  assertEq('predict: fertile.start = ov - 5', p?.fertileWindow.start, '2026-05-10');
  assertEq('predict: fertile.end = ov', p?.fertileWindow.end, '2026-05-15');
}

// 17. pmsWindow is 5 days ending day before next period
{
  const p = predict('none', [period('2026-04-03'), period('2026-05-01')]);
  // next = 2026-05-29; pms = [2026-05-24, 2026-05-28]
  assertEq('predict: pms.start = next - 5', p?.pmsWindow.start, '2026-05-24');
  assertEq('predict: pms.end = next - 1', p?.pmsWindow.end, '2026-05-28');
}

// 18. Garbage fallback (0) → null (the `!input.fallbackCycleLength` guard kicks in
// because 0 is falsy, even though clampCycle would also reject it)
{
  const p = predict('combined_hormonal', [], { fallbackCycleLength: 0 });
  assertNull('predict: pill + fallback=0 + no periods → null (falsy guard)', p);
}

// 19. Out-of-range fallback (200) → clamped to 28-day default
// `!200` is false → the early-return guard doesn't fire, then clampCycle(200)
// returns undefined and the `?? 28` fallback kicks in. The behavior is "use a
// safe default rather than propagate absurd input"; assert the default lands.
{
  const p = predict('combined_hormonal', [], { fallbackCycleLength: 200 });
  assertNotNull('predict: pill + fallback=200 + no periods → prediction (clamped to 28)', p);
  // Cycle length used = 28 → next period 28 days from now (2026-05-17) = 2026-06-14
  assertEq('predict: fallback=200 clamps to 28d', p?.nextPeriodDate, '2026-06-14');
  assertEq('predict: low confidence on no-history fallback', p?.confidence, 'low');
}

// ─── phaseForDate ───────────────────────────────────────────────────────────

const prediction = predict('none', [
  period('2026-04-03'),
  period('2026-05-01'),
]);

// 20. day 3 of period → menstrual
assertEq('phase: day 3 (period day) → menstrual',
  phaseForDate('2026-05-03', prediction, '2026-05-01', 5), 'menstrual');

// 21. day 14 (ovulation) → ovulatory
assertEq('phase: day 14 (ovulation day) → ovulatory',
  phaseForDate('2026-05-15', prediction, '2026-05-01', 5), 'ovulatory');

// 22. day 20 → luteal
assertEq('phase: day 20 → luteal',
  phaseForDate('2026-05-21', prediction, '2026-05-01', 5), 'luteal');

// 23. day 10 (mid follicular) → follicular
assertEq('phase: day 10 → follicular',
  phaseForDate('2026-05-11', prediction, '2026-05-01', 5), 'follicular');

// 24. no prediction → unknown
assertEq('phase: null prediction → unknown',
  phaseForDate('2026-05-15', null, '2026-05-01', 5), 'unknown');

// 25. continuous mode → unknown
{
  const iudPrediction = predict('hormonal_iud', [period('2026-04-01')]);
  assertEq('phase: IUD/continuous → unknown',
    phaseForDate('2026-05-15', iudPrediction, '2026-05-01', 5), 'unknown');
}

// 26. day 0 (before start) → unknown
assertEq('phase: date before period start → unknown',
  phaseForDate('2026-04-25', prediction, '2026-05-01', 5), 'unknown');

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Cycle predictor harness —');
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

console.log('\n✓ All cycle predictor checks passed.\n');
process.exit(0);
