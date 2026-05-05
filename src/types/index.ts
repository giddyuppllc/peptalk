export type PeptideCategory =
  | 'Metabolic'
  | 'Recovery'
  | 'Growth Hormone'
  | 'Nootropic'
  | 'Immune'
  | 'Anti-inflammatory'
  | 'Mitochondrial'
  | 'Longevity'
  | 'Sleep'
  | 'Reproductive'
  | 'Sexual Health'
  | 'Cosmetic'
  | 'Tanning'
  | 'Neuropeptide'
  | 'Antimicrobial';

export type Gender = 'Male' | 'Female';

export type AgeRange = '18-29' | '30-44' | '45-60' | '60+';

export type MaritalStatus = 'Single' | 'Married' | 'Other';

export type ReferralSource =
  | 'Google / Search'
  | 'Social Media'
  | 'Podcast / YouTube'
  | 'Friend / Referral'
  | 'Ad / Sponsored'
  | 'Other';

export type Ethnicity =
  | 'white'
  | 'black'
  | 'hispanic'
  | 'asian'
  | 'native_american'
  | 'pacific_islander'
  | 'middle_eastern'
  | 'mixed_other';

export type SegmentId =
  | 'male-18-29' | 'male-30-44' | 'male-45-60' | 'male-60+'
  | 'female-18-29' | 'female-30-44' | 'female-45-60' | 'female-60+';

export interface EthnicityProfile {
  id: Ethnicity;
  label: string;
  healthFocusAreas: string[];
  featuredPeptideIds: string[];
  researchHighlights: string[];
  paletteAccent?: string;
}

export interface Peptide {
  id: string;
  name: string;
  abbreviation?: string;
  /** Alternative names / brand names users might search by — feeds the
   *  search index AND the deep-dive header ("aka X, Y, Z"). */
  aliases?: string[];
  categories: PeptideCategory[];
  sequenceLength?: number;
  molecularWeight?: string;
  sequence?: string;
  researchSummary: string;
  mechanismOfAction: string;
  receptorTargets?: string[];
  signalingPathways?: string[];
  stabilityNotes: string;
  pubmedLinks?: string[];
  halfLife?: string;
  storageTemp?: string;
  reconstitution?: string;
  isoelectricPoint?: number;
  chargeAtPhysiologicalPH?: string;
  approvalStatus?: 'fda_approved' | 'ema_approved' | 'approved_other' | 'phase_3' | 'phase_2' | 'phase_1' | 'preclinical' | 'research_only';
  /** Coarse compliance tier for plain-English UI badges. Maps loosely to
   *  approvalStatus but separates "compounded under shortage" from
   *  "research only" since they're treated very differently legally. */
  complianceTier?: 'fda_approved' | 'compounded_503a' | 'investigational' | 'research_only' | 'cosmetic' | 'supplement' | 'discontinued';
  /** Standard vial sizes available for reconstitution-math examples
   *  (e.g. ["2mg", "5mg", "10mg"]). */
  vialSizes?: string[];
  /** Notes about water/buffer compatibility, pH, common solvent. */
  solubilityNotes?: string;
  approvalDetails?: string;
  clinicalTrialNCT?: string[];
  adverseEffects?: string[];
  drugInteractions?: string[];
  naturalSources?: string;
  yearDiscovered?: number;
  aminoAcidSequence?: string;
  bioavailability?: string;
  routeOfAdministration?: string[];
  commonBrandNames?: string[];
  doiLinks?: string[];
  /** A-E evidence grade per Edward's spec:
   *   A — FDA-approved human drug data
   *   B — human clinical studies
   *   C — animal/preclinical
   *   D — in-vitro/mechanistic only
   *   E — anecdotal / insufficient evidence
   *  Falls back to the older established/moderate/preliminary if the
   *  letter grade isn't filled in yet. */
  evidenceGrade?: 'A' | 'B' | 'C' | 'D' | 'E' | 'established' | 'moderate' | 'preliminary';
  structureImageUrl?: string;
  uses?: {
    primaryUses: string[];
    commonGoals: string[];
    whatPeopleReport: string;
    popularWith: string[];
    pairsWith: string[];
  };
}

export type InteractionType =
  | 'synergistic'
  | 'neutral'
  | 'competitive'
  | 'contraindicated';

