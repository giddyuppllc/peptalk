/**
 * Fitness & Nutrition type system for PepTalk.
 *
 * Covers: exercises, workout programs, meal tracking, macro targets,
 * recipes, trainer subscriptions, and progress tracking.
 */

// ---------------------------------------------------------------------------
// Exercise & Workout Types
// ---------------------------------------------------------------------------

/** Muscle groups — matches Jamie's exercise spreadsheet taxonomy */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'trapezius'
  | 'forearms'
  | 'full_body'
  | 'pelvic_floor'
  | 'cardio';

/** Circuit & warm-up tags for WOD / workout builder grouping */
export type ExerciseTag =
  | 'circuit_cardio'
  | 'circuit_lower'
  | 'circuit_pull'
  | 'circuit_push'
  | 'warm_up_lower'
  | 'warm_up_upper';

/** Equipment inferred from exercise name */
export type Equipment =
  | 'none'
  | 'dumbbell'
  | 'barbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'band'
  | 'stability_ball'
  | 'medicine_ball'
  | 'bench'
  | 'smith_machine'
  | 'pull_up_bar'
  | 'plate'
  | 'towel'
  | 'block'
  | 'jump_rope';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** P1 = highest priority / most used, P4 = specialized */
export type ExercisePriority = 'P1' | 'P2' | 'P3' | 'P4';

/** Where the exercise can be performed */
export type ExerciseLocation = 'any' | 'gym' | 'home' | 'outdoor';

/** Gender suitability */
export type ExerciseGender = 'anyone' | 'men' | 'women';

/** What metrics apply to this exercise */
export type ExerciseMetric = 'reps' | 'weight' | 'duration';

export interface Exercise {
  id: string;
  name: string;
  /** Normalized lowercase name for search/dedup */
  normalizedName: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  /** Circuit/warm-up tags for workout builder grouping */
  tags: ExerciseTag[];
  equipment: Equipment[];
  difficulty: ExerciseDifficulty;
  /** Whether the exercise is time-based (planks, holds) vs rep-based */
  isTimeBased: boolean;

  // ── Jamie's taxonomy ──────────────────────────────────────────────────
  /** Priority class: P1 (core movements) → P4 (specialized) */
  priority: ExercisePriority;
  /** Where this can be done */
  location: ExerciseLocation;
  /** Gender suitability */
  gender: ExerciseGender;
  /** Applicable metrics (reps, weight, duration) */
  metrics: ExerciseMetric[];

  // ── Media (populated when videos are hosted) ──────────────────────────
  /** Video URL (self-hosted CDN) */
  videoUrl?: string;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /** Brief cue or instruction */
  instructions?: string;
}

export type SetType = 'normal' | 'super_set' | 'super_set_2' | 'drop_set' | 'giant_set';

export interface ExerciseSet {
  /** Exercise reference by ID */
  exerciseId: string;
  /** e.g. [20, 20, 20] means 3 sets of 20 reps */
  reps: number[];
  setType: SetType;
  /** For time-based exercises: seconds per set */
  timeSeconds?: number;
  /** Rest between sets in seconds */
  restSeconds?: number;
  /** Tempo notation e.g. "3-1-2" */
  tempo?: string;
}

export interface WorkoutDay {
  id: string;
  name: string;
  /** e.g. "W1/D1" */
  code: string;
  exercises: ExerciseSet[];
  /** Estimated duration in minutes */
  estimatedMinutes?: number;
}

export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
export type ProgramCategory =
  | 'core'
  | 'strength'
  | 'hypertrophy'
  | 'fat_loss'
  | 'pelvic_floor'
  | 'mobility'
  | 'cardio'
  | 'full_body'
  | 'upper_body'
  | 'lower_body'
  | 'challenge'
  | 'glutes'
  | 'posture'
  | 'corrective'
  | 'starter'
  | 'trial'
  | 'functional'
  | 'trx'
  | 'hiit'
  | 'conditioning'
  | 'compound'
  | 'nutrition'
  | 'education'
  | 'wellness'
  | 'recomp';

export interface WorkoutWeek {
  weekNumber: number;
  days: WorkoutDay[];
}

export interface WorkoutProgram {
  id: string;
  name: string;
  description: string;
  /** Trainer/creator name */
  createdBy: string;
  category: ProgramCategory[];
  difficulty: ProgramDifficulty;
  weeks: WorkoutWeek[];
  /** Total number of weeks */
  durationWeeks: number;
  /** Whether this is premium-only content */
  isPremium: boolean;
  /** Cover image */
  imageUrl?: string;
  /** Tags for search */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Workout Logging (user tracking)
// ---------------------------------------------------------------------------

export interface WorkoutLogSet {
  exerciseId: string;
  setNumber: number;
  reps: number;
  /** Weight used in lbs */
  weightLbs?: number;
  /** Duration in seconds for timed exercises */
  durationSeconds?: number;
  /** Did the user complete this set? */
  completed: boolean;
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  programId?: string;
  weekNumber?: number;
  dayId?: string;
  /** All sets logged during this workout */
  sets: WorkoutLogSet[];
  /** Total workout duration in minutes */
  durationMinutes: number;
  /** User rating 1-5 */
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  /** Optional workout name (used for free-form logs) */
  workoutName?: string;
  startedAt: string; // ISO
  completedAt?: string; // ISO
}

// ---------------------------------------------------------------------------
// Nutrition & Meal Types
// ---------------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';

export interface MacroTargets {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  waterOz?: number;
}

export interface FoodItem {
  id: string;
  name: string;
  /** Serving size description e.g. "1 cup", "100g" */
  servingSize: string;
  servingGrams: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  /** Whether this is a user-created custom food */
  isCustom: boolean;
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  foods: {
    foodId: string;
    foodName: string;
    servings: number;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams?: number;
    sodiumMg?: number;
    sugarGrams?: number;
    cholesterolMg?: number;
    saturatedFatGrams?: number;
    transFatGrams?: number;
    potassiumMg?: number;
    calciumMg?: number;
    ironMg?: number;
    vitaminAMcg?: number;
    vitaminCMg?: number;
  }[];
  /** Quick-log: user can just enter totals without itemizing */
  quickLog?: {
    description: string;
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  };
  notes?: string;
  timestamp: string; // ISO
}

// ---------------------------------------------------------------------------
// Recipe Types
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  /** Prep time in minutes */
  prepMinutes: number;
  /** Cook time in minutes */
  cookMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  /** Per-serving macros */
  macrosPerServing: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
  };
  tags: string[];
  /** AI-generated or curated */
  source: 'ai' | 'curated' | 'user';
  /** Diet compatibility */
  dietTypes: string[];
  /** Image URL */
  imageUrl?: string;
  isPremium: boolean;
}

