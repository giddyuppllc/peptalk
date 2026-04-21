/**
 * Menstrual cycle + contraception + biomarker integration types.
 *
 * Post-Dobbs privacy note: cycle data is politically sensitive.
 * Storage design:
 *   - Dates are YYYY-MM-DD strings (date-anchored, not timestamp-anchored)
 *   - RLS on Supabase ensures only the user sees their own data
 *   - Privacy settings surface an "extra sensitive" notice for cycle rows
 *   - 2.0: full local-only mode + opt-in cloud sync
 *
 * Schema-first enum policy: the full set of possible BiomarkerSource
 * values is declared even though only Apple Health / Health Connect /
 * Manual ship in 1.9.0. Keeping unused values in the enum now means
 * we don't have to migrate the DB schema when Dexcom / Libre / Oura /
 * Whoop / Garmin / etc. come online in later releases.
 */

// ── Flow intensity ──────────────────────────────────────────────────────────

export type FlowIntensity = 'spotting' | 'light' | 'medium' | 'heavy';

export const FLOW_LABELS: Record<FlowIntensity, string> = {
  spotting: 'Spotting',
  light:    'Light',
  medium:   'Medium',
  heavy:    'Heavy',
};

// ── Body symptoms ───────────────────────────────────────────────────────────

export type BodySymptom =
  | 'cramps'
  | 'bloating'
  | 'headache'
  | 'breast_tenderness'
  | 'back_pain'
  | 'nausea'
  | 'fatigue'
  | 'acne'
  | 'constipation'
  | 'diarrhea'
  | 'tender_stomach'
  | 'dizziness'
  | 'insomnia'
  | 'cravings'
  | 'swelling'
  | 'hot_flash'
  | 'night_sweats';

export const BODY_SYMPTOM_LABELS: Record<BodySymptom, string> = {
  cramps:            'Cramps',
  bloating:          'Bloating',
  headache:          'Headache',
  breast_tenderness: 'Breast tenderness',
  back_pain:         'Back pain',
  nausea:            'Nausea',
  fatigue:           'Fatigue',
  acne:              'Acne',
  constipation:      'Constipation',
  diarrhea:          'Diarrhea',
  tender_stomach:    'Tender stomach',
  dizziness:         'Dizziness',
  insomnia:          'Insomnia',
  cravings:          'Cravings',
  swelling:          'Swelling',
  hot_flash:         'Hot flash',
  night_sweats:      'Night sweats',
};

// ── Mood ────────────────────────────────────────────────────────────────────

export type MoodTag =
  | 'happy'
  | 'calm'
  | 'energetic'
  | 'focused'
  | 'sad'
  | 'anxious'
  | 'irritable'
  | 'emotional'
  | 'sensitive'
  | 'low_libido'
  | 'high_libido';

export const MOOD_LABELS: Record<MoodTag, string> = {
  happy:       'Happy',
  calm:        'Calm',
  energetic:   'Energetic',
  focused:     'Focused',
  sad:         'Sad',
  anxious:     'Anxious',
  irritable:   'Irritable',
  emotional:   'Emotional',
  sensitive:   'Sensitive',
  low_libido:  'Low libido',
  high_libido: 'High libido',
};

// ── Discharge (cervical mucus — fertility awareness) ────────────────────────

export type DischargeType = 'none' | 'dry' | 'sticky' | 'creamy' | 'watery' | 'egg_white';

export const DISCHARGE_LABELS: Record<DischargeType, string> = {
  none:       'None',
  dry:        'Dry',
  sticky:     'Sticky',
  creamy:     'Creamy',
  watery:     'Watery',
  egg_white:  'Egg white',
};

// ── Contraception / hormonal method ─────────────────────────────────────────

export type ContraceptionMethod =
  | 'none'
  | 'tracking_natural'
  | 'hormonal_iud'
  | 'copper_iud'
  | 'combined_hormonal'     // pill, patch, NuvaRing
  | 'progestin_pill'
  | 'implant'
  | 'injection'
  | 'pregnant'
  | 'postpartum'
  | 'perimenopause_menopause'
  | 'prefer_not_to_say';

export const CONTRACEPTION_LABELS: Record<ContraceptionMethod, string> = {
  none:                     'Not currently using contraception',
  tracking_natural:         'Tracking a natural cycle / TTC',
  hormonal_iud:             'Hormonal IUD (Mirena, Kyleena, Skyla, Liletta)',
  copper_iud:               'Copper IUD (Paragard)',
  combined_hormonal:        'Combined pill / patch / NuvaRing',
  progestin_pill:           'Progestin-only pill',
  implant:                  'Implant (Nexplanon)',
  injection:                'Injection (Depo-Provera)',
  pregnant:                 'Currently pregnant',
  postpartum:               'Postpartum / breastfeeding',
  perimenopause_menopause:  'Perimenopause / menopause',
  prefer_not_to_say:        'Prefer not to say',
};

