/**
 * Dose & reconstitution calculator — pure math, no UI.
 *
 * Shared by:
 *   - app/calculators/reconstitution.tsx (legacy standalone page)
 *   - app/(tabs)/my-stacks.tsx → Calculator sub-tab
 *
 * All calculations are educational only. NOT medical advice.
 */

export type SyringeType = 'U-100' | 'U-40';

export interface ReconstitutionInput {
  /** Peptide mass in the vial (mg) */
  vialMg: number;
  /** Bacteriostatic water added to the vial (ml) */
  bacWaterMl: number;
  /** Target dose per injection (mcg) */
  desiredDoseMcg: number;
  /** Insulin syringe type — affects unit readout */
  syringe?: SyringeType;
}

export interface ReconstitutionOutput {
  /** Concentration in mg per ml */
  concentrationMgPerMl: number;
  /** Concentration in mcg per 0.1 ml (1 syringe "tick" on a U-100) */
  concentrationMcgPerTick: number;
  /** Volume to inject per dose (ml) */
  volumePerDoseMl: number;
  /** Units to draw on the chosen syringe type */
  syringeUnits: number;
  /** Doses the vial provides at the desired dose */
  dosesPerVial: number;
  /** Ticks to draw on a U-100 (100 ticks = 1 ml) — for the visual fill graphic */
  ticksU100: number;
}

/**
 * Core reconstitution math. Given vial strength + BAC water + desired dose,
 * compute everything the user needs to know.
 */
export function calculateReconstitution(input: ReconstitutionInput): ReconstitutionOutput {
  const { vialMg, bacWaterMl, desiredDoseMcg, syringe = 'U-100' } = input;

  // Guard against divide-by-zero — return zeros but don't throw
  if (vialMg <= 0 || bacWaterMl <= 0 || desiredDoseMcg <= 0) {
    return {
      concentrationMgPerMl: 0,
      concentrationMcgPerTick: 0,
      volumePerDoseMl: 0,
      syringeUnits: 0,
      dosesPerVial: 0,
      ticksU100: 0,
    };
  }

  const vialMcg = vialMg * 1000;
  const concentrationMgPerMl = vialMg / bacWaterMl;
  const concentrationMcgPerTick = vialMcg / (bacWaterMl * 10); // 1 tick = 0.1 ml on U-100

  const volumePerDoseMl = desiredDoseMcg / (concentrationMgPerMl * 1000);
  const ticksU100 = desiredDoseMcg / concentrationMcgPerTick;

  // Unit conversion depends on syringe type:
  //   U-100: 100 units = 1 ml
  //   U-40 : 40 units = 1 ml
  const unitsPerMl = syringe === 'U-40' ? 40 : 100;
  const syringeUnits = volumePerDoseMl * unitsPerMl;

  const dosesPerVial = Math.floor(vialMcg / desiredDoseMcg);

  return {
    concentrationMgPerMl: round(concentrationMgPerMl, 3),
    concentrationMcgPerTick: round(concentrationMcgPerTick, 2),
    volumePerDoseMl: round(volumePerDoseMl, 3),
    syringeUnits: round(syringeUnits, 1),
    dosesPerVial,
    ticksU100: round(ticksU100, 1),
  };
}

/**
 * Reverse calculation — given a vial strength and desired dose, suggest a
 * BAC water volume that results in a "round" unit count (easy to draw
 * accurately on a U-100 insulin syringe).
 *
 * Prefers unit counts that end in 5 or 0 between 10-50 units.
 */
export function suggestBacWaterForRoundUnits(
  vialMg: number,
  desiredDoseMcg: number,
  syringe: SyringeType = 'U-100',
): number {
  if (vialMg <= 0 || desiredDoseMcg <= 0) return 0;

  // Candidate target unit counts: 10, 15, 20, 25, 30, 40, 50
  const candidates = [10, 15, 20, 25, 30, 40, 50];
  const unitsPerMl = syringe === 'U-40' ? 40 : 100;

  // For each candidate unit count, solve: bacMl = (desiredDose × unitsPerMl × bacMl) / (vialMg × 1000)
  // Rearranging: bacMl = (targetUnits × vialMg × 1000) / (desiredDose × unitsPerMl × 1000) × (unitsPerMl)
  // Simpler: desired volume = targetUnits / unitsPerMl ml, and we need vialMcg / (bacMl × unitsPerMl) = desired_per_unit
  // → bacMl = (targetUnits × vialMg × 1000) / (desiredDose × unitsPerMl)
  let bestBac = 2; // fallback
  let bestDiff = Infinity;

  for (const targetUnits of candidates) {
    const bacMl = (targetUnits * vialMg * 1000) / (desiredDoseMcg * unitsPerMl);
    // Prefer BAC volumes between 1 and 5 ml (practical)
    if (bacMl < 0.5 || bacMl > 5) continue;
    // Round BAC to nearest 0.5 ml (easier to measure)
    const roundedBac = Math.round(bacMl * 2) / 2;
    const diff = Math.abs(bacMl - roundedBac);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBac = roundedBac;
    }
  }

  return bestBac;
}

/**
 * Format a dose in the most readable unit (mg if ≥1mg, otherwise mcg).
 */
export function formatDose(mcg: number): string {
  if (mcg >= 1000) return `${(mcg / 1000).toFixed(2).replace(/\.?0+$/, '')} mg`;
  return `${Math.round(mcg)} mcg`;
}

/**
 * Format a volume in ml with 2-3 significant figures.
 */
export function formatVolume(ml: number): string {
  if (ml >= 1) return `${ml.toFixed(2)} ml`;
  return `${ml.toFixed(3)} ml`;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
