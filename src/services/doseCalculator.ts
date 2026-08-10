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
  /**
   * Concentration in mcg per TICK, where one tick is one U-100 unit = 0.01 mL.
   * Previously computed per 0.1 mL — which is ten units, not a tick — so the
   * value was 10x too large and `ticksU100` correspondingly 10x too small.
   * Unrendered at the time, but the names promised U-100 ticks, so anyone who
   * surfaced them would have shipped a tenfold dosing error.
   * app/calculators/reconstitution.tsx has always had this right.
   */
  concentrationMcgPerTick: number;
  /** Volume to inject per dose (ml) */
  volumePerDoseMl: number;
  /** Units to draw on the chosen syringe type */
  syringeUnits: number;
  /** Doses the vial provides at the desired dose */
  dosesPerVial: number;
  /** Ticks to draw on a U-100 (100 ticks = 1 ml, 1 tick = 1 unit). */
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
  // 1 tick = 1 U-100 unit = 0.01 mL, so there are 100 ticks per mL.
  const concentrationMcgPerTick = vialMcg / (bacWaterMl * 100);

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

  const unitsPerMl = syringe === 'U-40' ? 40 : 100;

  // Search the diluent volumes a person can actually measure (0.5–5 mL in half
  // millilitres) and score the DRAW each one produces, rather than solving for a
  // target unit count and hoping it lands somewhere practical.
  //
  // The previous version solved for candidate unit counts, skipped any solution
  // outside 0.5–5 mL, and — when every candidate was skipped — returned a
  // hardcoded 2. That is how a 30 mg vial with a 250 mcg dose came back as
  // "use 2 mL", producing a 1.7-unit draw: a volume nobody can measure on an
  // insulin syringe, presented with no indication anything was wrong.
  //
  // Volume scales linearly with diluent (volume = dose × bac / vialMcg), so more
  // water always means a larger, easier-to-read draw — bounded by the barrel.
  const vialMcg = vialMg * 1000;
  const IDEAL_UNITS = 25; // mid-barrel: readable, and far from both end stops

  let best: { bac: number; score: number } | null = null;

  for (let bac = 0.5; bac <= 5.0001; bac += 0.5) {
    const bacMl = Math.round(bac * 2) / 2; // guard float drift
    const units = (desiredDoseMcg * bacMl * unitsPerMl) / vialMcg;
    if (units <= 0) continue;
    // Must fit in one barrel — a suggestion that needs two injections is not a
    // suggestion, and calculatorV2 already warns separately when a dose does.
    if (units > unitsPerMl) continue;

    // Closeness to a comfortable mid-barrel draw, plus a nudge toward landing on
    // a whole graduation so the number is easy to read off the syringe.
    const fromIdeal = Math.abs(units - IDEAL_UNITS);
    const offGraduation = Math.abs(units - Math.round(units));
    // Draws under 5 units cannot be measured accurately; push them down the
    // ranking hard rather than silently recommending one.
    const tinyPenalty = units < 5 ? 100 : 0;
    const score = fromIdeal + offGraduation * 4 + tinyPenalty;

    if (!best || score < best.score) best = { bac: bacMl, score };
  }

  // Every volume overflows the barrel (a very large dose from a weak vial):
  // the least-bad answer is the smallest diluent, which gives the smallest draw.
  return best ? best.bac : 0.5;
}

// formatDose() lived here and had ZERO callers — a fourth implementation of
// "render a dose", competing with three others that all disagreed. Use
// formatMassMcg / formatDoseAmount from src/lib/doseUnits.

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