/**
 * Order used by the onboarding picker — intentional, doesn't bias toward
 * hormonal methods; escape hatch last.
 */
export const CONTRACEPTION_OPTIONS: ContraceptionMethod[] = [
  'none',
  'tracking_natural',
  'hormonal_iud',
  'copper_iud',
  'combined_hormonal',
  'progestin_pill',
  'implant',
  'injection',
  'pregnant',
  'postpartum',
  'perimenopause_menopause',
  'prefer_not_to_say',
];

/**
 * Prediction routing mode — determines what we predict, how we interpret
 * data, and which UI surfaces we show.
 */
export type PredictionMode =
  | 'cyclical'
  | 'continuous'
  | 'scheduled_cycle'
  | 'pregnancy'
  | 'returning'
  | 'irregular';

export function predictionModeFor(method: ContraceptionMethod): PredictionMode {
  switch (method) {
    case 'none':
    case 'tracking_natural':
    case 'copper_iud':
    case 'prefer_not_to_say':
      return 'cyclical';
    case 'combined_hormonal':
      return 'scheduled_cycle';
    case 'hormonal_iud':
    case 'progestin_pill':
    case 'implant':
    case 'injection':
      return 'continuous';
    case 'pregnant':
      return 'pregnancy';
    case 'postpartum':
      return 'returning';
    case 'perimenopause_menopause':
      return 'irregular';
  }
}

/**
 * Contraception history — full timeline, not just current state, so
 * retrospective cycle analysis interprets past data correctly.
 */
export interface ContraceptionHistoryEntry {
  id: string;
  method: ContraceptionMethod;
  startDate: string;
  endDate?: string;
  notes?: string;
}

// ── Biomarker sources ───────────────────────────────────────────────────────

export type BiomarkerSource =
  | 'manual'
  | 'apple_health'
  | 'google_fit'
  | 'health_connect'
  | 'oura'
  | 'whoop'
  | 'garmin'
  | 'fitbit'
  | 'withings'
  | 'dexcom'
  | 'libre'
  | 'tempdrop'
  | 'kegg'
  | 'mira'
  | 'eight_sleep'
  | 'ai_inferred';

export const BIOMARKER_SOURCE_LABELS: Record<BiomarkerSource, string> = {
  manual:          'Manual entry',
  apple_health:    'Apple Health',
  google_fit:      'Google Fit',
  health_connect:  'Health Connect',
  oura:            'Oura',
  whoop:           'Whoop',
  garmin:          'Garmin',
  fitbit:          'Fitbit',
  withings:        'Withings',
  dexcom:          'Dexcom',
  libre:           'FreeStyle Libre',
  tempdrop:        'Tempdrop',
  kegg:            'kegg',
  mira:            'Mira',
  eight_sleep:     'Eight Sleep',
  ai_inferred:     'AI inferred',
};

/**
 * Source-of-truth priority for the resolver. Higher wins.
 * Rule: manual (user correction) > dedicated device > generic aggregator.
 */
export const SOURCE_PRIORITY: Record<BiomarkerSource, number> = {
  manual:          100,
  tempdrop:        90,
  kegg:            90,
  mira:            90,
  dexcom:          90,
  libre:           90,
  oura:            85,
  whoop:           85,
  withings:        80,
  garmin:          80,
  fitbit:          70,
  eight_sleep:     70,
  apple_health:    60,
  health_connect:  60,
  google_fit:      55,
  ai_inferred:     10,
};

// ── Core entries ────────────────────────────────────────────────────────────

export interface PeriodEntry {
  id: string;
  startDate: string;
  endDate?: string;
  dailyFlow?: Record<string, FlowIntensity>;
  notes?: string;
  source: BiomarkerSource;
  createdAt: string;
  updatedAt: string;
}

export interface CycleDayLog {
  id: string;
  date: string;
  flow?: FlowIntensity;
  symptoms: BodySymptom[];
  moods: MoodTag[];
  discharge?: DischargeType;
  bbt?: number;
  bbtSource?: BiomarkerSource;
  notes?: string;
  sexualActivity?: boolean;
  positiveOvulationTest?: boolean;
  positivePregnancyTest?: boolean;
  source: BiomarkerSource;
  createdAt: string;
  updatedAt: string;
}

// ── Derived: stats + predictions ────────────────────────────────────────────

export interface CycleStats {
  avgCycleLength: number;
  avgPeriodLength: number;
  shortestCycle: number;
  longestCycle: number;
  irregularityScore: number;
  cycleCount: number;
}

