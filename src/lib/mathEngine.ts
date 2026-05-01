/**
 * Reconstitution + dose math, single source of truth.
 *
 * The numbers shown on the calculator UI, the example tables on each
 * peptide guide section, and Aimee's tool-call answers all flow through
 * this file. Same formulas, same rounding, same units.
 */

export interface DoseMath {
  /** mg of peptide per mL of reconstituted solution. */
  concentration_mg_per_ml: number;
  /** mL the user draws into the syringe to deliver `dose_mg`. */
  volume_ml: number;
  /** Ticks on a U-100 (insulin) syringe; 1 unit = 0.01 mL. */
  units_u100: number;
  /** mcg per single tick (handy for "draw to 25 ticks for 250 mcg"). */
  mcg_per_unit: number;
}

/**
 * Reconstitution + draw math.
 *
 *   concentration_mg_per_ml = vial_mg / bac_water_ml
 *   volume_ml               = desired_dose_mg / concentration
 *   units_u100              = volume_ml × 100
 *   mcg_per_unit            = concentration × 10
 *
 * Example: 10 mg vial + 2 mL BAC water → 5 mg/mL.
 *   1 mg dose → 0.2 mL → 20 units. 1 unit = 50 mcg.
 */
export function calculatePeptideDose(
  vial_mg: number,
  bac_water_ml: number,
  desired_dose_mg: number,
): DoseMath {
  if (vial_mg <= 0 || bac_water_ml <= 0) {
    return { concentration_mg_per_ml: 0, volume_ml: 0, units_u100: 0, mcg_per_unit: 0 };
  }
  const concentration = vial_mg / bac_water_ml;
  const volume = desired_dose_mg > 0 ? desired_dose_mg / concentration : 0;
  return {
    concentration_mg_per_ml: concentration,
    volume_ml: volume,
    units_u100: volume * 100,
    mcg_per_unit: concentration * 10,
  };
}

/**
 * Generate a small table of common worked examples for a given vial +
 * BAC water combo. Used in the "Example Calculations" section of every
 * peptide guide so users can read straight off the table without doing
 * the math themselves.
 *
 * doses default to a sensible 4-row spread: ¼, ½, 1, 2 of the median
 * "typical" dose. Pass `customDoses` to override.
 */
export function generateDoseTable(
  vial_mg: number,
  bac_water_ml: number,
  customDoses?: number[],
): Array<{ dose_mg: number; volume_ml: number; units_u100: number }> {
  const concentration = vial_mg > 0 && bac_water_ml > 0 ? vial_mg / bac_water_ml : 0;
  if (concentration <= 0) return [];

  const doses = customDoses ?? [
    Math.max(0.25, concentration * 0.05),  // ~5% of vial concentration as smallest
    concentration * 0.1,
    concentration * 0.2,
    concentration * 0.4,
  ];

  return doses.map((dose_mg) => {
    const volume_ml = dose_mg / concentration;
    return {
      dose_mg,
      volume_ml,
      units_u100: volume_ml * 100,
    };
  });
}