export interface PeptideInteraction {
  peptideA: string;
  peptideB: string;
  interactionType: InteractionType;
  synergyScore: number; // 1-10
  mechanismAnalysis: string;
  stabilityConsiderations: string;
  chemicalCompatibility: string;
  researchPrecedent?: string;
  pubmedLinks?: string[];
}

export interface PeptideStack {
  id: string;
  name: string;
  peptideIds: string[];
  createdAt: string;
  updatedAt: string;
  isCurated?: boolean;
  curatedBy?: string;
  description?: string;
  analysis?: StackAnalysis;
  targetGoals?: GoalType[];
  evidenceLevel?: 'established' | 'moderate' | 'preliminary';
}

export interface StackAnalysis {
  overallSynergyScore: number;
  interactions: PeptideInteraction[];
  categoryCoverage: PeptideCategory[];
  summary: string;
  warnings: string[];
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUri?: string;
  savedStacks: string[];
  favoritePeptides: string[];
  isPro: boolean;
  createdAt: string;
}

export interface OnboardingProfile {
  gender: Gender | null;
  ageRange: AgeRange | null;
  ethnicity: Ethnicity | null;
  maritalStatus: MaritalStatus | null;
  referralSource: ReferralSource | null;
  healthGoals: GoalType[];
  interestCategories: PeptideCategory[];
  acceptedSafety: boolean;
  dataShareConsent: boolean;
}

export interface DashboardSegment {
  id: SegmentId;
  gender: Gender;
  ageRange: AgeRange;
  label: string;
  tagline: string;
  focusAreas: string[];
  heroTitle: string;
  heroSubtitle: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    card: string;
  };
  imagery: string[];
  stackHighlights: string[];
  researchHighlights: string[];
}

export type CheckInRating = 1 | 2 | 3 | 4 | 5;

export type EmotionTag =
  | 'happy' | 'calm' | 'grateful' | 'motivated' | 'focused'
  | 'anxious' | 'irritable' | 'sad' | 'fatigued' | 'brain_fog'
  | 'confident' | 'social' | 'creative' | 'overwhelmed' | 'numb';

/** Sleep stage breakdown from Apple Watch */
export interface SleepStageData {
  awake: number;   // hours
  core: number;    // hours
  deep: number;    // hours
  rem: number;     // hours
  total: number;   // hours
  bedtime?: string;      // ISO timestamp
  wakeTime?: string;     // ISO timestamp
  efficiency?: number;   // 0-100%
  qualityScore?: number; // 0-100 weighted composite
}

/**
 * Optional body measurements (in inches) — empowers users on bulking
 * peptides to track muscle growth alongside daily wellness check-ins.
 * Each field is independent so users can track only what they care
 * about (most lifters track arms + chest + waist; some add thighs/calves).
 */
export interface BodyMeasurements {
  chestIn?: number;
  leftArmIn?: number;
  rightArmIn?: number;
  waistIn?: number;
  hipsIn?: number;
  leftThighIn?: number;
  rightThighIn?: number;
  leftCalfIn?: number;
  rightCalfIn?: number;
  /** Body fat % from caliper / scale / DEXA. */
  bodyFatPct?: number;
}

export interface CheckInEntry {
  id: string;
  date: string; // YYYY-MM-DD (local date)
  createdAt: string;
  mood: CheckInRating;
  energy: CheckInRating;
  stress: CheckInRating;
  sleepQuality: CheckInRating;
  recovery: CheckInRating;
  appetite: CheckInRating;
  weightLbs?: number;
  restingHeartRate?: number;
  steps?: number;
  // Apple Watch metrics
  hrvMs?: number;             // Heart Rate Variability (SDNN) in ms
  vo2Max?: number;            // VO2 max in mL/(kg·min)
  spo2?: number;              // Blood oxygen saturation %
  respiratoryRate?: number;   // Breaths per minute
  activeCalories?: number;    // Active energy burned (kcal)
  sleepStages?: SleepStageData; // Sleep stage breakdown
  bodyMeasurements?: BodyMeasurements;
  notes?: string;
  emotionTags?: EmotionTag[];
  overallFeeling?: string;
  peptideEffects?: PeptideEffect[];
  sideEffectTags?: string[];
}