export interface CyclePrediction {
  nextPeriodDate: string;
  daysUntilNextPeriod: number;
  isLate: boolean;
  ovulationDate: string;
  fertileWindow: { start: string; end: string };
  pmsWindow: { start: string; end: string };
  confidence: 'low' | 'medium' | 'high';
  mode: PredictionMode;
  confidenceReason?: string;
}

// ── Integrations ────────────────────────────────────────────────────────────

export type BiomarkerScope =
  | 'steps'
  | 'active_energy'
  | 'resting_heart_rate'
  | 'hrv'
  | 'vo2_max'
  | 'spo2'
  | 'sleep'
  | 'weight'
  | 'body_fat'
  | 'blood_pressure'
  | 'blood_glucose'
  | 'bbt'
  | 'wrist_temperature'
  | 'menstrual_flow'
  | 'ovulation_test'
  | 'cervical_mucus'
  | 'sexual_activity'
  | 'workouts'
  | 'respiratory_rate';

export const BIOMARKER_SCOPE_LABELS: Record<BiomarkerScope, string> = {
  steps:              'Steps',
  active_energy:      'Active energy',
  resting_heart_rate: 'Resting heart rate',
  hrv:                'HRV',
  vo2_max:            'VO₂ max',
  spo2:               'SpO₂',
  sleep:              'Sleep',
  weight:             'Weight',
  body_fat:           'Body fat %',
  blood_pressure:     'Blood pressure',
  blood_glucose:      'Blood glucose',
  bbt:                'Basal body temperature',
  wrist_temperature:  'Wrist temperature',
  menstrual_flow:     'Menstrual flow',
  ovulation_test:     'Ovulation test results',
  cervical_mucus:     'Cervical mucus',
  sexual_activity:    'Sexual activity',
  workouts:           'Workouts',
  respiratory_rate:   'Respiratory rate',
};

export interface ConnectedIntegration {
  id: string;
  source: BiomarkerSource;
  connected: boolean;
  scopes: BiomarkerScope[];
  lastSyncedAt?: string;
  statusMessage?: string;
  lastError?: string;
}

// ── Allergens (expanded intake) ─────────────────────────────────────────────

export type FoodAllergen =
  | 'peanut'
  | 'tree_nut'
  | 'dairy'
  | 'egg'
  | 'soy'
  | 'gluten'
  | 'wheat'
  | 'shellfish'
  | 'fish'
  | 'sesame'
  | 'corn'
  | 'nightshade';

export const FOOD_ALLERGEN_LABELS: Record<FoodAllergen, string> = {
  peanut:     'Peanut',
  tree_nut:   'Tree nut',
  dairy:      'Dairy',
  egg:        'Egg',
  soy:        'Soy',
  gluten:     'Gluten',
  wheat:      'Wheat',
  shellfish:  'Shellfish',
  fish:       'Fish',
  sesame:     'Sesame',
  corn:       'Corn',
  nightshade: 'Nightshade',
};

export type DrugAllergen =
  | 'penicillin'
  | 'sulfa'
  | 'nsaid'
  | 'opioid'
  | 'aspirin'
  | 'cephalosporin'
  | 'local_anesthetic'
  | 'contrast_dye'
  | 'latex_medical';

export const DRUG_ALLERGEN_LABELS: Record<DrugAllergen, string> = {
  penicillin:        'Penicillin',
  sulfa:             'Sulfa drugs',
  nsaid:             'NSAIDs (ibuprofen, naproxen)',
  opioid:            'Opioids',
  aspirin:           'Aspirin',
  cephalosporin:     'Cephalosporins',
  local_anesthetic:  'Local anesthetics',
  contrast_dye:      'Contrast dye',
  latex_medical:     'Latex',
};

export type EnvAllergen =
  | 'pollen'
  | 'dust_mite'
  | 'pet_dander'
  | 'mold'
  | 'latex_env'
  | 'fragrance'
  | 'bee_sting'
  | 'nickel';

export const ENV_ALLERGEN_LABELS: Record<EnvAllergen, string> = {
  pollen:        'Pollen',
  dust_mite:     'Dust mites',
  pet_dander:    'Pet dander',
  mold:          'Mold',
  latex_env:     'Latex (environmental)',
  fragrance:     'Fragrance / perfume',
  bee_sting:     'Bee / wasp stings',
  nickel:        'Nickel',
};

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'anaphylaxis';

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  mild:         'Mild',
  moderate:     'Moderate',
  severe:       'Severe',
  anaphylaxis:  'Anaphylaxis',
};

export interface AllergenEntry {
  id: string;
  category: 'food' | 'drug' | 'environmental' | 'other';
  label: string;
  severity: AllergySeverity;
  notes?: string;
  reactionHistory?: string;
  diagnosedBy?: 'self' | 'provider' | 'allergist';
  createdAt: string;
}
