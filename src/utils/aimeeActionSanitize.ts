/**
 * Pure-function sanitizers for every Aimee `client_action` payload that
 * mutates user data (log_dose, log_meal, log_water, log_appetite,
 * add_to_pantry, schedule_workout). The model can hallucinate any value
 * — these guards keep the local store from absorbing garbage.
 *
 * Tested in scripts/verify-aimee-action-sanitize.ts. Whenever you change
 * a clamp, update the test cases — that's the contract.
 *
 * Design rules:
 *   - Reject; don't fabricate. If a required field is hostile, return
 *     `null` and the apply* helper short-circuits without writing.
 *   - Cap strings at sensible UI lengths so JSONB columns don't grow
 *     unbounded.
 *   - Pin enums explicitly. Casting to `any` is a code smell that has
 *     bitten us twice.
 *   - Stay framework-free (no React, no expo, no Zustand) so this file
 *     can be unit-tested in plain Node.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type DoseUnit = 'mcg' | 'mg' | 'iu';
export type DoseRoute = 'subcutaneous' | 'intramuscular' | 'oral' | 'nasal' | 'topical' | 'sublingual';
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';
export type AppetiteState = 'hungry' | 'full' | 'nauseous';
export type PantryUnit = 'each' | 'oz' | 'g' | 'lb' | 'kg' | 'cup' | 'tbsp' | 'tsp' | 'ml' | 'l';

const ALLOWED_MEAL_TYPES: ReadonlySet<MealType> = new Set([
  'breakfast', 'lunch', 'dinner', 'snack',
]);
const ALLOWED_DOSE_UNITS: ReadonlySet<DoseUnit> = new Set(['mcg', 'mg', 'iu']);
// Superset of the server log_dose `route` enum
// (subcutaneous/intramuscular/oral/nasal/sublingual). 'topical' is kept
// because it's a valid AdministrationRoute used elsewhere in the app; the
// server tool never emits it, so it's harmless here. The previously-missing
// 'sublingual' caused a sublingual dose to be silently coerced to
// 'subcutaneous'.
const ALLOWED_DOSE_ROUTES: ReadonlySet<DoseRoute> = new Set([
  'subcutaneous', 'intramuscular', 'oral', 'nasal', 'topical', 'sublingual',
]);
const ALLOWED_APPETITE: ReadonlySet<AppetiteState> = new Set([
  'hungry', 'full', 'nauseous',
]);
const ALLOWED_PANTRY_UNITS: ReadonlySet<PantryUnit> = new Set([
  'each', 'oz', 'g', 'lb', 'kg', 'cup', 'tbsp', 'tsp', 'ml', 'l',
]);
const ALLOWED_STORAGE: ReadonlySet<StorageLocation> = new Set([
  'fridge', 'freezer', 'pantry',
]);

/** Cap one float against an inclusive max; coerce non-finite to 0. */
export function clamp(v: unknown, max: number, min = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** True only when `s` is a real calendar date like "2026-05-17". */
export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split('-').map(Number);
  if (y == null || mo == null || d == null) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** True when `s` is "HH:mm" with valid hour + minute. */
export function isValidHHmm(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h != null && m != null && h >= 0 && h < 24 && m >= 0 && m < 60;
}

/** Coerce a string to a bounded, trimmed form. Returns '' if not a string. */
export function clampString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

// ─── log_dose ───────────────────────────────────────────────────────────────

export interface SanitizedDose {
  peptideId: string;
  amount: number;
  unit: DoseUnit;
  route: DoseRoute;
  date?: string;
  time?: string;
  injectionSite?: string;
  notes?: string;
}

export function sanitizeLogDose(input: Record<string, unknown>): SanitizedDose | null {
  const peptideId = clampString(input.peptideId, 120);
  if (!peptideId) return null;

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rawUnit = clampString(input.unit, 10).toLowerCase();
  const unit: DoseUnit = ALLOWED_DOSE_UNITS.has(rawUnit as DoseUnit)
    ? (rawUnit as DoseUnit)
    : 'mcg';
  // Magnitude caps mirror the manual log dialog.
  if (unit === 'mcg' && amount > 100000) return null;
  if (unit === 'mg' && amount > 100) return null;
  if (unit === 'iu' && amount > 10000) return null;

  const rawRoute = clampString(input.route, 30).toLowerCase();
  const route: DoseRoute = ALLOWED_DOSE_ROUTES.has(rawRoute as DoseRoute)
    ? (rawRoute as DoseRoute)
    : 'subcutaneous';

  return {
    peptideId,
    amount,
    unit,
    route,
    date: isValidIsoDate(input.date) ? input.date : undefined,
    time: isValidHHmm(input.time) ? input.time : undefined,
    injectionSite: typeof input.site === 'string'
      ? clampString(input.site, 80) || undefined
      : undefined,
    notes: typeof input.notes === 'string'
      ? clampString(input.notes, 500) || undefined
      : undefined,
  };
}

// ─── log_meal ───────────────────────────────────────────────────────────────

export interface SanitizedMealFood {
  foodId: string;
  foodName: string;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

export interface SanitizedMeal {
  id: string;
  date: string;
  mealType: MealType;
  foods: SanitizedMealFood[];
  notes?: string;
  quickLog: {
    description: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  };
  timestamp: string;
}

export function sanitizeLogMeal(input: Record<string, unknown>): SanitizedMeal | null {
  const id = typeof input.id === 'string' && input.id.length < 80
    ? input.id
    : `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const date = isValidIsoDate(input.date)
    ? input.date
    : new Date().toISOString().slice(0, 10);

  const rawMealType = clampString(input.mealType, 20).toLowerCase();
  const mealType: MealType = ALLOWED_MEAL_TYPES.has(rawMealType as MealType)
    ? (rawMealType as MealType)
    : 'snack';

  const title = clampString(input.title, 200) || 'Meal';

  const totals = (input.totals ?? {}) as Record<string, unknown>;
  const quickLog = {
    description: title,
    calories: clamp(totals.calories, 5000),
    proteinGrams: clamp(totals.protein ?? totals.proteinGrams, 500),
    carbsGrams: clamp(totals.carbs ?? totals.carbsGrams, 1000),
    fatGrams: clamp(totals.fat ?? totals.fatGrams, 500),
  };

  const rawItems = Array.isArray(input.items) ? (input.items as any[]) : [];
  const foods: SanitizedMealFood[] = rawItems
    .slice(0, 20)                      // hard cap on item count
    .map((it) => ({
      foodId: typeof it?.foodId === 'string'
        ? it.foodId.slice(0, 80)
        : `food-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      foodName: clampString(it?.foodName ?? it?.name, 200) || 'item',
      servings: clamp(it?.servings, 50, 0) || 1,
      calories: clamp(it?.calories, 3000),
      proteinGrams: clamp(it?.proteinGrams ?? it?.protein, 300),
      carbsGrams: clamp(it?.carbsGrams ?? it?.carbs, 500),
      fatGrams: clamp(it?.fatGrams ?? it?.fat, 300),
      fiberGrams: clamp(it?.fiberGrams ?? it?.fiber, 100),
    }));

  const timestamp = typeof input.timestamp === 'string'
    ? input.timestamp
    : new Date().toISOString();

  return {
    id,
    date,
    mealType,
    foods,
    quickLog,
    timestamp,
    notes: typeof input.notes === 'string'
      ? clampString(input.notes, 500) || undefined
      : undefined,
  };
}