export interface ResearchArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  relatedPeptides: string[];
  relatedCategories: PeptideCategory[];
}

// ─── Chat / PepTalk Bot ───────────────────────────────────────────────────────

export type ChatRole = 'user' | 'bot';

/** Action button that Aimee can attach to responses for in-app navigation */
export interface BotAction {
  label: string;
  route: string;
  params?: Record<string, string>;
  icon?: string; // Ionicon name
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  relatedPeptideIds?: string[];
  quickReplies?: string[];
  /** Tappable action buttons for navigation from bot responses */
  actions?: BotAction[];
  /** Aimee can navigate user to a screen in the app */
  navAction?: string;
  /** Aimee can log data to health calendar (Pro tier) */
  dataAction?: { type: 'checkin' | 'dose' | 'meal' | 'workout'; data: Record<string, unknown> };
  /** Auto-generated journal entry from conversational logging */
  journalEntry?: {
    category: JournalCategory;
    title: string;
    content: string;
    tags: string[];
    relatedPeptideIds?: string[];
    mood?: CheckInRating;
  };
}

export type BotIntent =
  | 'peptide_info'
  | 'dosing_protocol'
  | 'interaction_check'
  | 'category_explore'
  | 'mechanism'
  | 'comparison'
  | 'side_effects'
  | 'storage'
  | 'health_suggest'
  | 'goal_suggest'
  | 'stack_help'
  | 'knowledge_topic'
  | 'greeting'
  | 'general'
  | 'create_plan'
  | 'modify_plan'
  | 'workout_suggest'
  | 'meal_suggest'
  | 'journal_log';

export interface BotContext {
  userProfile: OnboardingProfile | null;
  recentCheckIns: CheckInEntry[];
  currentStack: string[];
  savedStackNames: string[];
  conversationHistory: ChatMessage[];
}

// ─── Dose Logging & Protocol Tracking ─────────────────────────────────────────

export type AdministrationRoute =
  | 'subcutaneous'
  | 'intramuscular'
  | 'oral'
  | 'nasal'
  | 'topical'
  | 'sublingual'
  | 'other';

export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'ml';

export interface DoseLogEntry {
  id: string;
  peptideId: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:mm
  amount: number;
  unit: DoseUnit;
  route: AdministrationRoute;
  injectionSite?: string; // e.g., "abdomen left", "deltoid right"
  batchNumber?: string;
  notes?: string;
  createdAt: string;
}

export type ProtocolFrequency =
  | 'daily'
  | 'twice_daily'
  | 'eod'            // every other day
  | 'tiw'            // 3x/week
  | 'biw'            // 2x/week
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

/**
 * One row of a structured titration ladder. Models the common
 * "Week N: X mg, Z×/week" pattern from peptidedosagescalculator.com /
 * peptideprotocolportal.com / FDA labels for GLP-1s, GH peptides,
 * and other titrated compounds.
 *
 * `weekStart` is the first week of the step (1-indexed). `weekEnd`
 * is omitted for the final maintenance step (open-ended).
 */
export interface TitrationStep {
  weekStart: number;
  weekEnd?: number;             // omit for the maintenance/final step
  dose: number;
  unit: DoseUnit;
  /** How often per week the dose is taken at this step. */
  frequency: ProtocolFrequency;
  frequencyLabel: string;        // e.g. "Once weekly", "Daily"
  /** One-line note for this step — e.g. "GI side-effects most likely here". */
  note?: string;
}

export interface ProtocolTemplate {
  id: string;
  peptideId: string;
  name: string;
  typicalDose: { min: number; max: number; unit: DoseUnit };
  route: AdministrationRoute;
  frequency: ProtocolFrequency;
  frequencyLabel: string;
  durationWeeks: { min: number; max: number };
  timing?: string;         // e.g., "before bed", "morning fasted"
  storageNotes: string;
  reconstitutionNotes?: string;
  importantNotes: string[];
  contraindications?: string[];  // conditions/situations where this peptide should NOT be used
  cautionConditions?: string[];  // conditions requiring extra monitoring
  source: string;          // "published research" | "common practice"
  /**
   * Optional structured week-by-week dose ladder. Populated for peptides
   * that are titrated up over several weeks (GLP-1s, GH releasers, etc.).
   * Absence means the protocol is constant-dose — render the typicalDose
   * range instead of a ladder.
   */
  titrationSchedule?: TitrationStep[];
}

