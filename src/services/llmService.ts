/**
 * LLM Service — Aimee AI for PepTalk.
 *
 * Two modes:
 *   1. Server-side (recommended): Calls Supabase Edge Function which proxies
 *      to OpenAI/Grok. API key stays server-side, rate limiting enforced.
 *   2. Client-side fallback: Direct API call if Edge Function unavailable
 *      (dev/testing only, requires EXPO_PUBLIC_XAI_API_KEY in .env).
 *
 * Privacy:
 * - Only sends health data if user has consented (aiDataConsent)
 * - Never sends user identifiers (name, email, user ID)
 * - System prompt is built fresh per request from local stores
 */

import OpenAI from 'openai';
import { ChatMessage, EnhancedBotContext } from '../types';
import { sanitizeForLLM } from './privacyGuard';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Fallback: direct API call — DEV ONLY. Production builds must route all
// traffic through the Supabase Edge Function so the XAI key stays server-
// side. We still read the env var because Metro bundles whatever is set
// at build time; the real protection is NOT setting
// EXPO_PUBLIC_XAI_API_KEY for production EAS profiles. The `__DEV__` gates
// below are defense-in-depth in case someone ships a misconfigured build.
const XAI_API_KEY = __DEV__ ? (process.env.EXPO_PUBLIC_XAI_API_KEY ?? '') : '';
const MODEL = 'grok-4-1-fast-reasoning';
const TIMEOUT_MS = 30_000;

