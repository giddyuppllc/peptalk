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

  // ── Coaching content (Grok-generated, Jamie-reviewable) ──────────────
  // Populated from src/data/exerciseInstructions.json at build time.
  // Empty/undefined when content hasn't been generated for an exercise.

  /** One-sentence description: what this exercise is + primary target. */
  description?: string;
  /** Ordered "how to perform" steps. 3-5 numbered actions, plain English. */
  steps?: string[];
  /** 2-3 short coaching cues (form points). Each ≤ 80 chars. */
  cues?: string[];
  /** 1-2 safety notes — what to avoid, common injury pitfalls. */
  safetyNotes?: string[];
  /**
   * Legacy single-string instructions field — kept for back-compat with
   * any callers that haven't migrated to the structured `steps` array.
   */
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
  /** Rate of Perceived Exertion (1-10) — how hard the set felt */
  rpe?: number;
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

/**
 * Aggressive tier matrix — Free is limited-but-functional, Plus unlocks
 * advanced tracking + organization, Pro unlocks AI + coaching + programs.
 */
const FREE_FEATURES: string[] = [
  // Core nutrition
  'calorie_counter',
  'food_nutrition_info',
  'water_tracking',
  'macro_donut_chart',
  'food_search_usda',
  'basic_meal_log',            // capped to 3 meals/day (enforced at call site)
  // Peptides — library + calculators
  'peptide_library',
  'peptide_info',
  'dosing_calculator',
  'reconstitution_calculator',
  // Workouts — manual only
  'workout_logging',
  'cardio_logging',
  // General
  'learn_hub',
  'basic_journal',              // capped to 5 entries/week
  'daily_checkin',              // 1 per day
  'one_saved_stack',             // capped to 1 saved stack
];

const PLUS_FEATURES: string[] = [
  ...FREE_FEATURES,
  // Nutrition upgrades
  'micronutrients_basic',
  'micronutrients_full',         // all vitamins & minerals tracking
  'vitamins_donut_chart',
  'nutrition_trends',
  'meal_history_full',
  'unlimited_meal_log',
  'custom_foods_unlimited',
  'custom_recipes_unlimited',
  // AI — limited
  'aimee_ai_limited',            // capped at 20 messages/day
  'voice_log',                    // AI natural-language meal parser
  // Tracking + health
  'stack_builder',
  'unlimited_stacks',
  'health_calendar',
  'manual_tracking',
  'health_checkins',
  'dose_logging',
  'journal',
  'unlimited_journal',
  'health_integrations',
  'watch_sync',
  'biomarker_tracking',
  'biomarkers_full',              // HRV, VO2, RHR, weight trends
  'weight_trends',
  'calendar_timeline',
  'workout_csv_export',
  // AI vision food scanner — moved into Plus per Edward's pricing call
  // ($9.99 zone). Includes both the legacy `meal_scan` key and the newer
  // `ai_food_scanner` key so existing PaywallGate / feature checks light up
  // correctly regardless of which name a screen uses.
  'meal_scan',
  'ai_food_scanner',
  // Lab-report photo parser — server-side lab-scan / lab-interpret edge
  // functions both accept plus + pro. Client gate updated Wave 76.35.
  'lab_scan',
  // Perks
  'ad_free',
  // Community live group chat — paying members can post & ask questions
  // during admin-hosted events. Free users keep read-only transcript access.
  'community_live_chat',
];

const PRO_FEATURES: string[] = [
  ...PLUS_FEATURES,
  // AI — unlimited
  'aimee_ai_unlimited',
  'aimee_workout_plans',
  'aimee_meal_plans',
  // AI — premium features
  'recipe_generator',
  // Workouts — programs + custom
  'workout_programs',
  'exercise_library',
  'custom_workout_generator',
  'generated_workout_tracker',
  // Reports
  'health_reports',
  'pdf_export',
  'research_feed_premium',
  // Perks
  'nutrition_planning',
  'grocery_from_plans',
  'early_access',
  'meal_plan',
  // Wave 76.44: cut aimee_health_scheduler + data_export — both were
  // listed but never implemented. Removed from copy + UI gates so the
  // App Store reviewer doesn't bounce us for "advertised feature not
  // available." Add back when actually shipped.
];

/** What each tier can access */
export const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  free: FREE_FEATURES,
  plus: PLUS_FEATURES,
  pro: PRO_FEATURES,
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
