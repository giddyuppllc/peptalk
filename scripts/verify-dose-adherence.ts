/**
 * Verification harness for src/utils/doseAdherence.ts.
 *
 * Drives the Peptides-tab AdherenceDial + the Home dashboard adherence
 * card. A wrong number here either falsely flatters the user ("99%
 * adherence!" when they missed half their doses) or punishes them
 * unfairly. Six failure modes silently produce wrong percentages:
 *   - cycleLength regex misparse
 *   - daysElapsed sign flip
 *   - expectedDoses Math.max-with-1 distortion on new users
 *   - tie-break sort
 *   - frequency switch coverage
 *   - cycle window string-vs-Date filter
 *
 * Run:
 *   npm run verify:adherence
 *
 * Exits 0 on pass, 1 on any failure.
 */

import {
  dosesPerWeekFor,
  resolveActiveCycle,
  doseLoggedAt,
} from '../src/utils/doseAdherence';
import type { ActiveProtocol, DoseLogEntry } from '../src/types';

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

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function isoDaysAgo(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function dose(peptideId: string, daysAgo: number, time = '09:00'): DoseLogEntry {
  const date = isoDaysAgo(daysAgo);
  return {
    id: `d-${peptideId}-${daysAgo}-${Math.random().toString(36).slice(2, 6)}`,
    peptideId,
    date,
    time,
    amount: 250,
    unit: 'mcg' as any,
    route: 'subcutaneous' as any,
    createdAt: new Date().toISOString(),
  };
}

function protocol(
  peptideId: string,
  frequency: ActiveProtocol['frequency'],
  startDaysAgo: number,
  isActive = true,
): ActiveProtocol {
  return {
    id: `proto-${peptideId}-${startDaysAgo}`,
    peptideId,
    dose: 250,
    unit: 'mcg' as any,
    route: 'subcutaneous' as any,
    frequency,
    startDate: isoDaysAgo(startDaysAgo),
    isActive,
    createdAt: new Date().toISOString(),
  };
}

// ─── dosesPerWeekFor — every branch ──────────────────────────────────────────

assertEq('dpw: twice_daily = 14', dosesPerWeekFor('twice_daily'), 14);
assertEq('dpw: daily = 7', dosesPerWeekFor('daily'), 7);
assertEq('dpw: eod = 3.5', dosesPerWeekFor('eod'), 3.5);
assertEq('dpw: tiw = 3', dosesPerWeekFor('tiw'), 3);
assertEq('dpw: biw = 2', dosesPerWeekFor('biw'), 2);
assertEq('dpw: weekly = 1', dosesPerWeekFor('weekly'), 1);
assertEq('dpw: biweekly = 0.5', dosesPerWeekFor('biweekly'), 0.5);
assertEq('dpw: monthly = 0.25', dosesPerWeekFor('monthly'), 0.25);
assertEq('dpw: custom = 7', dosesPerWeekFor('custom'), 7);
// Falls through to default of 7 if frequency string is unknown.
assertEq('dpw: unknown → 7', dosesPerWeekFor('garbage' as any), 7);

// ─── resolveActiveCycle ──────────────────────────────────────────────────────

// 1. No active protocols → null
assertNull('resolve: no protocols → null', resolveActiveCycle([], []));

// 2. Inactive protocols only → null
assertNull('resolve: only inactive → null',
  resolveActiveCycle([protocol('bpc-157', 'daily', 7, false)], []));

// 3. One daily protocol, 7 doses in 7 days → 100% adherence
{
  const p = protocol('bpc-157', 'daily', 6);  // started 6 days ago = day 7 today
  const doses = Array.from({ length: 7 }, (_, i) => dose('bpc-157', i));
  const r = resolveActiveCycle([p], doses);
  assertNotNull('resolve: 7 doses in 7 days — non-null', r);
  // Expected = round(daily * 7 days) = 7; logged = 7 → 100%
  assertEq('resolve: 7-for-7 daily → 100%', r?.adherencePct, 100);
}

// 4. One daily protocol, 0 doses → 0% adherence (clamped, not negative)
{
  const p = protocol('bpc-157', 'daily', 6);
  const r = resolveActiveCycle([p], []);
  assertEq('resolve: 0-for-7 → 0%', r?.adherencePct, 0);
  // expectedDoses uses Math.max(1, ...) so even on day 1 it's at least 1
  assertTrue('resolve: expectedDoses >= 1 always', (r?.expectedDoses ?? 0) >= 1);
}

// 5. Over-logged: 14 doses in 7 days for a daily → caps at 100
{
  const p = protocol('bpc-157', 'daily', 6);
  const doses = [
    ...Array.from({ length: 7 }, (_, i) => dose('bpc-157', i, '08:00')),
    ...Array.from({ length: 7 }, (_, i) => dose('bpc-157', i, '20:00')),
  ];
  const r = resolveActiveCycle([p], doses);
  assertEq('resolve: 14-for-7 daily → capped 100%', r?.adherencePct, 100);
}

// 6. EOD protocol, 4 doses in 7 days → ~100% (expected = round(7*3.5/7) = 4)
{
  const p = protocol('bpc-157', 'eod', 6);
  const doses = [
    dose('bpc-157', 0), dose('bpc-157', 2),
    dose('bpc-157', 4), dose('bpc-157', 6),
  ];
  const r = resolveActiveCycle([p], doses);
  assertEq('resolve: EOD 4-in-7 → 100%', r?.adherencePct, 100);
}

// 7. Same EOD protocol, only 1 dose → ~25%
{
  const p = protocol('bpc-157', 'eod', 6);
  const doses = [dose('bpc-157', 0)];
  const r = resolveActiveCycle([p], doses);
  // expected = 4, logged = 1 → 25%
  assertEq('resolve: EOD 1-in-7 → 25%', r?.adherencePct, 25);
}

// 8. Doses for a DIFFERENT peptide ignored
{
  const p = protocol('bpc-157', 'daily', 6);
  const otherDoses = Array.from({ length: 7 }, (_, i) => dose('tb-500', i));
  const r = resolveActiveCycle([p], otherDoses);
  assertEq('resolve: doses for wrong peptide filtered', r?.adherencePct, 0);
}

// 9. Doses BEFORE cycle start excluded
{
  const p = protocol('bpc-157', 'daily', 6);
  // Logged 8 days ago = before cycle start (which was 6 days ago)
  const oldDoses = [dose('bpc-157', 8), dose('bpc-157', 10)];
  const r = resolveActiveCycle([p], oldDoses);
  assertEq('resolve: pre-cycle doses excluded', r?.adherencePct, 0);
}

// 10. Tie-break: two active protocols with same startDate → highest adherence wins
{
  const a = protocol('bpc-157', 'daily', 3);
  const b = protocol('tb-500', 'daily', 3);
  // bpc: 4-of-4 = 100%; tb-500: 0-of-4 = 0%
  const doses = Array.from({ length: 4 }, (_, i) => dose('bpc-157', i));
  const r = resolveActiveCycle([a, b], doses);
  assertEq('resolve: same start, higher adherence wins', r?.protocol.peptideId, 'bpc-157');
}

// 11. Tie-break: different startDates → most-recent wins regardless of adherence
{
  const older = protocol('bpc-157', 'daily', 10);
  const newer = protocol('tb-500', 'daily', 3);
  // older has 4 doses (some adherence); newer has 0
  const doses = Array.from({ length: 4 }, (_, i) => dose('bpc-157', i + 6));
  const r = resolveActiveCycle([older, newer], doses);
  assertEq('resolve: more-recent start wins over higher adherence',
    r?.protocol.peptideId, 'tb-500');
}

// 12. currentDay clamps to totalDays — past-cycle protocols don't overflow
{
  const p = protocol('bpc-157', 'daily', 999);  // started "forever" ago
  const r = resolveActiveCycle([p], []);
  assertNotNull('resolve: ancient cycle — non-null', r);
  assertTrue('resolve: currentDay <= totalDays',
    (r?.currentDay ?? 0) <= (r?.totalDays ?? 0),
    { currentDay: r?.currentDay, totalDays: r?.totalDays });
}

// 13. Cycle totalDays default to 28 if no template + no dosing reference
{
  // Use a peptide ID that has neither template nor dosing reference
  const p = protocol('definitely-not-a-real-peptide-id-xyz', 'daily', 6);
  const r = resolveActiveCycle([p], []);
  assertEq('resolve: missing template → totalDays defaults to 28', r?.totalDays, 28);
}

// 14. peptideName falls back to peptideId if peptide not found
{
  const p = protocol('definitely-not-a-real-peptide-id-xyz', 'daily', 6);
  const r = resolveActiveCycle([p], []);
  assertEq('resolve: unknown peptide → name = id',
    r?.peptideName, 'definitely-not-a-real-peptide-id-xyz');
}

// ─── doseLoggedAt ───────────────────────────────────────────────────────────

// 15. date + time → uses that
{
  const d: DoseLogEntry = {
    id: 'x', peptideId: 'bpc-157', date: '2026-05-17', time: '14:30',
    amount: 250, unit: 'mcg' as any, route: 'subcutaneous' as any,
    createdAt: '2026-05-17T12:00:00.000Z',
  };
  const dt = doseLoggedAt(d);
  assertEq('logged: date+time hour', dt.getHours(), 14);
  assertEq('logged: date+time minute', dt.getMinutes(), 30);
}

// 16. Missing date but has createdAt → uses createdAt
{
  const d: DoseLogEntry = {
    id: 'x', peptideId: 'bpc-157', date: '', time: '',
    amount: 250, unit: 'mcg' as any, route: 'subcutaneous' as any,
    createdAt: '2026-05-17T12:00:00.000Z',
  };
  const dt = doseLoggedAt(d);
  assertTrue('logged: falls back to createdAt', !isNaN(dt.getTime()));
}

// 17. Missing everything → returns "now" (still a valid Date)
{
  const d = {
    id: 'x', peptideId: 'bpc-157',
    amount: 250, unit: 'mcg' as any, route: 'subcutaneous' as any,
  } as any;
  const dt = doseLoggedAt(d);
  assertTrue('logged: legacy entry returns now', !isNaN(dt.getTime()));
}

// ─── report ─────────────────────────────────────────────────────────────────

const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed);

console.log('\n— Dose adherence harness —');
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

console.log('\n✓ All dose adherence checks passed.\n');
process.exit(0);
