/**
 * Centralized numeric / text input clamps for user-facing data.
 *
 * Several stores (useHealthProfileStore, useCheckinStore,
 * useDoseLogStore, useMealStore, useWorkoutStore) accept user-typed
 * inputs that flow into downstream math (BMR, dose calc, supplies
 * estimator), display layers, and the Aimee context block. Bad inputs
 * (negative weight, 5000-rep set, 50k cal meal, NaN sleep hours)
 * silently poison every consumer.
 *
 * Wave 76.10's input-validation audit found 9 stores/screens that
 * each independently re-implemented (often incompletely) the same
 * clamps. This module is the single source — every store mutator
 * should route inputs through here.
 *
 * Design notes:
 * - Each clamp returns the snapped value. Out-of-range inputs are
 *   clamped to the nearest valid edge rather than rejected, so the
 *   UI never has to surface a validation error for typos.
 * - String fields cap on length to prevent paste-bombs from blowing
 *   up the bundle or the Aimee prompt budget.
 * - Caps are deliberately wide enough for legitimate edge users
 *   (300 lb athletes, 100 g protein bowls) and tight enough to
 *   exclude obviously bad data (-100 lb, 50,000 mg protein).
 */

/** Numeric clamp with NaN guard. Returns `fallback` for non-finite. */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback = 0,
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Truncate + trim string with sane ceiling. Returns '' for non-strings. */
export function clampString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Array of strings clamp: cap array length AND per-item length. */
export function clampStringArray(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim().slice(0, maxLen))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

// ─── Canonical caps ────────────────────────────────────────────────────────

export const Clamps = {
  // ── Anthropometric ──
  /** Weight in lb. 50-1000 covers 23kg child to 450kg outlier — wide on purpose. */
  weightLbs: (v: unknown) => clampNumber(v, 50, 1000),
  /** Weight in kg. */
  weightKg: (v: unknown) => clampNumber(v, 25, 500),
  /** Body-fat %. */
  bodyFatPct: (v: unknown) => clampNumber(v, 3, 65),
  /** Height in cm. 90-260 covers toddler to NBA outlier. */
  heightCm: (v: unknown) => clampNumber(v, 90, 260),
  /** Age in years. */
  ageYears: (v: unknown) => clampNumber(v, 0, 120),
  /** Limb / circumference measurement in inches. */
  limbInches: (v: unknown) => clampNumber(v, 0, 100),

  // ── Daily check-in ──
  /** 1-5 ratings (mood / energy / stress / sleep_quality / recovery / appetite). */
  rating: (v: unknown) => clampNumber(v, 1, 5, 3),
  /** Sleep hours. */
  sleepHours: (v: unknown) => clampNumber(v, 0, 24),
  /** Resting heart rate (bpm). */
  restingHr: (v: unknown) => clampNumber(v, 30, 220),
  /** Heart rate variability (ms). */
  hrv: (v: unknown) => clampNumber(v, 5, 500),
  /** SpO2 %. */
  spo2: (v: unknown) => clampNumber(v, 70, 100),
  /** VO2 max. */
  vo2max: (v: unknown) => clampNumber(v, 5, 100),
  /** Active calories burned (kcal). */
  activeCal: (v: unknown) => clampNumber(v, 0, 10000),
  /** Steps per day. */
  steps: (v: unknown) => clampNumber(v, 0, 200000),
  /** Respiratory rate (breaths / min). */
  respRate: (v: unknown) => clampNumber(v, 4, 60),

  // ── Workouts ──
  /** Reps per set. */
  reps: (v: unknown) => clampNumber(v, 1, 500),
  /** Weight in lb on a single set. */
  liftWeightLbs: (v: unknown) => clampNumber(v, 0, 2000),
  /** Workout duration in minutes. */
  workoutMinutes: (v: unknown) => clampNumber(v, 1, 360),

  // ── Nutrition ──
  /** Calories per meal. 5000 is wide for a single meal — accommodates
   *  ultra-endurance "training tables" without letting 99999 slip in. */
  mealCalories: (v: unknown) => clampNumber(v, 0, 5000),
  /** Macro grams per meal. */
  mealProteinG: (v: unknown) => clampNumber(v, 0, 500),
  mealCarbsG: (v: unknown) => clampNumber(v, 0, 1000),
  mealFatG: (v: unknown) => clampNumber(v, 0, 500),
  mealFiberG: (v: unknown) => clampNumber(v, 0, 100),
  /** Sodium / micronutrients (mg). */
  mealSodiumMg: (v: unknown) => clampNumber(v, 0, 10000),

  // ── Doses ──
  /** Dose amount in mcg. */
  doseMcg: (v: unknown) => clampNumber(v, 0, 100000),
  /** Dose amount in mg. */
  doseMg: (v: unknown) => clampNumber(v, 0, 100),
  /** Dose amount in IU. */
  doseIu: (v: unknown) => clampNumber(v, 0, 10000),

  // ── Strings ──
  /** Profile display name. */
  displayName: (v: unknown) => clampString(v, 60),
  /** Profile bio. */
  bio: (v: unknown) => clampString(v, 280),
  /** Free-text "notes" field. */
  notes: (v: unknown) => clampString(v, 500),
  /** Single condition / medication / allergy / supplement entry. */
  medicalTag: (v: unknown) => clampString(v, 80),
  /** Peptide / substance name. */
  substanceName: (v: unknown) => clampString(v, 100),
};
