/**
 * Cycle prediction engine — mode-aware.
 *
 * Routes predictions through one of six modes based on the user's
 * contraception method. Refuses to fabricate numbers for users where
 * the biological signal doesn't apply (IUDs, continuous pill, etc.);
 * returns explicit null/irregular values instead.
 *
 * Replaces the earlier `cycleService.ts` naive 28-day model. That file
 * is kept for now but new code should import from here.
 */

import type {
  PeriodEntry,
  CyclePrediction,
  CycleStats,
  PredictionMode,
  ContraceptionMethod,
} from '../types/cycle';
import { predictionModeFor } from '../types/cycle';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(iso: string): Date {
  // Parse as UTC noon to avoid TZ edge cases around date strings.
  return new Date(iso + 'T12:00:00Z');
}

function dateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dateKey(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_PER_DAY);
}

/**
 * Stats across the user's period history. Ignores in-progress periods
 * (no endDate). Requires at least one complete cycle (two starts) to
 * return meaningful numbers.
 */
export function computeCycleStats(periods: PeriodEntry[]): CycleStats | null {
  if (periods.length === 0) return null;

  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const cycleLengths: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const len = daysBetween(sorted[i - 1].startDate, sorted[i].startDate);
    if (len > 0 && len <= 90) cycleLengths.push(len);  // filter obvious outliers
  }

  if (cycleLengths.length === 0) return null;

  const periodLengths = sorted
    .filter((p) => p.endDate)
    .map((p) => daysBetween(p.startDate, p.endDate!) + 1)
    .filter((d) => d > 0 && d <= 12);

  const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;
  const avgCycleLength = Math.round(avg(cycleLengths));
  const avgPeriodLength = periodLengths.length > 0 ? Math.round(avg(periodLengths)) : 5;
  const shortest = Math.min(...cycleLengths);
  const longest = Math.max(...cycleLengths);

  // Coefficient of variation — higher = more irregular
  const mean = avg(cycleLengths);
  const variance = avg(cycleLengths.map((n) => (n - mean) ** 2));
  const stdDev = Math.sqrt(variance);
  const irregularityScore = mean > 0 ? Math.round((stdDev / mean) * 1000) / 10 : 0;

  return {
    avgCycleLength,
    avgPeriodLength,
    shortestCycle: shortest,
    longestCycle: longest,
    irregularityScore,
    cycleCount: cycleLengths.length,
  };
}

/**
 * Confidence tiering:
 *   - high:   6+ cycles logged, irregularity <15%, mode is cyclical
 *   - medium: 3-5 cycles OR cyclical with irregularity 15-30%
 *   - low:    <3 cycles, irregularity >30%, or non-cyclical mode
 */
function computeConfidence(
  stats: CycleStats | null,
  mode: PredictionMode,
): { confidence: 'low' | 'medium' | 'high'; reason?: string } {
  if (mode !== 'cyclical') {
    return {
      confidence: 'low',
      reason: 'Contraception method affects cycle regularity — predictions are estimates only.',
    };
  }
  if (!stats) {
    return { confidence: 'low', reason: 'Not enough cycle history logged yet.' };
  }
  if (stats.cycleCount < 3) {
    return { confidence: 'low', reason: `Only ${stats.cycleCount} cycle${stats.cycleCount === 1 ? '' : 's'} logged — predictions improve with history.` };
  }
  if (stats.irregularityScore > 30) {
    return { confidence: 'low', reason: 'Your cycle length varies significantly — predictions may be off by several days.' };
  }
  if (stats.cycleCount < 6 || stats.irregularityScore > 15) {
    return { confidence: 'medium' };
  }
  return { confidence: 'high' };
}

/**
 * Primary prediction entry point. Returns null if we genuinely can't
 * predict for this user's mode/data combination (e.g. continuous-mode
 * users with no bleeding history).
 */