// Lazy-init the OpenAI client (avoid creating at import time)
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  // Hard-stop: never instantiate the direct-API client off a dev build.
  // If we ever get here in production, the fallback gate has been
  // bypassed and we want to fail loudly rather than leak a key.
  if (!__DEV__) {
    throw new Error('[llmService] Direct XAI client is dev-only; route via Supabase Edge Function in production.');
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: XAI_API_KEY || 'dummy',
      baseURL: 'https://api.x.ai/v1',
      timeout: TIMEOUT_MS,
      dangerouslyAllowBrowser: true,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Compressed peptide database for system prompt
// ---------------------------------------------------------------------------

function buildPeptideKnowledgeBase(): string {
  // Lazy-require data files — only loaded when Aimee is first used, not at app startup
  const { PEPTIDES } = require('../data/peptides');
  const { PROTOCOL_TEMPLATES } = require('../data/protocols');
  const { KNOWLEDGE_TOPICS } = require('../data/knowledgeTopics');
  const { SAFETY_PROFILES } = require('../data/safetyProfiles');

  const lines: string[] = [];

  // Compact peptide list: name | categories | mechanism snippet | half-life
  PEPTIDES.forEach((p: any) => {
    const cats = p.categories.join(', ');
    const mech = p.mechanismOfAction.substring(0, 120);
    const hl = p.halfLife || '?';
    lines.push(`- ${p.name} (${p.abbreviation || p.id}) | ${cats} | ${mech}... | t½: ${hl}`);
  });

  // Compact protocol list: peptide | dose range | route | frequency | timing
  const protoLines: string[] = [];
  PROTOCOL_TEMPLATES.forEach((t: any) => {
    const dose = `${t.typicalDose.min}-${t.typicalDose.max} ${t.typicalDose.unit}`;
    const contra = t.contraindications?.length
      ? ` | CONTRA: ${t.contraindications.join(', ')}`
      : '';
    protoLines.push(
      `- ${t.name}: ${dose} ${t.route} ${t.frequencyLabel}${t.timing ? ` (${t.timing})` : ''}${contra}`
    );
  });

  // Compact knowledge topics: question → answer snippet for care, safety, storage, etc.
  const topicLines: string[] = [];
  KNOWLEDGE_TOPICS.forEach((topic: any) => {
    topicLines.push(`\n[${topic.title.toUpperCase()}]`);
    topic.sections.forEach((s: any) => {
      topicLines.push(`Q: ${s.question}\nA: ${s.answer.substring(0, 200)}...`);
    });
  });

  // Compact safety profiles: contraindications, black box warnings, key interactions
  const safetyLines: string[] = [];
  SAFETY_PROFILES.forEach((sp: any) => {
    const bbw = sp.blackBoxWarnings?.length ? ` | BBW: ${sp.blackBoxWarnings[0].substring(0, 80)}` : '';
    const contra = sp.contraindications.slice(0, 3).join('; ');
    const interactions = sp.drugInteractions
      .filter((d: any) => d.severity === 'severe')
      .map((d: any) => d.drug)
      .join(', ');
    safetyLines.push(
      `- ${sp.peptideId}: CONTRA: ${contra}${interactions ? ` | SEVERE IX: ${interactions}` : ''}${bbw}`
    );
  });

  return [
    'PEPTIDE DATABASE (' + PEPTIDES.length + ' peptides):',
    ...lines,
    '',
    'PROTOCOL TEMPLATES (' + PROTOCOL_TEMPLATES.length + '):',
    ...protoLines,
    '',
    'SAFETY PROFILES (' + SAFETY_PROFILES.length + '):',
    ...safetyLines,
    '',
    'KNOWLEDGE BASE (care, safety, storage, quality, regulations):',
    ...topicLines,
  ].join('\n');
}

// Cache the knowledge base (it doesn't change at runtime)
let _knowledgeBase: string | null = null;
function getKnowledgeBase(): string {
  if (!_knowledgeBase) _knowledgeBase = buildPeptideKnowledgeBase();
  return _knowledgeBase;
}

/**
 * Build the knowledge base ahead of the first chat message so the user
 * doesn't eat the ~100ms concat cost when they send their first prompt.
 * Call this once at boot, deferred until after interactions so we don't
 * compete with splash / first paint.
 *
 * Safe to call repeatedly — the underlying cache is a no-op after the
 * first successful build.
 */
export function warmKnowledgeBase(): void {
  if (_knowledgeBase) return;
  try {
    // Defer until after first frame so this can't contend with UI work.
    const { InteractionManager } = require('react-native');
    InteractionManager.runAfterInteractions(() => {
      try {
        if (!_knowledgeBase) _knowledgeBase = buildPeptideKnowledgeBase();
      } catch (err) {
        if (__DEV__) console.warn('[llmService] warmKnowledgeBase build failed:', err);
      }
    });
  } catch (err) {
    if (__DEV__) console.warn('[llmService] warmKnowledgeBase schedule failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Server-side context payload
// ---------------------------------------------------------------------------
//
// What we send to the aimee-chat edge function. All free-form text is
// pre-summarized client-side — the server NEVER receives raw user input
// for the system prompt. The full prompt is rebuilt server-side from the
// hardcoded safety preamble + these summary fields.

interface AimeeServerContext {
  hasConsent: boolean;
  simpleMode: boolean;
  activeProtocolSummary?: string;
  recentDosesSummary?: string;
  healthAlertsSummary?: string;
  healthProfileSummary?: string;
  /** Last-7-day biometrics rollup — steps avg, sleep avg, HRV avg, RHR avg.
   *  Lets Aimee answer "how's my recovery been?" with real data instead of
   *  generic advice. Pre-summarized client-side; server never sees raw rows. */
  biometricsSummary?: string;
  /** Most-recent lab values (HDL, LDL, HbA1c, T, etc.) — semicolon-joined.
   *  Empty when the user hasn't entered any. */
  labResultsSummary?: string;
  /** Recent workout activity — sessions in last 7 days, avg duration,
   *  most-used split. Lets Aimee answer "should I rest?" / "build me a
   *  push day" with their actual training context. */
  workoutSummary?: string;
  /** Recent nutrition rollup — avg daily calories + protein vs targets,
   *  hit-rate. */
  nutritionSummary?: string;
  /** Body-composition delta over the last 4 weeks (weight, body fat).
   *  Empty when no readings exist yet. */
  bodyTrendSummary?: string;
  /** Onboarding free-text: user's "main goal in their own words" + their
   *  workout-days-per-week answer. Captured at signup so Aimee can ground
   *  recommendations in stated intent. */
  selfStatedGoal?: string;
  workoutDaysPerWeek?: number;
  currentRoute?: string;
}

function buildServerContext(context: EnhancedBotContext): AimeeServerContext {
  const { hasConsent } = sanitizeForLLM(context);

  const protoNames = (context.activeProtocols ?? [])
    .slice(0, 5)
    .map((p) => (p as { name?: string; peptideName?: string }).name ?? (p as { peptideName?: string }).peptideName ?? '')
    .filter(Boolean)
    .join(', ');

  const recentDoseCount = context.recentDoses?.length ?? 0;
  const lastDose = context.recentDoses?.[0];
  const recentDosesSummary = recentDoseCount > 0
    ? `${recentDoseCount} doses in the last 14 days; most recent ${(lastDose as any)?.peptideName ?? 'unknown'} on ${(lastDose as any)?.date ?? 'unknown date'}`
    : undefined;

  const alertCount = context.healthAlerts?.length ?? 0;
  const healthAlertsSummary = alertCount > 0
    ? `${alertCount} active health alert${alertCount === 1 ? '' : 's'}`
    : undefined;

  const profile = context.healthProfile;
  const healthProfileSummary = profile
    ? [
        (profile as any).biologicalSex,
        (profile as any).age ? `age ${(profile as any).age}` : null,
        (profile as any).pregnant ? 'pregnant' : null,
        (profile as any).nursing ? 'nursing' : null,
      ].filter(Boolean).join(', ')
    : undefined;

  // 7-day biometrics rollup. Pulled here at context-build time so Aimee
  // can answer "how's my recovery been?" with the user's real numbers
  // (steps, sleep, HRV, RHR) instead of generic advice.
  let biometricsSummary: string | undefined;
  try {
    const { useBiometricsStore } = require('../store/useBiometricsStore');
    const store = useBiometricsStore.getState();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const totalSteps = store.sumScopeInRange?.('steps', weekAgo, today) ?? 0;
    const avgSteps = totalSteps > 0 ? Math.round(totalSteps / 7) : 0;
    const avgSleepMin = store.avgScopeInRange?.('sleep_minutes', weekAgo, today);
    const avgHrv = store.avgScopeInRange?.('hrv', weekAgo, today);
    const avgRhr = store.avgScopeInRange?.('resting_heart_rate', weekAgo, today);
    const parts: string[] = [];
    if (avgSteps > 0) parts.push(`~${avgSteps.toLocaleString()} steps/day`);
    if (avgSleepMin && !isNaN(avgSleepMin)) {
      const h = Math.floor(avgSleepMin / 60);
      const m = Math.round(avgSleepMin % 60);
      parts.push(`avg sleep ${h}h${m > 0 ? ` ${m}m` : ''}`);
    }
    if (avgHrv && !isNaN(avgHrv)) parts.push(`avg HRV ${Math.round(avgHrv)}ms`);
    if (avgRhr && !isNaN(avgRhr)) parts.push(`avg RHR ${Math.round(avgRhr)}bpm`);
    biometricsSummary = parts.length > 0 ? `Last 7 days: ${parts.join(', ')}` : undefined;
  } catch {
    biometricsSummary = undefined;
  }

  // Lab results — recent bloodwork values the user manually entered.
  // Aimee uses this to answer "is my LDL high?" with the real number.
  let labResultsSummary: string | undefined;
  try {
    const { useLabResultsStore } = require('../store/useLabResultsStore');
    labResultsSummary = useLabResultsStore.getState().summarizeForAimee?.();
  } catch {
    labResultsSummary = undefined;
  }

  // 7-day workout summary — sessions count, avg duration, last name.
  // Powers Aimee's "should I rest" / "build me a push day" answers.
  let workoutSummary: string | undefined;
  try {
    const { useWorkoutStore } = require('../store/useWorkoutStore');
    const wStore = useWorkoutStore.getState();
    const since = new Date(Date.now() - 7 * 86_400_000);
    const recent = (wStore.logs ?? []).filter(
      (l: any) => new Date(l.completedAt ?? l.startedAt).getTime() >= since.getTime(),
    );
    if (recent.length > 0) {
      const avgDuration = Math.round(
        recent.reduce((acc: number, l: any) => acc + (l.durationMinutes ?? 0), 0) / recent.length,
      );
      const lastName = (recent[0] as any).workoutName ?? 'workout';
      workoutSummary = `${recent.length} session${recent.length === 1 ? '' : 's'} in last 7 days, avg ${avgDuration} min, most recent: ${lastName}`;
    }
  } catch {
    workoutSummary = undefined;
  }

  // 7-day nutrition rollup — avg daily calories, protein, target hit.
  let nutritionSummary: string | undefined;
  try {
    const { useMealStore } = require('../store/useMealStore');
    const mStore = useMealStore.getState();
    const meals = (mStore.meals ?? []).filter((m: any) => {
      const d = new Date(m.date ?? m.timestamp ?? Date.now());
      return Date.now() - d.getTime() <= 7 * 86_400_000;
    });
    if (meals.length > 0) {
      const totalCal = meals.reduce((acc: number, m: any) => {
        const fromQuick = m.quickLog?.calories ?? 0;
        const fromFoods = (m.foods ?? []).reduce(
          (a: number, f: any) => a + (f.calories ?? 0),
          0,
        );
        return acc + fromQuick + fromFoods;
      }, 0);
      const totalPro = meals.reduce((acc: number, m: any) => {
        const fromQuick = m.quickLog?.proteinGrams ?? 0;
        const fromFoods = (m.foods ?? []).reduce(
          (a: number, f: any) => a + (f.proteinGrams ?? 0),
          0,
        );
        return acc + fromQuick + fromFoods;
      }, 0);
      const avgCal = Math.round(totalCal / 7);
      const avgPro = Math.round(totalPro / 7);
      const targets = mStore.targets ?? {};
      const hits: string[] = [];
      if (avgCal > 0) hits.push(`~${avgCal} cal/day`);
      if (avgPro > 0) hits.push(`~${avgPro}g protein/day`);
      if (targets.calories && avgCal > 0) {
        const pct = Math.round((avgCal / targets.calories) * 100);
        hits.push(`${pct}% of cal target`);
      }
      nutritionSummary = hits.length > 0 ? `Last 7 days: ${hits.join(', ')}` : undefined;
    }
  } catch {
    nutritionSummary = undefined;
  }

  // 4-week body-comp delta — weight + body fat trend.
  let bodyTrendSummary: string | undefined;
  try {
    const { useBiometricsStore } = require('../store/useBiometricsStore');
    const store = useBiometricsStore.getState();
    const weights = (store.readings ?? [])
      .filter((r: any) => r.scope === 'weight')
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    const fourWeeksAgo = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
    const start = weights.find((r: any) => r.date >= fourWeeksAgo);
    const end = weights[weights.length - 1];
    if (start && end && start !== end) {
      const delta = end.value - start.value;
      const sign = delta > 0 ? '+' : '';
      bodyTrendSummary = `Weight ${sign}${delta.toFixed(1)} ${end.unit} over ~4 weeks`;
    }
  } catch {
    bodyTrendSummary = undefined;
  }

  // Free-text onboarding answers — "main goal" + workout-days-per-week.
  // The free-text "in your own words" goal is more useful to Aimee than
  // the chip-selected GoalType array.
  let selfStatedGoal: string | undefined;
  let workoutDaysPerWeek: number | undefined;
  try {
    const { useHealthProfileStore } = require('../store/useHealthProfileStore');
    const hp = useHealthProfileStore.getState().profile;
    selfStatedGoal = hp?.goalNotes?.trim() || undefined;
    workoutDaysPerWeek = hp?.lifestyle?.exerciseFrequency;
  } catch {
    /* ignore */
  }

  return {
    hasConsent,
    simpleMode: context.simpleMode === true,
    activeProtocolSummary: protoNames || undefined,
    recentDosesSummary,
    healthAlertsSummary,
    healthProfileSummary: healthProfileSummary || undefined,
    biometricsSummary,
    labResultsSummary,
    workoutSummary,
    nutritionSummary,
    bodyTrendSummary,
    selfStatedGoal,
    workoutDaysPerWeek,
  };
}

// ---------------------------------------------------------------------------
// Local-fallback system prompt (used ONLY when the edge function is down
// and we fall through to the local intent-detection bot inside this file).
// Production Aimee always uses the server-side prompt in
// supabase/functions/aimee-chat/_prompt.ts — keep in lockstep when editing.
// ---------------------------------------------------------------------------

function buildSystemPrompt(context: EnhancedBotContext): string {
  const { hasConsent, systemContext } = sanitizeForLLM(context);

  const simpleModePreamble = context.simpleMode
    ? `\n\nKEEP IT SIMPLE MODE IS ON. Strict output rules for THIS conversation:
- Reply in 2 short paragraphs maximum.
- No bullet lists, no headers, no markdown.
- Plain conversational language. Aim for "Muscle growth, muscle recovery" level — short, direct, jargon-free.
- Still include the QUICK_REPLIES suffix and NAV_ACTION/DATA_ACTION tags when relevant.\n`
    : '';

  return `You are Aimee, the AI health & wellness assistant in the PepTalk app. You help users with peptide research, workout planning, nutrition, health tracking, and understanding their lab results. You are knowledgeable, encouraging, and safety-first.${simpleModePreamble}

CRITICAL MEDICAL RULES (NEVER BREAK THESE):
- You are NOT a doctor, nurse, nutritionist, or any kind of licensed healthcare provider.
- You NEVER diagnose conditions, prescribe medications, treat illness, or give direct medical instructions.
- For ANY direct health question (symptoms, "is this normal?", "should I take X for Y?", dosing for a specific person's condition, lab result interpretation as it applies to them personally, anything that sounds like asking for medical advice), you MUST decline to answer directly and redirect them to a licensed professional. Use phrases like:
  * "That's a question for your doctor or healthcare provider."
  * "I can share what the research says, but the decision about YOUR body needs to go through a medical professional."
  * "Please bring this to your physician — they can see your full picture."
- You CAN share published research, explain general mechanisms of peptides, describe what lab markers mean factually in the general population, and discuss health optimization concepts — all framed as EDUCATION, not medical advice.
- You MUST NOT recommend specific doses for the user's body, condition, or situation. General ranges from published literature are OK; personalized dosing decisions require a clinician.
- PepTalk does NOT offer consultations, bookings, or appointments. Never tell a user they can book with Jamie, a nutritionist, or any provider through the app. If they want 1-on-1 help, tell them to find their own licensed provider.
- If someone describes emergency symptoms (chest pain, severe allergic reaction, suicidal ideation, etc.), tell them to call 911 or go to the ER immediately.
- Never encourage purchasing peptides from unverified sources.
- If the user's profile indicates pregnancy/nursing, flag it prominently and urge them to consult their OB/GYN before anything.

WHAT YOU CAN DO:
- Answer questions about peptides: mechanisms, research, storage, quality, regulations
- Explain what lab results mean (factually) and how they relate to tracked health data
- Build workout plans using the exercise database (289 exercises with muscle groups, difficulty, equipment)
- Create meal plans and suggest foods based on macro targets
- Help users build peptide stacks — flag which peptides denature each other, which have synergy
- Navigate users to screens in the app (add ---NAV_ACTION--- tags, see below)
- Log data to the health calendar (add ---DATA_ACTION--- tags, see below)

PEPTIDE TRACKING & PERFORMANCE:
- Track which peptides the user is taking (from their dose logs)
- Correlate peptide usage with their health data over time: weight trends, sleep quality, energy levels, mood, recovery scores
- When a user asks "is [peptide] working?", look at their tracked data before/after starting it
- Suggest adjustments based on data patterns (e.g., "Your sleep quality improved 20% since starting DSIP")
- Monitor for side effects by correlating side effect tags with peptide timing
- Remind users about cycling schedules based on their active protocols

NUTRITION & FOOD:
- Know the user's macro targets from their profile
- Track what they're eating and suggest improvements
- Recommend foods that support their peptide goals (e.g., protein for GH peptides, anti-inflammatory for BPC-157)
- Suggest meal timing around peptide protocols (e.g., "Take BPC-157 on empty stomach, eat 30 min later")

WORKOUT RECOMMENDATIONS:
- Know the user's fitness level, equipment, and goals
- Suggest exercises and programs that complement their peptide protocols
- Recovery peptides → suggest appropriate training intensity
- GH peptides → suggest strength training to maximize results
- Weight loss peptides → suggest appropriate cardio/HIIT programming

SIMPLIFIED DOSING:
- When a user asks about a peptide, provide ALL practical info in one response:
  1. What it does (1-2 sentences)
  2. Typical dose range for their body weight
  3. How to reconstitute (specific: "Add 2ml BAC water to 5mg vial = 250mcg per 0.1ml")
  4. How to inject (route, site, technique brief)
  5. When to take it (timing, with/without food)
  6. How long to use (cycling schedule)
  7. What to watch for (common side effects)
- Make it simple and actionable — they should be able to read your response and know exactly what to do
- Always end dosing info with: "Confirm this protocol with your healthcare provider before starting"

STACK BUILDER KNOWLEDGE:
- You know which peptides are compatible, which denature each other, and which have synergy
- The stack builder is a RESEARCH and DISCOVERY tool — users explore and learn, not get prescriptions
- When suggesting stacks, always explain WHY certain peptides work together (mechanism-level)
- Flag known interactions from the SAFETY PROFILES section below
- Suggest stacks based on the user's stated health goals (fat loss, recovery, sleep, cognition, etc.)

WORKOUT KNOWLEDGE:
- 451 exercises organized by: muscle group, priority (P1=core compounds, P2=secondary, P3=isolation, P4=specialized), difficulty, location (home/gym/any), gender suitability, metrics (reps/weight/duration)
- 21 program templates available:
  FEMALE: Transformation (3/4/5 day), Weight Loss (3/4/5 day), 30min FIT (3/4/5 day)
  MALE: Hypertrophy (3/4/5 day), Strength (3/4/5 day), Aerobic/WOD (3/4/5 day), Body Recomp (3/4/5 day)
  ANYONE: 30min FIT (3/4/5 day)

MALE PROGRAM PARAMETERS:
- Hypertrophy: 10-12 reps, 3-4 sets, 30-45 sec rest, supersets, focus on pump and volume
- Strength: 6-8 reps, 3-6 sets, 90-120 sec rest, normal sets, heavy compounds only (P1)
- Aerobic/WOD: AMRAP, circuits, 15-20 sec rest, timed PRs, cardio between strength blocks
- Body Recomp: 10-12 reps like hypertrophy + cardio circuit blocks between muscle groups

FEMALE PROGRAM PARAMETERS (Jamie's):
- Transformation: 12-15 reps, 4 sets, 30 sec rest, supersets, full body splits
- Weight Loss: 12-15 reps, 4 sets, 30 sec rest, more circuit elements
- 30min FIT: circuit-style, fast-paced, any gender

PRIORITY DEFINITIONS BY MUSCLE:
- Core: P1=rep-based, P2=time-based
- Quads: P1=squats/leg press, P2=lunges/single-leg, P3=isolation
- Glutes: P1=thrusts/barbell squats, P2=banded/bodyweight
- Chest: P1=big presses, P2=flies, P3=machines/pushups/cables
- Back: P1=heavy compounds, P2=DB/cables/machines
- Shoulders: P1=presses, P2=raises/flies/machines
- Hamstrings: P1=deadlifts/RDL, P2=machines/cables

WORKOUT GENERATION:
- Templates define muscle + priority slots, exercises are randomly selected from the matching pool
- Every workout is unique — same structure, different exercises each time
- Users should track reps, weight, and duration during workouts for progress tracking

SLEEP DATA:
- You have access to the user's sleep data from Apple Watch or Google Health Connect
- Metrics: total sleep hours, deep sleep, REM sleep, core sleep, awake time
- Bedtime and wake time detection
- Sleep efficiency (time asleep / time in bed, target >85%)
- Sleep quality score (0-100, weighted: 40% deep, 30% REM, 20% efficiency, 10% duration)
- When discussing sleep, reference their actual data if available
- Good sleep targets: 7-9 hours total, 1-1.5 hours deep, 1.5-2 hours REM
- Poor sleep quality correlates with: higher cortisol, lower GH release, impaired recovery
- Peptide connections: DSIP for delta sleep, GH secretagogues work best during deep sleep, melatonin-related peptides

THIRD-PARTY SLEEP TRACKERS:
- If users mention Oura Ring, Whoop, Eight Sleep, Fitbit — explain that their data flows through Apple Health / Google Health Connect
- Most third-party trackers sync automatically to the phone's health platform
- Our app reads from HealthKit (iOS) or Health Connect (Android) which aggregates all sources

LAB WORK & BLOODWORK:
- You can explain what markers mean: testosterone, estrogen, thyroid (TSH, T3, T4), cortisol, insulin, A1C, lipid panels, CBC, CMP, vitamin D, B12, iron, liver enzymes, kidney function
- Explain normal ranges, what high/low values may indicate, and how they relate to the user's tracked health data
- ALWAYS end with "discuss these results with your doctor for personalized guidance"

${getKnowledgeBase()}
${systemContext}

RESPONSE FORMAT:
- Keep responses concise (2-4 paragraphs max)
- Use bullet points for lists
- End every response with "---QUICK_REPLIES---" followed by 2-3 follow-up suggestions (one per line, these become tappable buttons)

APP NAVIGATION (Pro tier only):
- If a user wants to go somewhere in the app, include a line: ---NAV_ACTION--- /route/path
- Available routes: /nutrition, /workouts, /workouts/exercises, /calculators, /calculators/dosing, /calculators/reconstitution, /body-map, /journal, /health-profile, /health-report, /subscription, /(tabs)/calendar, /(tabs)/check-in, /(tabs)/my-stacks, /(tabs)/peptalk
- Example: "Let me take you to the workout builder. ---NAV_ACTION--- /workouts/exercises"

DATA ACTIONS (Pro tier only):
- If a user wants to log something, include: ---DATA_ACTION--- {"type": "checkin"|"dose"|"meal"|"workout"|"reminder", "data": {...}}
- The user will see a confirmation prompt before any data is saved — you are SUGGESTING, not auto-saving
- Example for logging weight: ---DATA_ACTION--- {"type": "checkin", "data": {"weightLbs": 185}}
- Example for setting a reminder: ---DATA_ACTION--- {"type": "reminder", "data": {"title": "Take BPC-157", "time": "08:00", "frequency": "daily"}}

UPSELL BEHAVIOR:
- If the user is on the Free tier and asks about features that require Plus or Pro (workouts, meal plans, health tracking, stack builder), briefly answer their question then naturally mention: "With PepTalk+, I could help you build a full plan for this. Want to check out the upgrade options?" Include ---NAV_ACTION--- /subscription
- If the user is on Plus and asks about Pro features (workout videos, Aimee scheduling, meal plans), mention: "That's a Pro feature — I could build your full weekly plan with PepTalk Pro." Include ---NAV_ACTION--- /subscription
- Don't be pushy. Be helpful first, upsell naturally only when relevant.
- Never upsell Pro users.

${hasConsent ? 'The user has consented to personalized responses. Use their health profile, tracked data, and current protocols to give relevant, contextual answers. Flag contraindications based on their conditions/medications.' : 'The user has NOT consented to sharing health data. Give general research-based responses without personalization.'}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface ParsedResponse {
  content: string;
  quickReplies: string[];
  navAction?: string;
  dataAction?: { type: string; data: Record<string, unknown> };
}

/**
 * Pretty label + icon for a route — used to render the AI's NAV_ACTION
 * as a tappable BotAction button alongside the response, matching the
 * local-bot UX. Routes that aren't mapped fall back to the route as
 * the label and a generic chevron icon.
 */
function describeRoute(route: string): { label: string; icon: string } {
  const ROUTE_DESCRIPTIONS: Record<string, { label: string; icon: string }> = {
    '/(tabs)/calendar': { label: 'Open calendar', icon: 'calendar-outline' },
    '/(tabs)/check-in': { label: 'Daily check-in', icon: 'clipboard-outline' },
    '/(tabs)/peptalk': { label: 'Open Aimee', icon: 'chatbubbles-outline' },
    '/(tabs)/my-stacks': { label: 'My stacks', icon: 'flask-outline' },
    '/(tabs)/workouts': { label: 'Open workouts', icon: 'barbell-outline' },
    '/(tabs)/nutrition': { label: 'Open nutrition', icon: 'restaurant-outline' },
    '/(tabs)/profile': { label: 'Profile', icon: 'person-outline' },
    '/nutrition': { label: 'Nutrition', icon: 'restaurant-outline' },
    '/workouts': { label: 'Workouts', icon: 'barbell-outline' },
    '/workouts/exercises': { label: 'Browse exercises', icon: 'list-outline' },
    '/workouts/library': { label: 'Workout library', icon: 'play-circle-outline' },
    '/calculators': { label: 'Calculators', icon: 'calculator-outline' },
    '/calculators/dosing': { label: 'Dosing calculator', icon: 'calculator-outline' },
    '/calculators/reconstitution': { label: 'Reconstitution', icon: 'flask-outline' },
    '/calculators/plan': { label: 'Plan a cycle', icon: 'compass-outline' },
    '/cycle': { label: 'Cycle dashboard', icon: 'flower-outline' },
    '/journal': { label: 'Journal', icon: 'book-outline' },
    '/health-profile': { label: 'Health profile', icon: 'body-outline' },
    '/health-report': { label: 'Health report', icon: 'document-text-outline' },
    '/health-report/labs': { label: 'Lab results', icon: 'flask-outline' },
    '/subscription': { label: 'See plans', icon: 'sparkles-outline' },
    '/pantry': { label: 'My pantry', icon: 'basket-outline' },
    '/body-map': { label: 'Body map', icon: 'body-outline' },
  };
  return ROUTE_DESCRIPTIONS[route] ?? { label: 'Open', icon: 'arrow-forward' };
}

function parseResponse(raw: string): ParsedResponse {
  let text = raw;

  // Extract navigation action
  let navAction: string | undefined;
  const navMatch = text.match(/---NAV_ACTION---\s*(\S+)/);
  if (navMatch) {
    navAction = navMatch[1];
    text = text.replace(/---NAV_ACTION---\s*\S+/g, '').trim();
  }

  // Extract data action
  let dataAction: ParsedResponse['dataAction'];
  const dataMatch = text.match(/---DATA_ACTION---\s*(\{[\s\S]*?\})/);
  if (dataMatch) {
    try {
      dataAction = JSON.parse(dataMatch[1]);
    } catch {}
    text = text.replace(/---DATA_ACTION---\s*\{[\s\S]*?\}/g, '').trim();
  }

  // Extract quick replies
  const separator = '---QUICK_REPLIES---';
  const idx = text.indexOf(separator);
  let content = text;
  let quickReplies: string[] = [];

  if (idx !== -1) {
    content = text.substring(0, idx).trim();
    const repliesSection = text.substring(idx + separator.length).trim();
    quickReplies = repliesSection
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter((line) => line.length > 0 && line.length < 60)
      .slice(0, 3);
  }

  return { content, quickReplies, navAction, dataAction };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const uid = () =>
  `bot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

/**
 * Generate an AI response.
 * Tries Supabase Edge Function first (secure, rate-limited).
 * Falls back to direct API call in dev if edge function unavailable.
 */
export async function generateAIResponse(
  userMessage: string,
  context: EnhancedBotContext
): Promise<ChatMessage | null> {
  // Build conversation messages (last 10 for context)
  const conversationMessages = context.conversationHistory.slice(-10).map((msg) => ({
    role: msg.role === 'bot' ? 'assistant' as const : 'user' as const,
    content: msg.content,
  }));
  conversationMessages.push({ role: 'user' as const, content: userMessage });

  // The full system prompt is now built SERVER-SIDE in the aimee-chat edge
  // function (see supabase/functions/aimee-chat/_prompt.ts). We only send a
  // small context object here — never free-form prompt text — so a tampered
  // client cannot override the safety rules. buildSystemPrompt below is now
  // used only for the local fallback bot when the edge function is down.
  const serverContext = buildServerContext(context);
  let rawResponse: string | null = null;

  // ── Try Supabase Edge Function first ──
  if (SUPABASE_URL) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/aimee-chat`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({ messages: conversationMessages, context: serverContext }),
        });

        if (res.ok) {
          const data = await res.json();
          rawResponse = data.content;
        } else if (res.status === 403 || res.status === 429) {
          // Tier or rate limit — return the error message as bot response
          const data = await res.json();
          return {
            id: uid(),
            role: 'bot',
            content: data.error ?? 'Please upgrade to use Aimee AI.',
            timestamp: new Date().toISOString(),
            quickReplies: data.upgrade ? ['View subscription plans'] : undefined,
            navAction: data.upgrade ? '/subscription' : undefined,
            actions: data.upgrade
              ? [{ label: 'See plans', route: '/subscription', icon: 'sparkles-outline' }]
              : undefined,
          };
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[llmService] Edge function failed, trying direct:', e);
    }
  }

  // ── Fallback: Direct API call — DEV ONLY to avoid exposing key in production ──
  if (!rawResponse && __DEV__ && XAI_API_KEY) {
    try {
      // Dev-only direct call (no edge function in DEV without local supabase).
      // Uses the local-fallback prompt — production always goes through the
      // edge function with the server-side prompt + safety trailer.
      const devSystemPrompt = buildSystemPrompt(context);
      const completion = await getClient().chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: devSystemPrompt },
          ...conversationMessages as OpenAI.ChatCompletionMessageParam[],
        ],
        max_tokens: 1024,
        temperature: 0.7,
      });
      rawResponse = completion.choices[0]?.message?.content ?? null;
    } catch (error) {
      if (__DEV__) console.warn('[llmService] Direct API call failed:', error);
    }
  }

  if (!rawResponse) return null;

  const { content, quickReplies, navAction, dataAction } = parseResponse(rawResponse);

  // Convert NAV_ACTION into a tappable BotAction so the chat surfaces an
  // inline button matching the local-bot UX. Without this, NAV_ACTION
  // lived only on the (rarely-used) navAction field.
  const actions = navAction
    ? [(() => {
        const desc = describeRoute(navAction);
        return { label: desc.label, route: navAction, icon: desc.icon };
      })()]
    : undefined;

  return {
    id: uid(),
    role: 'bot',
    content,
    timestamp: new Date().toISOString(),
    quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
    actions,
    navAction,
    dataAction: dataAction as any,
  };
}

/**
 * Generate personalized recipes using the Grok API.
 */
export async function generateRecipe(params: {
  diet: string;
  mealType: string;
  preferences: string;
  targets: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number };
  /** User's allergens — pushed into the constraints list so the AI avoids them. */
  allergens?: string[];
}): Promise<Array<{
  name: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: string[];
  instructions: string[];
  macros: { calories: number; protein: number; carbs: number; fat: number };
}> | null> {
  const { diet, mealType, preferences, targets, allergens } = params;

  // ── Try server edge function first (production path — key stays server-side) ──
  if (SUPABASE_URL) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const constraints: string[] = [];
        if (diet && diet !== 'any') constraints.push(diet);
        if (preferences) constraints.push(preferences);
        // Allergens get pushed as strict "no X" entries so the AI avoids them.
        // Duplicate entries are fine — constraints are a free-form list.
        if (allergens && allergens.length > 0) {
          for (const a of allergens) {
            if (a.trim()) constraints.push(`strictly no ${a.trim()}`);
          }
        }

        const res = await fetch(`${SUPABASE_URL}/functions/v1/aimee-recipe`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({
            mealType,
            macroTargets: targets,
            constraints,
            count: 3,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.recipes)) {
            // Normalize shape to match legacy (ingredients/instructions/macros)
            return data.recipes.map((r: any) => ({
              name: r.name,
              description: r.description ?? '',
              prepMinutes: r.prepMinutes ?? 10,
              cookMinutes: r.cookMinutes ?? 15,
              servings: r.servings ?? 1,
              ingredients: r.ingredients ?? [],
              instructions: r.instructions ?? r.steps ?? [],
              macros: {
                calories: r.calories ?? r.macros?.calories ?? 0,
                protein: r.proteinGrams ?? r.macros?.protein ?? 0,
                carbs: r.carbsGrams ?? r.macros?.carbs ?? 0,
                fat: r.fatGrams ?? r.macros?.fat ?? 0,
              },
            }));
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[llmService] aimee-recipe edge fn failed, trying direct:', err);
    }
  }

  // ── Dev-only direct API fallback ──
  if (!__DEV__ || !XAI_API_KEY) return null;

  const prompt = `Generate 3 ${mealType} recipes for a ${diet === 'any' ? 'balanced' : diet} diet.

Daily macro targets: ${targets.calories} cal, ${targets.proteinGrams}g protein, ${targets.carbsGrams}g carbs, ${targets.fatGrams}g fat.
Each recipe should fit roughly 1/3 of these daily targets for a ${mealType} meal.
${preferences ? `Additional preferences: ${preferences}` : ''}

Return ONLY valid JSON, no markdown. Format:
[{
  "name": "Recipe Name",
  "description": "Short description",
  "prepMinutes": 15,
  "cookMinutes": 25,
  "servings": 1,
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["Step 1", "Step 2"],
  "macros": {"calories": 500, "protein": 40, "carbs": 50, "fat": 15}
}]`;

  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert and recipe creator. Generate practical, delicious recipes with accurate macro estimates. Return ONLY valid JSON arrays, no markdown code blocks.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    if (__DEV__) console.warn('[llmService] Recipe generation failed:', error);
    return null;
  }
}

/**
 * Generate an AI health plan (workout + meal + protocol schedule).
 */
export async function generateHealthPlan(params: {
  goals: string[];
  profile: string;
  currentPrograms: string[];
  duration: string;
}): Promise<string | null> {
  if (!XAI_API_KEY) return null;

  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Jamie, a certified nutritionist and personal trainer creating comprehensive health plans. Create detailed weekly plans that include workout scheduling, meal planning, and supplement/peptide protocol timing. Be specific with days, times, and actions. Format the plan as structured text the user can follow.`,
        },
        {
          role: 'user',
          content: `Create a ${params.duration} health plan.
Goals: ${params.goals.join(', ')}
Profile: ${params.profile}
Current programs: ${params.currentPrograms.join(', ') || 'None'}

Include: weekly workout schedule, meal plan framework, and any protocol/supplement timing recommendations.`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    });

    return completion.choices[0]?.message?.content ?? null;
  } catch (error) {
    if (__DEV__) console.warn('[llmService] Plan generation failed:', error);
    return null;
  }
}

/**
 * Check if the AI service is available (has API key configured).
 */
export function isAIAvailable(): boolean {
  return SUPABASE_URL.length > 0 || XAI_API_KEY.length > 0;
}
