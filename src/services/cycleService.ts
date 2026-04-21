/**
 * Cycle phase computation.
 *
 * Given a last-period start date + typical cycle length, returns the
 * current phase and day-of-cycle. Phase boundaries follow a standard
 * 28-day model, scaled proportionally for shorter/longer cycles.
 *
 *  Menstrual  : days 1 → periodLength (default 5)
 *  Follicular : periodLength+1 → mid-cycle (ovulation day)
 *  Ovulatory  : ovulation day ± 1
 *  Luteal     : rest of cycle until next period
 *
 * This is educational only — not a fertility/contraception tool.
 */

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface CyclePhaseInfo {
  phase: CyclePhase;
  dayOfCycle: number;
  cycleLength: number;
  periodLength: number;
  /** Estimated day the next period starts. */
  nextPeriodDate: string;
  /** Days until next period. */
  daysUntilNextPeriod: number;
  /** Ovulation day within the cycle (1-indexed). */
  ovulationDay: number;
  /** Short user-facing label for UI. */
  label: string;
}

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual:  'Menstrual',
  follicular: 'Follicular',
  ovulatory:  'Ovulatory',
  luteal:     'Luteal',
};

export const PHASE_BLURBS: Record<CyclePhase, string> = {
  menstrual:  'Energy can run low. Iron-rich meals + extra rest help.',
  follicular: 'Rising estrogen — often peak training response and energy.',
  ovulatory:  'Estrogen peak. Strength and endurance typically highest.',
  luteal:     'Progesterone rising. Focus on steady fueling + sleep.',
};

/**
 * Compute the current cycle phase.
 * Returns null if tracking is disabled or last-period date is missing/invalid.
 */
export function computeCyclePhase(
  lastPeriodStartDate?: string,
  typicalCycleLength?: number,
  typicalPeriodLength?: number,
  now: Date = new Date(),
): CyclePhaseInfo | null {
  if (!lastPeriodStartDate) return null;
  const start = new Date(lastPeriodStartDate);
  if (isNaN(start.getTime())) return null;

  const cycleLength = Math.max(21, Math.min(45, typicalCycleLength ?? 28));
  const periodLength = Math.max(2, Math.min(10, typicalPeriodLength ?? 5));

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / msPerDay);

  // Normalize to within a single cycle — if user forgets to update, wrap.
  const dayOfCycle = ((daysSinceStart % cycleLength) + cycleLength) % cycleLength + 1;
  const ovulationDay = Math.round(cycleLength / 2); // approximate

  let phase: CyclePhase;
  if (dayOfCycle <= periodLength) {
    phase = 'menstrual';
  } else if (dayOfCycle < ovulationDay - 1) {
    phase = 'follicular';
  } else if (dayOfCycle <= ovulationDay + 1) {
    phase = 'ovulatory';
  } else {
    phase = 'luteal';
  }

  const daysUntilNextPeriod = cycleLength - dayOfCycle + 1;
  const nextPeriod = new Date(now.getTime() + daysUntilNextPeriod * msPerDay);
  const nextPeriodDate = nextPeriod.toISOString().slice(0, 10);

  const label = `${PHASE_LABELS[phase]} · day ${dayOfCycle}`;

  return {
    phase,
    dayOfCycle,
    cycleLength,
    periodLength,
    nextPeriodDate,
    daysUntilNextPeriod,
    ovulationDay,
    label,
  };
}
