/**
 * TDEE & Macro Calculator — Mifflin-St Jeor equation.
 *
 * Same formula MyFitnessPal, Cronometer, and most fitness apps use.
 * Takes user stats from onboarding → outputs personalized daily targets.
 */

import type { Gender, AgeRange, ActivityLevel, GoalType } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MacroResult {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterOz: number;
}

interface CalcInput {
  weightLbs?: number;
  heightInches?: number;
  gender?: Gender | null;
  ageRange?: AgeRange | null;
  activityLevel?: ActivityLevel | null;
  goals?: GoalType[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert age range to a midpoint age for the formula */
function ageFromRange(range: AgeRange | null | undefined): number {
  switch (range) {
    case '18-29': return 24;
    case '30-44': return 37;
    case '45-60': return 52;
    case '60+':   return 65;
    default:      return 30;
  }
}

/** Activity level multiplier (standard TDEE multipliers) */
function activityMultiplier(level: ActivityLevel | null | undefined): number {
  switch (level) {
    case 'sedentary':   return 1.2;
    case 'light':       return 1.375;
    case 'moderate':    return 1.55;
    case 'active':      return 1.725;
    case 'very_active': return 1.9;
    default:            return 1.55; // moderate default
  }
}

/** Goal-based calorie adjustment */
function goalAdjustment(goals: GoalType[]): number {
  if (goals.includes('weight_loss')) return -500; // 1 lb/week deficit
  if (goals.includes('muscle_gain')) return +300;  // lean bulk surplus
  if (goals.includes('body_recomp')) return -200;  // slight deficit
  return 0; // maintenance
}

/** Goal-based protein multiplier (g per lb of body weight) */
function proteinMultiplier(goals: GoalType[]): number {
  if (goals.includes('muscle_gain')) return 1.0;    // 1g per lb
  if (goals.includes('body_recomp')) return 1.0;
  if (goals.includes('weight_loss')) return 0.9;    // high protein to preserve muscle
  if (goals.includes('recovery')) return 0.9;
  return 0.8; // general wellness
}

// ---------------------------------------------------------------------------
// Main Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate personalized daily macro targets using Mifflin-St Jeor.
 *
 * BMR (Male)   = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 5
 * BMR (Female) = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
 * TDEE = BMR × activity multiplier
 * Daily calories = TDEE + goal adjustment
 */
export function calculateMacros(input: CalcInput): MacroResult | null {
  const { weightLbs, heightInches, gender, ageRange, activityLevel, goals } = input;

  // Need at minimum weight to calculate — everything else has defaults
  if (!weightLbs || weightLbs <= 0) return null;

  // Convert to metric
  const weightKg = weightLbs * 0.453592;
  const heightCm = (heightInches ?? 67) * 2.54; // default 5'7" if no height
  const age = ageFromRange(ageRange);

  // Mifflin-St Jeor BMR
  let bmr: number;
  if (gender === 'Male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    // Female or unknown — female formula is more conservative
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  // TDEE
  const tdee = bmr * activityMultiplier(activityLevel);

  // Goal adjustment
  const userGoals = goals ?? [];
  const dailyCalories = Math.round(Math.max(1200, tdee + goalAdjustment(userGoals)));

  // Protein (based on body weight and goal)
  const proteinG = Math.round(weightLbs * proteinMultiplier(userGoals));

  // Fat (25-30% of calories, use 27.5% as default)
  const fatCalories = dailyCalories * 0.275;
  const fatG = Math.round(fatCalories / 9);

  // Carbs (remaining calories after protein + fat)
  const proteinCalories = proteinG * 4;
  const carbCalories = Math.max(0, dailyCalories - proteinCalories - fatCalories);
  const carbG = Math.round(carbCalories / 4);

  // Fiber (14g per 1000 cal is the standard recommendation)
  const fiberG = Math.round((dailyCalories / 1000) * 14);

  // Water (general: 0.5 oz per lb of body weight, capped at 128 oz)
  const waterOz = Math.round(Math.min(128, weightLbs * 0.5));

  return {
    calories: dailyCalories,
    proteinGrams: proteinG,
    carbsGrams: carbG,
    fatGrams: fatG,
    fiberGrams: fiberG,
    waterOz,
  };
}