// ─── log_water ──────────────────────────────────────────────────────────────

export interface SanitizedWater {
  ounces: number;
  date: string;
}

export function sanitizeLogWater(input: Record<string, unknown>): SanitizedWater | null {
  const ounces = Number(input.ounces);
  if (!Number.isFinite(ounces) || ounces <= 0 || ounces > 200) return null;
  const date = isValidIsoDate(input.date)
    ? input.date
    : new Date().toISOString().slice(0, 10);
  return { ounces: Math.round(ounces), date };
}

// ─── log_appetite ───────────────────────────────────────────────────────────

export interface SanitizedAppetite {
  state: AppetiteState;
  notes?: string;
}

export function sanitizeLogAppetite(input: Record<string, unknown>): SanitizedAppetite | null {
  const rawState = clampString(input.state, 20).toLowerCase();
  if (!ALLOWED_APPETITE.has(rawState as AppetiteState)) return null;
  const notes = typeof input.notes === 'string'
    ? clampString(input.notes, 200) || undefined
    : undefined;
  return { state: rawState as AppetiteState, notes };
}

// ─── add_to_pantry ──────────────────────────────────────────────────────────

export interface SanitizedPantryItem {
  name: string;
  quantity: number;
  unit: PantryUnit;
  category?: string;
  storageLocation: StorageLocation;
}

export function sanitizeAddToPantry(input: Record<string, unknown>): SanitizedPantryItem[] {
  const raw = Array.isArray(input.items) ? (input.items as any[]) : [];
  return raw
    .slice(0, 50)
    .map((it): SanitizedPantryItem | null => {
      const name = clampString(it?.name, 120);
      if (!name) return null;
      const rawQty = Number(it?.quantity);
      const quantity = Number.isFinite(rawQty) && rawQty > 0
        ? Math.min(Math.round(rawQty * 100) / 100, 10000)
        : 1;
      const rawUnit = clampString(it?.unit, 10).toLowerCase();
      const unit: PantryUnit = ALLOWED_PANTRY_UNITS.has(rawUnit as PantryUnit)
        ? (rawUnit as PantryUnit)
        : 'each';
      const rawStorage = clampString(it?.storageLocation, 20).toLowerCase();
      const storageLocation: StorageLocation = ALLOWED_STORAGE.has(rawStorage as StorageLocation)
        ? (rawStorage as StorageLocation)
        : 'pantry';
      const category = typeof it?.category === 'string'
        ? clampString(it.category, 40) || undefined
        : undefined;
      return { name, quantity, unit, category, storageLocation };
    })
    .filter((x): x is SanitizedPantryItem => x !== null);
}

// ─── schedule_workout ───────────────────────────────────────────────────────

export interface SanitizedScheduledWorkout {
  id: string;
  date: string;
  startedAt: string;
  durationMinutes: number;
  notes?: string;
  workoutName: string;
}

export function sanitizeScheduleWorkout(
  input: Record<string, unknown>,
): SanitizedScheduledWorkout | null {
  const id = typeof input.id === 'string' && input.id.length < 80
    ? input.id
    : `wlog-aimee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = typeof input.startedAt === 'string'
    ? input.startedAt
    : new Date().toISOString();
  // Derive date from startedAt if it parses, else today.
  const datePart = startedAt.slice(0, 10);
  const date = isValidIsoDate(datePart) ? datePart : new Date().toISOString().slice(0, 10);
  const rawDuration = Number(input.durationMinutes);
  const durationMinutes = Number.isFinite(rawDuration)
    ? Math.max(0, Math.min(240, Math.floor(rawDuration)))
    : 0;
  const workoutName = clampString(input.workoutName, 120) || 'Workout';
  const notes = typeof input.notes === 'string'
    ? clampString(input.notes, 500) || undefined
    : undefined;
  return { id, date, startedAt, durationMinutes, notes, workoutName };
}
