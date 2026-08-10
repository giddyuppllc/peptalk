/**
 * doseUnits — PURE dose-unit normalisation and formatting.
 *
 * WHY THIS EXISTS
 * `intensityToDoseRangeMcg` converted only 'mg' (×1000) and passed everything
 * else through AS IF IT WERE ALREADY MCG:
 *
 *     const minMcg = unit === 'mg' ? min * 1000 : min;
 *
 * Cerebrolysin's protocol is `{ min: 5, max: 30, unit: 'ml' }`, so the Cycle
 * plan rendered "5 mcg–30 mcg" and a total of "70 mcg–840 mcg" — off by a
 * factor that isn't even definable, because millilitres are a VOLUME and mcg is
 * a MASS. Jamie caught it on Cerebrolysin; three more were wrong and unreported:
 * hcg (250–1500 IU), oxytocin (10–40 IU), hmg (75–300 IU). hCG and hMG are
 * fertility compounds, so a silent unit swap there is not cosmetic.
 *
 * THE RULE
 * mcg and mg are the same physical quantity, so they interconvert freely and
 * mass-based maths (total dose over a cycle, vials needed from a mcg/vial
 * concentration) is meaningful. IU is an ACTIVITY unit and ml is a VOLUME:
 * neither converts to a mass without a compound-specific potency or
 * concentration that this dataset does not carry. So we never invent one —
 * we keep the author's number in the author's unit and mark it non-mass, and
 * callers that need a mass (vial counts) simply decline to answer.
 */

export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'ml';

/** True when a dose in this unit is a mass and can be expressed in mcg. */
export function isMassUnit(unit: DoseUnit): boolean {
  return unit === 'mcg' || unit === 'mg';
}

export interface DoseRange {
  min: number;
  max: number;
  /** The unit `min`/`max` are actually expressed in. */
  unit: DoseUnit;
  /**
   * True when min/max are a mass in MCG. Mass-only maths (vials from a
   * mcg/vial concentration) must check this before running.
   */
  massBased: boolean;
}

/**
 * Put a protocol's dose range into a single canonical form: mass units become
 * mcg; IU and ml are preserved exactly as authored.
 */
export function normalizeDoseRange(min: number, max: number, unit: DoseUnit): DoseRange {
  if (unit === 'mg') {
    return { min: min * 1000, max: max * 1000, unit: 'mcg', massBased: true };
  }
  if (unit === 'mcg') {
    return { min, max, unit: 'mcg', massBased: true };
  }
  // IU / ml — no mass conversion exists. Keep the author's numbers.
  return { min, max, unit, massBased: false };
}

/** Trim a float for display without implying precision the data lacks. */
function trim(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/**
 * THE canonical mass rendering. Every dose the app shows should come through
 * here.
 *
 * Edward: "the units were like mcg and weird shit — we just wanted increments
 * people would actually know", and separately: "instead of working them out, a
 * weird rule is made that fixes the minor issue once."
 *
 * Both complaints have the same cause. Four functions rendered a dose and no
 * two agreed — 1000 mcg came out as "1.00 mg" here, "1 mg" in doseCalculator
 * and "1000 mcg" in calculatorV2, and 60 mg of NAD+ rendered as "60000 mcg" on
 * the calculator. Each was locally reasonable and there was no one place to fix
 * it, so every complaint produced another local rule.
 *
 * TWO DECISIONS, stated rather than buried:
 *
 *  1. Roll up to mg at 1000 mcg. Nobody reads "60000 mcg". This is what
 *     TitrationScheduleCard already did, with a comment saying exactly that,
 *     and it is the behaviour Edward has asked for twice.
 *  2. Trim trailing zeros. "1.00 mg" claims a hundredth-of-a-milligram
 *     precision the source data does not have; "1 mg" is the increment people
 *     actually use. Capped at 2dp so 1.25 mg survives.
 */
export function formatMassMcg(mcg: number): string {
  if (!Number.isFinite(mcg)) return '';
  if (Math.abs(mcg) >= 1000) return `${trim(mcg / 1000)} mg`;
  return `${Math.round(mcg)} mcg`;
}

/**
 * Format one amount. Mass amounts roll up to mg past 1000 mcg. IU and ml render
 * in their own unit — neither converts to a mass without a compound-specific
 * potency or concentration this dataset does not carry.
 */
export function formatDoseAmount(value: number, unit: DoseUnit): string {
  if (unit === 'mcg') return formatMassMcg(value);
  if (unit === 'mg') return `${trim(value)} mg`;
  return `${trim(value)} ${unit}`;
}

/** Format a range, collapsing to a single amount when both ends match. */
export function formatDoseRange(range: DoseRange): string {
  if (range.min === range.max) return formatDoseAmount(range.min, range.unit);
  return `${formatDoseAmount(range.min, range.unit)}–${formatDoseAmount(range.max, range.unit)}`;
}
