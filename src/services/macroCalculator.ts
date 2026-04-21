/**
 * Macro calculator — computes daily calorie and macro targets from body
 * metrics + activity level + goal + (optionally) active peptides.
 *
 * Formulas:
 *   - BMR via Mifflin-St Jeor (industry standard, validated across populations)
 *   - TDEE = BMR × activity multiplier
 *   - Goal adjustment:
 *       weight_loss   → TDEE − 500  (≈ 1 lb / week deficit)
 *       maintenance   → TDEE
 *       body_recomp   → TDEE − 200  (slight deficit while training heavy)
 *       muscle_gain   → TDEE + 300  (lean bulk)
 *   - Protein:
 *       weight_loss   → 1.0 g / lb bodyweight   (preserve lean mass)
 *       maintenance   → 0.8 g / lb
 *       body_recomp   → 1.0 g / lb
 *       muscle_gain   → 1.0 g / lb
 *       on GLP-1 agonist → bumped to 1.0–1.2 g / lb regardless (prevents lean-mass loss)
 *   - Fat: 0.35 g / lb
 *   - Carbs: remainder of calories after protein + fat
 *
 * Results are informational only — the user should cross-check with a
 * licensed nutritionist for anything medical.
 */

import { PEPTIDES } from '../data/peptides';

export type GoalType = 'weight_loss' | 'maintenance' | 'body_recomp' | 'muscle_gain';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'very_active'
  | 'extremely_active';

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary:         1.2,
  light:             1.375,
  moderate:          1.55,
  very_active:       1.725,
  extremely_active:  1.9,
};

export interface MacroRecommendationInput {
  weightLbs: number;
  heightInches: number;
  ageYears: number;
  biologicalSex: 'male' | 'female';
  activityLevel?: ActivityLevel;
  goal?: GoalType;
  /** Active peptide IDs — can raise protein target for GLP-1 users etc. */
  activePeptides?: string[];
}

export interface MacroRecommendation {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterOz: number;
  fiberGrams: number;
  /** Short human-readable explanation of the calculation for the UI. */
  rationale: string[];
}

/** Peptide IDs that push protein target higher (GLP-1 agonists — preserve lean mass during deficit). */
const GLP1_PEPTIDE_IDS = new Set([
  'semaglutide',
  'tirzepatide',
  'retatrutide',
  'liraglutide',
  'cagrilintide',
]);

/** Peptide IDs that imply a caloric-deficit context even if the user didn't say "weight loss". */
const CUTTING_PEPTIDE_IDS = new Set([
  'semaglutide',
  'tirzepatide',
  'retatrutide',
  'tesofensine',
  'aod-9604',
  'aod9604',
]);

function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}
function inchesToCm(inches: number): number {
  return inches * 2.54;
}

/**
 * Mifflin-St Jeor BMR.
 * Male:   10 * kg + 6.25 * cm − 5 * age + 5
 * Female: 10 * kg + 6.25 * cm − 5 * age − 161
 */
export function calcBMR(input: {
  weightLbs: number;
  heightInches: number;
  ageYears: number;
  biologicalSex: 'male' | 'female';
}): number {
  const kg = lbsToKg(input.weightLbs);
  const cm = inchesToCm(input.heightInches);
  const base = 10 * kg + 6.25 * cm - 5 * input.ageYears;
  return Math.round(input.biologicalSex === 'male' ? base + 5 : base - 161);
}

export function calcTDEE(bmr: number, activity: ActivityLevel = 'moderate'): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activity]);
}

export function computeMacroRecommendation(input: MacroRecommendationInput): MacroRecommendation {
  const rationale: string[] = [];

  const bmr = calcBMR(input);
  rationale.push(`BMR (Mifflin-St Jeor): ${bmr} cal`);

  const activity = input.activityLevel ?? 'moderate';
  const tdee = calcTDEE(bmr, activity);
  rationale.push(`TDEE at "${activity}" activity: ${tdee} cal`);

  // Goal calorie adjustment
  const goal = input.goal ?? 'maintenance';
  let calories = tdee;
  if (goal === 'weight_loss') {
    calories = tdee - 500;
    rationale.push(`Weight-loss deficit: ${tdee} − 500 = ${calories}`);
  } else if (goal === 'body_recomp') {
    calories = tdee - 200;
    rationale.push(`Recomp slight deficit: ${tdee} − 200 = ${calories}`);
  } else if (goal === 'muscle_gain') {
    calories = tdee + 300;
    rationale.push(`Muscle-gain surplus: ${tdee} + 300 = ${calories}`);
  } else {
    rationale.push(`Maintenance: ${tdee} cal`);
  }

  // Peptide context — GLP-1 agonists mean caloric-deficit lifestyle + lean-mass preservation
  const activePeptides = (input.activePeptides ?? []).map((p) => p.toLowerCase());
  const onGlp1 = activePeptides.some((p) => GLP1_PEPTIDE_IDS.has(p));
  const onCuttingPep = activePeptides.some((p) => CUTTING_PEPTIDE_IDS.has(p));

  // Protein: base by goal, bumped if on GLP-1 / cutting peptide
  let proteinPerLb = 0.8;
  if (goal === 'weight_loss' || goal === 'body_recomp' || goal === 'muscle_gain') {
    proteinPerLb = 1.0;
  }
  if (onGlp1 || (onCuttingPep && goal !== 'muscle_gain')) {
    proteinPerLb = Math.max(proteinPerLb, 1.1);
    const peptideName =
      activePeptides.find((p) => GLP1_PEPTIDE_IDS.has(p))
      ?? activePeptides.find((p) => CUTTING_PEPTIDE_IDS.has(p))
      ?? 'your peptide';
    rationale.push(
      `Protein bumped to ${proteinPerLb} g/lb because you're on ${peptideName} (preserves lean mass during deficit)`,
    );
  } else {
    rationale.push(`Protein target: ${proteinPerLb} g/lb`);
  }
  const proteinGrams = Math.round(input.weightLbs * proteinPerLb);

  // Fat: 0.35 g/lb
  const fatGrams = Math.round(input.weightLbs * 0.35);
  rationale.push(`Fat: 0.35 g/lb = ${fatGrams} g`);

  // Carbs: remainder of calories
  const proteinCals = proteinGrams * 4;
  const fatCals = fatGrams * 9;
  const carbsCals = Math.max(0, calories - proteinCals - fatCals);
  const carbsGrams = Math.round(carbsCals / 4);
  rationale.push(`Carbs: remainder = ${carbsGrams} g`);

  // Water: half body weight in oz (common recommendation); bumped for GLP-1 users
  const waterOz = Math.round(input.weightLbs * (onGlp1 ? 0.65 : 0.5));
  if (onGlp1) {
    rationale.push(`Water: ${waterOz} oz (GLP-1 users often under-hydrate)`);
  } else {
    rationale.push(`Water: ${waterOz} oz`);
  }

  // Fiber: 14 g per 1000 cal
  const fiberGrams = Math.round((calories / 1000) * 14);

  return {
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    waterOz,
    fiberGrams,
    rationale,
  };
}

/**
 * Convenience for pulling the peptide display names for the rationale line.
 */
export function peptideNameById(id: string): string {
  const p = PEPTIDES.find((x) => x.id.toLowerCase() === id.toLowerCase());
  return p?.name ?? id;
}