export interface ActiveProtocol {
  id: string;
  peptideId: string;
  templateId?: string;     // links to ProtocolTemplate
  dose: number;
  unit: DoseUnit;
  route: AdministrationRoute;
  frequency: ProtocolFrequency;
  startDate: string;
  endDate?: string;        // planned end
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

// ─── Enhanced Journal / Effect Tracking ───────────────────────────────────────

export type EffectSentiment = 'positive' | 'neutral' | 'negative';

export interface PeptideEffect {
  peptideId: string;
  effect: string;          // free-text: "appetite suppressed", "injection site redness"
  sentiment: EffectSentiment;
  severity?: CheckInRating; // 1-5 intensity
}

export interface EnhancedCheckIn extends CheckInEntry {
  peptideEffects: PeptideEffect[];
  overallFeeling: string;         // free-text how they feel today
  sideEffects?: string[];         // list of reported side effects
  symptomFlags?: SymptomFlag[];   // concerning patterns
}

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';

export interface SymptomFlag {
  symptom: string;
  severity: SymptomSeverity;
  relatedPeptideId?: string;
  recommendation: string;   // what the app suggests
}

// ─── Health Alerts ────────────────────────────────────────────────────────────

export type AlertLevel = 'info' | 'caution' | 'warning' | 'urgent';

export interface HealthAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  triggeredBy: string;     // what data triggered this
  actionLabel: string;     // "Talk to your doctor", "Review your protocol"
  dismissed: boolean;
  createdAt: string;
}

// ─── Updated Bot Context ─────────────────────────────────────────────────────

export interface EnhancedBotContext extends BotContext {
  recentDoses: DoseLogEntry[];
  activeProtocols: ActiveProtocol[];
  recentEffects: PeptideEffect[];
  healthAlerts: HealthAlert[];
  healthProfile: HealthProfile | null;
  /**
   * When true, Aimee responds in plain language with short paragraphs and
   * no headers / bullet lists. Toggleable from the chat header.
   */
  simpleMode?: boolean;
}

// ─── Comprehensive Health Profile ─────────────────────────────────────────────

export type BiologicalSex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietType =
  | 'no_restriction'
  | 'keto'
  | 'paleo'
  | 'vegetarian'
  | 'vegan'
  | 'mediterranean'
  | 'carnivore'
  | 'intermittent_fasting'
  | 'other';

export type SleepPattern = 'early_bird' | 'night_owl' | 'irregular' | 'shift_work';

export type GoalType =
  | 'weight_loss'
  | 'muscle_gain'
  | 'body_recomp'
  | 'recovery'
  | 'longevity'
  | 'cognitive'
  | 'sleep'
  | 'energy'
  | 'immune'
  | 'gut_health'
  | 'skin_hair'
  | 'hormonal'
  | 'general_wellness';

export type ConnectedDevice =
  | 'apple_watch'
  | 'apple_health'
  | 'google_fit'
  | 'fitbit'
  | 'whoop'
  | 'oura'
  | 'garmin'
  | 'samsung_health'
  | 'other';

export interface BodyMetrics {
  weightLbs?: number;
  heightInches?: number;
  bodyFatPercent?: number;
  waistInches?: number;
  goalWeightLbs?: number;
}

export interface MedicalHistory {
  conditions: string[];           // "diabetes", "hypertension", "thyroid", etc.
  medications: string[];          // current medications
  allergies: string[];            // drug/food/environmental allergies
  allergenNotes?: string;         // free-text detail
  surgeries?: string[];           // relevant surgical history
  familyHistory?: string[];       // "heart disease", "diabetes", "cancer"
  pregnantOrNursing?: boolean;
  hasProviderSupervision: boolean; // are they working with a doctor?
  providerNotes?: string;         // who/where
}