export function computeCyclePrediction(input: {
  method: ContraceptionMethod;
  periods: PeriodEntry[];
  /** User-stated cycle length if not enough history exists yet. */
  fallbackCycleLength?: number;
  /** User-stated period length if history too thin. */
  fallbackPeriodLength?: number;
  /** Reference "today" — injectable for testing. */
  now?: Date;
}): CyclePrediction | null {
  const mode = predictionModeFor(input.method);
  const now = input.now ?? new Date();
  const todayKey = dateKey(now);

  // Continuous / irregular / returning / pregnancy modes — no standard prediction
  if (mode === 'continuous' || mode === 'irregular' || mode === 'returning' || mode === 'pregnancy') {
    return null;
  }

  // Need at least one period event to predict from
  const sorted = [...input.periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const lastPeriod = sorted[0];

  const stats = computeCycleStats(input.periods);
  // Clamp fallbacks — defend against 0 / negative / absurd user input propagating
  // through addDays() and division-by-zero in phase math.
  const clampCycle = (n: number | undefined) =>
    typeof n === 'number' && n >= 21 && n <= 60 ? Math.round(n) : undefined;
  const cycleLength =
    stats?.avgCycleLength ?? clampCycle(input.fallbackCycleLength) ?? 28;

  if (!lastPeriod) {
    // No period logged yet — predict based only on fallback inputs
    if (!input.fallbackCycleLength) return null;
    const ovulationDate = addDays(todayKey, Math.round(cycleLength / 2));
    return {
      nextPeriodDate: addDays(todayKey, cycleLength),
      daysUntilNextPeriod: cycleLength,
      isLate: false,
      ovulationDate,
      fertileWindow: { start: addDays(ovulationDate, -5), end: ovulationDate },
      pmsWindow: { start: addDays(todayKey, cycleLength - 5), end: addDays(todayKey, cycleLength - 1) },
      confidence: 'low',
      mode,
      confidenceReason: 'No period logged yet — predictions use your self-reported cycle length.',
    };
  }

  // Scheduled cycle (combined hormonal) — 28-day pack, 7-day withdrawal bleed
  // For 1.9.0 we treat it like the 28-day cyclical case; pack-schedule customization is a follow-up.
  const nextPeriodDate = addDays(lastPeriod.startDate, cycleLength);
  const daysUntilNextPeriod = daysBetween(todayKey, nextPeriodDate);
  const isLate = daysUntilNextPeriod < 0;

  // Ovulation ≈ 14 days before next period (luteal phase is the stable one)
  const ovulationDate = addDays(nextPeriodDate, -14);
  const fertileStart = addDays(ovulationDate, -5);
  const fertileEnd = ovulationDate;
  const pmsStart = addDays(nextPeriodDate, -5);
  const pmsEnd = addDays(nextPeriodDate, -1);

  const { confidence, reason } = computeConfidence(stats, mode);

  return {
    nextPeriodDate,
    daysUntilNextPeriod,
    isLate,
    ovulationDate,
    fertileWindow: { start: fertileStart, end: fertileEnd },
    pmsWindow: { start: pmsStart, end: pmsEnd },
    confidence,
    mode,
    confidenceReason: reason,
  };
}

/**
 * Returns the cycle phase label for a given date — used by UI cards
 * that need to colorize past dates (not just "today").
 */
export function phaseForDate(
  dateKeyStr: string,
  prediction: CyclePrediction | null,
  lastPeriodStart?: string,
  periodLength: number = 5,
): 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'unknown' {
  if (!prediction || !lastPeriodStart) return 'unknown';
  if (prediction.mode !== 'cyclical' && prediction.mode !== 'scheduled_cycle') return 'unknown';

  const day = daysBetween(lastPeriodStart, dateKeyStr) + 1;
  if (day <= 0) return 'unknown';

  const ovDay = daysBetween(lastPeriodStart, prediction.ovulationDate) + 1;

  if (day <= periodLength) return 'menstrual';
  if (day < ovDay - 1) return 'follicular';
  if (day <= ovDay + 1) return 'ovulatory';
  return 'luteal';
}
