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
 * Format one amount. Mass amounts roll up to mg past 1000 mcg, matching the
 * behaviour the Cycle plan already had. IU/ml render in their own unit.
 */
export function formatDoseAmount(value: number, unit: DoseUnit): string {
  if (unit === 'mcg') {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} mg`;
    return `${Math.round(value)} mcg`;
  }
  if (unit === 'mg') return `${trim(value)} mg`;
  return `${trim(value)} ${unit}`;
}

/** Format a range, collapsing to a single amount when both ends match. */
export function formatDoseRange(range: DoseRange): string {
  if (range.min === range.max) return formatDoseAmount(range.min, range.unit);
  return `${formatDoseAmount(range.min, range.unit)}–${formatDoseAmount(range.max, range.unit)}`;
}