export interface NutritionProfile {
  dietType: DietType;
  dietNotes?: string;
  dailyCalorieTarget?: number;
  dailyProteinGrams?: number;
  dailyWaterOz?: number;
  supplementsUsed: string[];      // "creatine", "vitamin D", "magnesium", etc.
  foodAllergies: string[];        // "gluten", "dairy", "shellfish", etc.
  mealsPerDay?: number;
  fastingWindow?: string;         // e.g., "16:8", "20:4"
}

export interface SleepProfile {
  averageHours?: number;
  sleepPattern: SleepPattern;
  bedtime?: string;               // "22:00"
  wakeTime?: string;              // "06:00"
  sleepIssues: string[];          // "insomnia", "apnea", "restless legs", etc.
  usesSleepAids: boolean;
  sleepAidNotes?: string;
}

export interface LifestyleProfile {
  activityLevel: ActivityLevel;
  exerciseFrequency?: number;     // days per week
  exerciseTypes: string[];        // "weight training", "cardio", "yoga", etc.
  occupation?: string;
  stressSources: string[];        // "work", "financial", "relationship", etc.
  smokingStatus: 'never' | 'former' | 'current';
  alcoholFrequency: 'never' | 'rarely' | 'moderate' | 'frequent';
}

export interface DeviceConnections {
  connectedDevices: ConnectedDevice[];
  primaryDevice?: ConnectedDevice;
  healthKitEnabled: boolean;
  googleFitEnabled: boolean;
}

/**
 * Optional cycle tracking for users with a menstrual cycle.
 * Only meaningful when `biologicalSex === 'female'`.
 */
export interface CycleTracking {
  /** Date of last period start (YYYY-MM-DD). */
  lastPeriodStartDate?: string;
  /** User-reported typical cycle length. Default 28 days if unset. */
  typicalCycleLength?: number;
  /** User-reported typical period duration in days. Default 5 if unset. */
  typicalPeriodLength?: number;
  /** Explicit opt-in so the feature stays hidden for users who don't track. */
  trackingEnabled?: boolean;
}

export interface HealthProfile {
  // Basic demographics (extends onboarding)
  biologicalSex?: BiologicalSex;
  dateOfBirth?: string;           // YYYY-MM-DD for accurate age calc
  bodyMetrics: BodyMetrics;

  // Health background
  medical: MedicalHistory;

  // Cycle tracking (female users who opt in)
  cycle?: CycleTracking;

  // Lifestyle pillars
  nutrition: NutritionProfile;
  sleep: SleepProfile;
  lifestyle: LifestyleProfile;

  // Connected devices
  devices: DeviceConnections;

  // Goals
  primaryGoals: GoalType[];
  secondaryGoals: GoalType[];
  /** Free-text goal expansion captured at onboarding ("anything specific"). */
  goalNotes?: string;
  /** What the user said they wished PepTalk had — feedback we read. */
  featureWish?: string;

  // Peptide experience
  peptideExperience: 'none' | 'beginner' | 'intermediate' | 'experienced';
  currentPeptides: string[];      // peptide IDs they're currently using
  pastPeptides: string[];         // peptide IDs they've used before

  // Consent
  aiDataConsent: boolean;         // user consents to send health data to cloud AI

  // Meta
  profileCompleteness: number;    // 0-100 percentage
  lastUpdated: string;
  setupComplete: boolean;
}

// ─── Educational & Media Content ─────────────────────────────────────────────

export type ArticleCategory = 'fundamentals' | 'safety' | 'production' | 'testing' | 'regulation' | 'delivery';

export interface EducationalArticle {
  id: string;
  title: string;
  slug: string;
  category: ArticleCategory;
  summary: string;
  imageUrl?: string;
  sections: { heading: string; content: string }[];
  citations: { text: string; url?: string }[];
  relatedPeptideIds?: string[];
  /**
   * Goals this article is most relevant to. Optional — articles without
   * a goal tag show under "All" and any goal-filtered view that doesn't
   * narrow further. Lets the Learn tab filter by user goal.
   */
  goalTypes?: GoalType[];
  lastUpdated: string;
}

export type VideoCategory = 'success_stories' | 'how_to' | 'research' | 'education';

export interface VideoContent {
  id: string;
  title: string;
  slug: string;
  category: VideoCategory;
  description: string;
  thumbnailUrl?: string;
  videoUrl: string;
  duration?: string;
  tags: string[];
  relatedPeptideIds?: string[];
  featured?: boolean;
  publishedAt: string;
}

