/**
 * Canonical peptide dosing math — Master Refactor Plan v3.1 §14.
 *
 * Pure functions. All inputs in mg + mL; UI converts to mcg / units at
 * the render layer via formatDose() + the U-100 syringe component.
 *
 * Reference formulas (§14):
 *   concentration_mg_per_ml = peptide_mg_in_vial / diluent_volume_ml
 *   draw_per_shot_ml        = per_shot_dose_mg / concentration_mg_per_ml
 *   doses_per_vial          = peptide_mg_in_vial / per_shot_dose_mg
 *
 * Validation (§14.1):
 *   diluent_volume_ml <= vial_size_ml         — hard clamp on UI input
 *   draw_per_shot_ml  <= 1.0                  — U-100 cap → split-injection nudge
 *   diluent_ml deviates from recommendation   — warn but allow
 *   per_shot_dose outside protocol range      — warn but allow
 */

export interface CalculatorInput {
  /** Manufacturer-stated mg in the vial (user-editable, pre-filled). */
  peptideMgInVial: number;
  /** Volume of diluent added (user-editable, clamped to vialSizeMl). */
  diluentVolumeMl: number;
  /** Physical vial — one of the three first-class sizes (§8.1). */
  vialSizeMl: 3 | 5 | 10;
  /** Per-shot dose in mg. */
  perShotDoseMg: number;
  /** Optional recommended reconstitution from the dosing reference. */
  recommendedReconstitutionMl?: number;
  /** Optional protocol range — used to flag deviation. */
  protocolRangeMg?: { min: number; max: number };
}

export type CalculatorWarning =
  | { kind: 'diluent_exceeds_vial'; vialSizeMl: number; diluentMl: number }
  | { kind: 'draw_exceeds_u100'; drawMl: number; suggestedSplit: number }
  | {
      kind: 'diluent_deviates_from_recommendation';
      recommendedMl: number;
      gotMl: number;
    }
  | {
      kind: 'dose_outside_protocol_range';
      minMg: number;
      maxMg: number;
      gotMg: number;
    };

export interface CalculatorResult {
  /** Concentration of reconstituted vial (mg/mL). */
  concentrationMgPerMl: number;
  /** Volume drawn per shot (mL). */
  drawPerShotMl: number;
  /** Equivalent U-100 syringe units per shot. */
  drawPerShotUnits: number;
  /** Number of per-shot doses one vial yields. */
  dosesPerVial: number;
  /** Non-blocking flags surfaced as inline UI warnings. */
  warnings: CalculatorWarning[];
  /**
   * Blocking failures — calculator outputs are not safe to act on. The
   * "Add to calendar" CTA must be disabled until these are cleared.
   */
  hardFailures: CalculatorWarning[];
}

/** U-100 insulin syringe — 1 mL = 100 units, 1 unit = 0.01 mL. */
export const U100_UNITS_PER_ML = 100;

export function calculate(input: CalculatorInput): CalculatorResult {
  const {
    peptideMgInVial,
    diluentVolumeMl,
    vialSizeMl,
    perShotDoseMg,
    recommendedReconstitutionMl,
    protocolRangeMg,
  } = input;

  const warnings: CalculatorWarning[] = [];
  const hardFailures: CalculatorWarning[] = [];

  // §14.1 hard predicate — UI also clamps the slider but defense in depth.
  if (diluentVolumeMl > vialSizeMl) {
    hardFailures.push({
      kind: 'diluent_exceeds_vial',
      vialSizeMl,
      diluentMl: diluentVolumeMl,
    });
  }

  // Guard against div-by-zero so a half-typed input doesn't render NaN.
  const safeDiluent = diluentVolumeMl > 0 ? diluentVolumeMl : 1;
  const concentrationMgPerMl = peptideMgInVial / safeDiluent;
  const drawPerShotMl =
    concentrationMgPerMl > 0 ? perShotDoseMg / concentrationMgPerMl : 0;
  const drawPerShotUnits = drawPerShotMl * U100_UNITS_PER_ML;
  const dosesPerVial =
    perShotDoseMg > 0 ? peptideMgInVial / perShotDoseMg : 0;

  if (drawPerShotMl > 1.0) {
    warnings.push({
      kind: 'draw_exceeds_u100',
      drawMl: drawPerShotMl,
      suggestedSplit: Math.ceil(drawPerShotMl),
    });
  }

  if (
    recommendedReconstitutionMl != null &&
    Math.abs(diluentVolumeMl - recommendedReconstitutionMl) > 0.05
  ) {
    warnings.push({
      kind: 'diluent_deviates_from_recommendation',
      recommendedMl: recommendedReconstitutionMl,
      gotMl: diluentVolumeMl,
    });
  }

  if (protocolRangeMg) {
    const { min, max } = protocolRangeMg;
    if (perShotDoseMg < min || perShotDoseMg > max) {
      warnings.push({
        kind: 'dose_outside_protocol_range',
        minMg: min,
        maxMg: max,
        gotMg: perShotDoseMg,
      });
    }
  }

  return {
    concentrationMgPerMl,
    drawPerShotMl,
    drawPerShotUnits,
    dosesPerVial,
    warnings,
    hardFailures,
  };
}

/** §8.6 display-unit conversion. */
export function formatDose(mg: number, displayUnit: 'mg' | 'mcg'): string {
  if (displayUnit === 'mcg') {
    return `${Math.round(mg * 1000)} mcg`;
  }
  const decimals = mg >= 10 ? 1 : 2;
  return `${mg.toFixed(decimals)} mg`;
}

/** Convert from the chosen display unit back to mg for storage. */
export function parseDoseToMg(
  value: number,
  displayUnit: 'mg' | 'mcg',
): number {
  return displayUnit === 'mcg' ? value / 1000 : value;
}

export function formatVolumeMl(ml: number): string {
  return `${ml.toFixed(2)} mL`;
}

export function formatUnits(units: number): string {
  return `${units.toFixed(1)} units`;
}