// ---------------------------------------------------------------------------
// Progress Tracking
// ---------------------------------------------------------------------------

export interface ProgressPhoto {
  id: string;
  date: string; // YYYY-MM-DD
  /** Local URI to the photo */
  uri: string;
  category: 'front' | 'side' | 'back' | 'other';
  notes?: string;
}

export interface BodyMeasurement {
  id: string;
  date: string; // YYYY-MM-DD
  weightLbs?: number;
  bodyFatPercent?: number;
  waistInches?: number;
  hipsInches?: number;
  chestInches?: number;
  armInches?: number;
  thighInches?: number;
}

// ---------------------------------------------------------------------------
// Subscription / Paywall
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface SubscriptionState {
  tier: SubscriptionTier;
  /** App Store / Google Play product ID */
  productId?: string;
  expiresAt?: string; // ISO
  isActive: boolean;
}

/** What each tier can access */
export const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  free: [
    // Nutrition — basic tracking
    'calorie_counter',
    'food_nutrition_info',       // calories + P/C/F macros
    'water_tracking',
    'macro_donut_chart',         // macros donut page
    // Peptides — info & calculators
    'peptide_library',
    'peptide_info',
    'dosing_calculator',
    'reconstitution_calculator',
    // Workouts — manual logging
    'workout_logging',
    'cardio_logging',
    'exercise_library',
    // General
    'learn_hub',
  ],
  plus: [
    // All free features
    'calorie_counter',
    'food_nutrition_info',
    'water_tracking',
    'macro_donut_chart',
    'peptide_library',
    'peptide_info',
    'dosing_calculator',
    'reconstitution_calculator',
    'workout_logging',
    'cardio_logging',
    'exercise_library',
    'learn_hub',
    // Nutrition — detailed analytics
    'micronutrients_basic',      // fiber, sodium, sugar, cholesterol, sat fat
    'vitamins_donut_chart',      // vitamins & minerals donut page
    'nutrition_trends',          // weekly/monthly trend charts
    'meal_history_full',         // meal history beyond 7 days
    // Peptides — advanced
    'aimee_ai_limited',
    'stack_builder',
    // Tracking & health
    'health_calendar',
    'manual_tracking',
    'health_checkins',
    'dose_logging',
    'journal',
    'health_integrations',
    'watch_sync',
    'biomarker_tracking',
    'calendar_timeline',
  ],
  pro: [
    // All plus features
    'calorie_counter',
    'food_nutrition_info',
    'water_tracking',
    'macro_donut_chart',
    'peptide_library',
    'peptide_info',
    'dosing_calculator',
    'reconstitution_calculator',
    'workout_logging',
    'cardio_logging',
    'exercise_library',
    'learn_hub',
    'micronutrients_basic',
    'vitamins_donut_chart',
    'nutrition_trends',
    'meal_history_full',
    'aimee_ai_limited',
    'stack_builder',
    'health_calendar',
    'manual_tracking',
    'health_checkins',
    'dose_logging',
    'journal',
    'health_integrations',
    'watch_sync',
    'biomarker_tracking',
    'calendar_timeline',
    // Nutrition — full suite
    'micronutrients_full',       // all vitamins A-K, B-complex, minerals
    'ai_food_scanner',           // camera → auto macro calculation
    'ai_meal_plans',             // custom meal plans for peptide stack
    'nutrition_planning',
    'grocery_from_plans',
    'recipe_generator',
    // Workouts — AI powered
    'aimee_ai_unlimited',
    'aimee_workout_plans',       // custom AI workouts for goals + stack
    'workout_programs',
    'workout_videos',
    // Health — reports & export
    'aimee_meal_plans',
    'aimee_health_scheduler',
    'health_reports',
    'pdf_export',
    'data_export',
    // Premium perks
    'ad_free',
    'consult_booking',
  ],
};

// ---------------------------------------------------------------------------
// Habit Tracking
// ---------------------------------------------------------------------------

export type HabitFrequency = 'daily' | 'weekdays' | 'custom';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  frequency: HabitFrequency;
  /** For custom: which days of week (0=Sun, 6=Sat) */
  customDays?: number[];
  /** Target count per day (e.g. 8 glasses of water) */
  targetCount: number;
  createdAt: string;
}

export interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  count: number;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Grocery List
// ---------------------------------------------------------------------------

export type GroceryCategory =
  | 'produce'
  | 'protein'
  | 'dairy'
  | 'grains'
  | 'supplements'
  | 'other';

export interface GroceryItem {
  id: string;
  name: string;
  category: GroceryCategory;
  checked: boolean;
  /** Where the item was added from (e.g. recipe name) */
  addedFrom?: string;
}