export type GuideCategory = 'reconstitution' | 'injection' | 'storage' | 'dosing' | 'testing' | 'general';

export interface HowToGuide {
  id: string;
  title: string;
  slug: string;
  category: GuideCategory;
  summary: string;
  steps: { stepNumber: number; title: string; content: string; imageUrl?: string }[];
  warnings?: string[];
  relatedPeptideIds?: string[];
  relatedVideoId?: string;
  lastUpdated: string;
}

// ─── Knowledge Topics (Interactive Learn Section) ────────────────────────────

export type TopicId =
  | 'peptide-care'
  | 'how-to-use'
  | 'safety'
  | 'storage'
  | 'buying-quality'
  | 'regulations';

export interface KnowledgeTopic {
  id: TopicId;
  title: string;
  icon: string; // Ionicons name
  subtitle: string;
  color: string; // Accent color for the topic
  sections: {
    question: string;
    answer: string;
  }[];
  relatedGuideIds?: string[];
  relatedArticleIds?: string[];
  botPrompt: string; // Pre-filled prompt for "Ask PepTalk"
}

// ─── Safety & Clinical Data ──────────────────────────────────────────────────

export interface SafetyProfile {
  peptideId: string;
  contraindications: string[];
  seriousAdverseEffects: string[];
  commonSideEffects: string[];
  drugInteractions: { drug: string; severity: 'mild' | 'moderate' | 'severe'; mechanism: string }[];
  pregnancyCategory?: string;
  monitoringRequired?: string[];
  blackBoxWarnings?: string[];
}

export interface ClinicalTrial {
  peptideId: string;
  name: string;
  nctId?: string;
  phase: string;
  status: string;
  enrollment?: number;
  primaryEndpoint?: string;
  keyFindings?: string;
  publicationDOI?: string;
  publicationPMID?: string;
}

// ─── Notification Preferences ─────────────────────────────────────────────────

export interface NotificationPreferences {
  enabled: boolean;
  dailyCheckInReminder: boolean;
  checkInReminderTime: string; // HH:mm
  doseReminders: boolean;
  weeklyReport: boolean;
  workoutReminderEnabled: boolean;
  workoutReminderTime: string; // HH:mm
  workoutReminderDays: number[]; // Expo weekday numbers: 1=Sun … 7=Sat
  mealRemindersEnabled: boolean;
  mealReminderTimes: Record<string, string>; // e.g. { breakfast: '07:00', lunch: '12:00', dinner: '18:00' }
  weeklyReportEnabled: boolean;
}

// ─── Nutrition Consultation Request ───────────────────────────────────────────

export type ConsultationStatus = 'draft' | 'submitted' | 'reviewed';

export interface NutritionRequest {
  id: string;
  date: string;
  name: string;
  email: string;
  phone?: string;
  healthSummary: string;
  goals: string[];
  dietaryRestrictions: string[];
  currentPeptides: string[];
  message: string;
  status: ConsultationStatus;
  createdAt: string;
}

// ─── Medical Journal ────────────────────────────────────────────────────────

export type JournalCategory =
  | 'protocol_notes'
  | 'side_effects'
  | 'mood'
  | 'progress'
  | 'research'
  | 'questions'
  | 'goals'
  | 'general';

export interface JournalEntry {
  id: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:mm
  category: JournalCategory;
  title: string;
  content: string;
  tags: string[];
  relatedPeptideIds?: string[];
  mood?: CheckInRating;
  createdAt: string;
}

// ─── Health Plans ─────────────────────────────────────────────────────────────

export interface HealthPlanItem {
  id: string;
  dayOfWeek: number;      // 0=Sun, 1=Mon...6=Sat
  time: string;           // HH:mm
  type: 'workout' | 'meal' | 'protocol' | 'checkin' | 'custom';
  title: string;
  description: string;
  relatedId?: string;     // programId, peptideId, etc.
  completed: boolean;
}

export interface HealthPlan {
  id: string;
  name: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  goals: GoalType[];
  schedule: HealthPlanItem[];
  aiGenerated: boolean;
  rawPlanText?: string;   // Full AI-generated plan text
  createdAt: string;
  updatedAt: string;
}
