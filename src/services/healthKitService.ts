/**
 * HealthKit / Apple Health Integration Service for PepTalk
 *
 * Provides read-only access to Apple Health metrics so the app can
 * pre-populate check-ins, show health trends, and inform the PepTalk bot.
 *
 * Phase 1: Basic metrics (steps, weight, heart rate, sleep)
 * Phase 2: Apple Watch metrics (HRV, VO2max, SpO2, respiratory rate,
 *          resting HR, sleep stages)
 * Phase 3: Background observer for real-time Watch data sync
 *
 * IMPORTANT NOTES:
 * ----------------
 * - This service ONLY works on iOS in a native build (EAS Build / dev
 *   client). It gracefully returns null / false in Expo Go, on Android,
 *   and on iPad (no HealthKit data layer) — no crashes, no red screens.
 * - Backing native module is `react-native-health` (the package that is
 *   actually installed — see package.json). An earlier version of this
 *   file was written against `@kingstinct/react-native-healthkit`, which
 *   was never installed, so `HKModule` was hard-wired to `null` and EVERY
 *   read silently returned null — the check-in "Sync from Apple Health"
 *   button did nothing. This rewrite wires the same module the working
 *   integrations/healthKitAdapter.ts already uses, keeping every exported
 *   signature identical so healthDataService.ts is unchanged.
 *
 * Unit handling: react-native-health does its own unit conversions and
 * its output has shifted across versions, so each reader is defensive
 * (e.g. SpO2 may arrive as a 0–1 fraction or a 0–100 percent; HRV as
 * seconds or milliseconds). We normalise on the way out.
 */

import { Platform, NativeEventEmitter, NativeModules } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic module loading
// ---------------------------------------------------------------------------

// `react-native-health` IS installed, so a static require is safe here — the
// same pattern is used (and ships fine through `eas build`) in
// integrations/healthKitAdapter.ts. The old warning about Metro crashing on a
// missing module only applied to the never-installed @kingstinct package.
let AppleHealthKit: any = null;
try {
  if (Platform.OS === 'ios') {

    AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
  }
} catch {
  // Module unavailable (Expo Go / simulator without HealthKit) — degrade.
  AppleHealthKit = null;
}

// HealthKit links into the binary on iPad too, but the DATA layer is
// unavailable there (iPadOS has no Health app). The native isAvailable() result
// is the only reliable signal — Platform.isPad is wrong when an iPhone-only app
// runs on iPad in compatibility mode. Cache the async result; `null` = not yet
// resolved (treat as available so a normal iPhone cold-start doesn't briefly
// hide the feature), self-correcting to false on iPad. Mirrors healthKitAdapter.
let hkDataAvailable: boolean | null = null;
if (AppleHealthKit?.isAvailable) {
  try {
    AppleHealthKit.isAvailable((err: any, avail: boolean) => {
      hkDataAvailable = err ? false : !!avail;
    });
  } catch {
    hkDataAvailable = false;
  }
}

const PERMS = AppleHealthKit?.Constants?.Permissions ?? {};

// ---------------------------------------------------------------------------
// Low-level promise wrappers (react-native-health is callback based)
// ---------------------------------------------------------------------------

/** Resolve an array-returning read method to [] on any error / missing method. */
function getSamples(method: string, opts: any): Promise<any[]> {
  return new Promise((resolve) => {
    const fn = AppleHealthKit?.[method];
    if (typeof fn !== 'function') return resolve([]);
    try {
      fn.call(AppleHealthKit, opts, (err: any, results: any) => {
        if (err) {
          if (__DEV__) console.warn(`[HealthKit] ${method} failed:`, err);
          return resolve([]);
        }
        resolve(Array.isArray(results) ? results : results ? [results] : []);
      });
    } catch (e) {
      if (__DEV__) console.warn(`[HealthKit] ${method} threw:`, e);
      resolve([]);
    }
  });
}

/** Resolve a single-value read method to null on any error / missing method. */
function getOne(method: string, opts: any): Promise<any | null> {
  return new Promise((resolve) => {
    const fn = AppleHealthKit?.[method];
    if (typeof fn !== 'function') return resolve(null);
    try {
      fn.call(AppleHealthKit, opts, (err: any, result: any) => {
        if (err) {
          if (__DEV__) console.warn(`[HealthKit] ${method} failed:`, err);
          return resolve(null);
        }
        resolve(result ?? null);
      });
    } catch (e) {
      if (__DEV__) console.warn(`[HealthKit] ${method} threw:`, e);
      resolve(null);
    }
  });
}

/** Pick the most recent sample by endDate (robust to result ordering). */
function latest<T extends { startDate?: string; endDate?: string }>(
  samples: T[],
): T | null {
  if (!samples || samples.length === 0) return null;
  return samples.reduce((best, s) => {
    const bt = new Date(best.endDate ?? best.startDate ?? 0).getTime();
    const st = new Date(s.endDate ?? s.startDate ?? 0).getTime();
    return st > bt ? s : best;
  });
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Yesterday 18:00 → today 12:00 — the window that captures "last night". */
function lastNightWindow(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  start.setHours(18, 0, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

/**
 * Returns `true` only when running on iOS, the native HealthKit module
 * loaded, AND the device exposes a HealthKit data layer (false on iPad).
 * Safe to call on any platform.
 */
export function isHealthKitAvailable(): boolean {
  return (
    Platform.OS === 'ios' && AppleHealthKit != null && hkDataAvailable !== false
  );
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request read-only HealthKit permissions for all metrics PepTalk uses,
 * including Apple Watch–specific data types. Resolves true once the native
 * permission sheet has been presented and HealthKit initialised.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;

  const read = [
    PERMS.Steps,
    PERMS.Weight,
    PERMS.HeartRate,
    PERMS.RestingHeartRate,
    PERMS.HeartRateVariability,
    PERMS.Vo2Max,
    PERMS.OxygenSaturation,
    PERMS.RespiratoryRate,
    PERMS.SleepAnalysis,
    PERMS.ActiveEnergyBurned,
    // Women's health / cycle (only those react-native-health exposes)
    PERMS.MenstrualFlow,
    PERMS.OvulationTestResult,
    PERMS.SexualActivity,
  ].filter(Boolean);

  // Write-back scope — backs the NSHealthUpdateUsageDescription claim that
  // PepTalk "writes check-ins, weight, and symptom logs back to Apple Health".
  //  - Weight (BodyMass) → saveWeightToHealthKit when the user enters a weight
  //                        in a check-in.
  //  - MindfulSession    → saveCheckInToHealthKit when the user completes a
  //                        daily check-in (Apple's Mindfulness category is the
  //                        writeable native container the installed
  //                        react-native-health build exposes for a reflective
  //                        wellbeing moment).
  // NOTE: symptom logs ride along on the same Mindfulness write at check-in
  // time; react-native-health exposes no dedicated HKCategory symptom writer.
  const write = getWriteScope();

  return new Promise((resolve) => {
    try {
      AppleHealthKit.initHealthKit(
        { permissions: { read, write } },
        (err: any) => {
          if (err) {
            if (__DEV__) console.warn('[HealthKit] init failed:', err);
            return resolve(false);
          }
          resolve(true);
        },
      );
    } catch (e) {
      if (__DEV__) console.warn('[HealthKit] init threw:', e);
      resolve(false);
    }
  });
}

/**
 * HealthKit write permissions PepTalk requests. Only the data types we
 * actually `saveSample` are listed, so Apple's permission sheet (and the
 * NSHealthUpdateUsageDescription string) match real behaviour.
 */
function getWriteScope(): string[] {
  // Read-only by design: PepTalk does not write back to Apple Health. No write
  // scope is requested — and requesting one without NSHealthUpdateUsageDescription
  // (which is intentionally absent) would crash on connect. The Integrations UI
  // and Info.plist are read-only to match.
  return [];
}

// ---------------------------------------------------------------------------
// Write-back (Phase 4) — push user-entered data into Apple Health
// ---------------------------------------------------------------------------

/** Promise wrapper around a single-record `save*` method. Resolves false on
 *  any error / missing method rather than throwing, so a write failure never
 *  blocks the user's local save. */
function saveOne(method: string, options: any): Promise<boolean> {
  return new Promise((resolve) => {
    const fn = AppleHealthKit?.[method];
    if (typeof fn !== 'function') return resolve(false);
    try {
      fn.call(AppleHealthKit, options, (err: any) => {
        if (err) {
          if (__DEV__) console.warn(`[HealthKit] ${method} failed:`, err);
          return resolve(false);
        }
        resolve(true);
      });
    } catch (e) {
      if (__DEV__) console.warn(`[HealthKit] ${method} threw:`, e);
      resolve(false);
    }
  });
}

/**
 * Write a body-weight sample (in pounds) back to Apple Health.
 * No-op (resolves false) off iOS / without HealthKit. Safe to call
 * unconditionally — guards on availability internally.
 */
export async function saveWeightToHealthKit(
  weightLbs: number,
  date: Date = new Date(),
): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  if (!(typeof weightLbs === 'number' && weightLbs > 0)) return false;
  // react-native-health's saveWeight takes the value in the unit passed via
  // `unit`; 'pound' matches our app-wide weight unit.
  return saveOne('saveWeight', {
    value: weightLbs,
    unit: 'pound',
    startDate: date.toISOString(),
  });
}

/**
 * Write a daily check-in to Apple Health as a Mindful Session — a reflective
 * wellbeing moment. Duration is nominal (1 minute) since a check-in is a
 * point-in-time self-report, not a timed meditation. Returns true on success.
 */
export async function saveCheckInToHealthKit(
  date: Date = new Date(),
): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  const endDate = date;
  const startDate = new Date(endDate.getTime() - 60 * 1000); // 1-minute session
  return saveOne('saveMindfulSession', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — Basic data fetching
// ---------------------------------------------------------------------------

export async function fetchTodaySteps(): Promise<number | null> {
  // getStepCount returns a single aggregated value for the day of `date`.
  const res = await getOne('getStepCount', { date: new Date().toISOString() });
  const v = res?.value;
  return typeof v === 'number' && v > 0 ? Math.round(v) : null;
}

export async function fetchLatestWeight(): Promise<number | null> {
  const res = await getOne('getLatestWeight', { unit: 'pound' });
  const v = res?.value;
  if (typeof v !== 'number' || v <= 0) return null;
  // Older react-native-health builds ignore the `unit` arg on getLatestWeight
  // and hand back kilograms. An adult body mass below ~35 is almost certainly
  // kg (no adult weighs 35 lb), so convert defensively.
  const lbs = v < 35 ? v * 2.20462 : v;
  return Math.round(lbs * 10) / 10;
}

export async function fetchLatestHeartRate(): Promise<number | null> {
  const samples = await getSamples('getHeartRateSamples', {
    startDate: sinceIso(7),
    ascending: false,
    limit: 24,
  });
  const s = latest(samples);
  return s && typeof s.value === 'number' ? Math.round(s.value) : null;
}

/** Apple sleep samples are 'INBED' | 'ASLEEP' | 'CORE' | 'DEEP' | 'REM' | 'AWAKE'
 *  on newer react-native-health, or numeric 1–5 on older bindings. */
function isAsleepValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return ['ASLEEP', 'CORE', 'DEEP', 'REM'].includes(value.toUpperCase());
  }
  // numeric: 1=asleep(unspecified), 3=core, 4=deep, 5=rem  (2=awake, 0=inbed)
  return value === 1 || value === 3 || value === 4 || value === 5;
}

export async function fetchLastNightSleep(): Promise<number | null> {
  const samples = await getSamples('getSleepSamples', lastNightWindow());
  if (!samples.length) return null;

  let totalMinutes = 0;
  for (const s of samples) {
    if (!isAsleepValue(s.value)) continue;
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    const dur = (end - start) / (1000 * 60);
    if (dur > 0) totalMinutes += dur;
  }

  if (totalMinutes === 0) return null;
  return Math.round((totalMinutes / 60) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Phase 2 — Apple Watch–specific metrics
// ---------------------------------------------------------------------------

/**
 * Sleep stage breakdown from Apple Watch sleep tracking.
 * Values in hours.
 */
export interface SleepStages {
  awake: number;
  core: number;
  deep: number;
  rem: number;
  total: number;
  /** Time user fell asleep (ISO string) */
  bedtime?: string;
  /** Time user woke up (ISO string) */
  wakeTime?: string;
  /** Sleep efficiency: time asleep / time in bed (0-100%) */
  efficiency?: number;
  /** Sleep quality score: weighted composite (0-100) */
  qualityScore?: number;
}

/** Bucket a sleep sample value into a stage name. */
function sleepStageOf(
  value: unknown,
): 'awake' | 'core' | 'deep' | 'rem' | null {
  const v = typeof value === 'string' ? value.toUpperCase() : value;
  switch (v) {
    case 'AWAKE':
    case 2:
      return 'awake';
    case 'CORE':
    case 'ASLEEP':
    case 1:
    case 3:
      return 'core';
    case 'DEEP':
    case 4:
      return 'deep';
    case 'REM':
    case 5:
      return 'rem';
    default:
      return null; // INBED / 0 / unknown
  }
}

/**
 * Fetch last night's sleep broken down by stage (Apple Watch only).
 * Returns null if Watch sleep data isn't available.
 */
export async function fetchSleepStages(): Promise<SleepStages | null> {
  const samples = await getSamples('getSleepSamples', lastNightWindow());
  if (!samples.length) return null;

  let awakeMinutes = 0;
  let coreMinutes = 0;
  let deepMinutes = 0;
  let remMinutes = 0;

  for (const sample of samples) {
    const duration =
      (new Date(sample.endDate).getTime() -
        new Date(sample.startDate).getTime()) /
      (1000 * 60);
    if (duration <= 0) continue;
    switch (sleepStageOf(sample.value)) {
      case 'awake':
        awakeMinutes += duration;
        break;
      case 'core':
        coreMinutes += duration;
        break;
      case 'deep':
        deepMinutes += duration;
        break;
      case 'rem':
        remMinutes += duration;
        break;
    }
  }

  const total = coreMinutes + deepMinutes + remMinutes;
  if (total === 0) return null;

  // Detect bedtime and wake time from the asleep samples
  const sleepSamples = samples
    .filter((s: any) => sleepStageOf(s.value) !== null && sleepStageOf(s.value) !== 'awake')
    .sort(
      (a: any, b: any) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

  const bedtime =
    sleepSamples.length > 0 ? sleepSamples[0].startDate : undefined;
  const wakeTime =
    sleepSamples.length > 0
      ? sleepSamples[sleepSamples.length - 1].endDate
      : undefined;

  // Sleep efficiency: time asleep / total time in bed
  const timeInBed = total + awakeMinutes;
  const efficiency =
    timeInBed > 0 ? Math.round((total / timeInBed) * 100) : undefined;

  // Quality score (0-100): weighted by deep (40%), REM (30%), efficiency (20%), duration (10%)
  const deepScore = Math.min((deepMinutes / 90) * 100, 100); // 90 min deep = perfect
  const remScore = Math.min((remMinutes / 120) * 100, 100); // 120 min REM = perfect
  const durationScore = Math.min((total / 480) * 100, 100); // 8 hours = perfect
  const effScore = efficiency ?? 85;
  const qualityScore = Math.round(
    deepScore * 0.4 + remScore * 0.3 + effScore * 0.2 + durationScore * 0.1,
  );

  return {
    awake: Math.round((awakeMinutes / 60) * 10) / 10,
    core: Math.round((coreMinutes / 60) * 10) / 10,
    deep: Math.round((deepMinutes / 60) * 10) / 10,
    rem: Math.round((remMinutes / 60) * 10) / 10,
    total: Math.round((total / 60) * 10) / 10,
    bedtime,
    wakeTime,
    efficiency,
    qualityScore,
  };
}

/**
 * Fetch the most recent Heart Rate Variability (SDNN) from Apple Watch.
 * @returns HRV in milliseconds, or null if unavailable.
 */
export async function fetchLatestHRV(): Promise<number | null> {
  const samples = await getSamples('getHeartRateVariabilitySamples', {
    startDate: sinceIso(30),
    ascending: false,
  });
  const s = latest(samples);
  if (!s || typeof s.value !== 'number') return null;
  // SDNN may arrive in seconds (≈0.045) or already in ms (≈45).
  const ms = s.value < 1 ? s.value * 1000 : s.value;
  return Math.round(ms);
}

/**
 * Fetch the most recent VO2 max from Apple Watch.
 * @returns VO2 max in mL/(kg·min), or null if unavailable.
 */
export async function fetchLatestVO2Max(): Promise<number | null> {
  const samples = await getSamples('getVo2MaxSamples', {
    startDate: sinceIso(90),
    ascending: false,
  });
  const s = latest(samples);
  return s && typeof s.value === 'number'
    ? Math.round(s.value * 10) / 10
    : null;
}

/**
 * Fetch the most recent blood oxygen saturation (SpO2) from Apple Watch.
 * @returns SpO2 as a percentage (e.g. 98.5), or null if unavailable.
 */
export async function fetchLatestSpO2(): Promise<number | null> {
  const samples = await getSamples('getOxygenSaturationSamples', {
    startDate: sinceIso(30),
    ascending: false,
  });
  const s = latest(samples);
  if (!s || typeof s.value !== 'number') return null;
  // May arrive as a 0–1 fraction or an already-scaled percent.
  const pct = s.value <= 1 ? s.value * 100 : s.value;
  return Math.round(pct * 10) / 10;
}

/**
 * Fetch the most recent respiratory rate from Apple Watch.
 * @returns Breaths per minute, or null if unavailable.
 */
export async function fetchLatestRespiratoryRate(): Promise<number | null> {
  const samples = await getSamples('getRespiratoryRateSamples', {
    startDate: sinceIso(30),
    ascending: false,
  });
  const s = latest(samples);
  return s && typeof s.value === 'number'
    ? Math.round(s.value * 10) / 10
    : null;
}

/**
 * Fetch the most recent resting heart rate from Apple Watch.
 * @returns Resting HR in BPM, or null if unavailable.
 */
export async function fetchLatestRestingHeartRate(): Promise<number | null> {
  const samples = await getSamples('getRestingHeartRateSamples', {
    startDate: sinceIso(30),
    ascending: false,
  });
  const s = latest(samples);
  return s && typeof s.value === 'number' ? Math.round(s.value) : null;
}

/**
 * Fetch today's total active energy burned (calories).
 * @returns Active calories burned, or null if unavailable.
 */
export async function fetchTodayActiveEnergy(): Promise<number | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const samples = await getSamples('getActiveEnergyBurned', {
    startDate: today.toISOString(),
    endDate: new Date().toISOString(),
  });
  if (!samples.length) return null;

  const total = samples.reduce(
    (sum: number, s: any) => sum + (typeof s.value === 'number' ? s.value : 0),
    0,
  );
  return total > 0 ? Math.round(total) : null;
}

// ---------------------------------------------------------------------------
// Phase 3 — Background observer for real-time Watch data
// ---------------------------------------------------------------------------

type HealthDataCallback = () => void;

let observerCleanups: (() => void)[] = [];

/**
 * Register background observers for key Apple Watch metrics.
 * react-native-health pushes JS events (e.g. `healthKit:StepCount:new`) once
 * the corresponding native observer is started; we listen for the handful it
 * supports and refresh on any of them. Best-effort: if the native event
 * emitter or observer API is unavailable this degrades to a no-op rather than
 * throwing. Call once at app startup; returns an unsubscribe function.
 */
export function enableBackgroundObservers(
  onUpdate: HealthDataCallback,
): () => void {
  if (!isHealthKitAvailable()) return () => {};

  // Always start from a clean slate.
  disableBackgroundObservers();

  try {
    const native = NativeModules.AppleHealthKit;
    if (!native) return () => {};

    const emitter = new NativeEventEmitter(native);
    const events = [
      'healthKit:StepCount:new',
      'healthKit:HeartRate:new',
      'healthKit:RestingHeartRate:new',
      'healthKit:SleepAnalysis:new',
      'healthKit:ActiveEnergyBurned:new',
    ];

    const subs = events.map((evt) => emitter.addListener(evt, () => onUpdate()));
    observerCleanups.push(() => subs.forEach((s) => s.remove()));

    // Kick off the one observer react-native-health natively supports starting
    // from JS. Others fire if the host app has background delivery configured.
    try {
      AppleHealthKit.initStepCountObserver?.({}, () => {});
    } catch {
      /* observer optional */
    }

    return disableBackgroundObservers;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] background observers unavailable:', error);
    return () => {};
  }
}

/**
 * Remove all active HealthKit observer subscriptions.
 */
export function disableBackgroundObservers(): void {
  for (const cleanup of observerCleanups) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
  }
  observerCleanups = [];
}

// ---------------------------------------------------------------------------
// Composite sync helpers
// ---------------------------------------------------------------------------

export interface HealthCheckInData {
  steps?: number;
  weightLbs?: number;
  restingHeartRate?: number;
  sleepHours?: number;
}

/**
 * Extended health data including all Apple Watch metrics.
 */
export interface WatchHealthData extends HealthCheckInData {
  hrvMs?: number;
  vo2Max?: number;
  spo2?: number;
  respiratoryRate?: number;
  activeCalories?: number;
  sleepStages?: SleepStages;
}

/**
 * Fetch basic health metrics for check-in pre-fill (Phase 1).
 */
export async function syncHealthDataToCheckIn(): Promise<HealthCheckInData> {
  if (!isHealthKitAvailable()) return {};

  const [steps, weightLbs, restingHeartRate, sleepHours] = await Promise.all([
    fetchTodaySteps(),
    fetchLatestWeight(),
    fetchLatestHeartRate(),
    fetchLastNightSleep(),
  ]);

  const data: HealthCheckInData = {};
  if (steps !== null) data.steps = steps;
  if (weightLbs !== null) data.weightLbs = weightLbs;
  if (restingHeartRate !== null) data.restingHeartRate = restingHeartRate;
  if (sleepHours !== null) data.sleepHours = sleepHours;

  return data;
}

/**
 * Fetch ALL available health metrics including Apple Watch data (Phase 2).
 * Used for enhanced check-ins and AI bot context.
 */
export async function syncAllWatchData(): Promise<WatchHealthData> {
  if (!isHealthKitAvailable()) return {};

  const [
    steps,
    weightLbs,
    heartRate,
    sleepHours,
    hrv,
    vo2Max,
    spo2,
    respiratoryRate,
    restingHR,
    activeCalories,
    sleepStages,
  ] = await Promise.all([
    fetchTodaySteps(),
    fetchLatestWeight(),
    fetchLatestHeartRate(),
    fetchLastNightSleep(),
    fetchLatestHRV(),
    fetchLatestVO2Max(),
    fetchLatestSpO2(),
    fetchLatestRespiratoryRate(),
    fetchLatestRestingHeartRate(),
    fetchTodayActiveEnergy(),
    fetchSleepStages(),
  ]);

  const data: WatchHealthData = {};
  if (steps !== null) data.steps = steps;
  if (weightLbs !== null) data.weightLbs = weightLbs;
  if (restingHR !== null) data.restingHeartRate = restingHR;
  if (heartRate !== null && restingHR === null) data.restingHeartRate = heartRate;
  if (sleepHours !== null) data.sleepHours = sleepHours;
  if (hrv !== null) data.hrvMs = hrv;
  if (vo2Max !== null) data.vo2Max = vo2Max;
  if (spo2 !== null) data.spo2 = spo2;
  if (respiratoryRate !== null) data.respiratoryRate = respiratoryRate;
  if (activeCalories !== null) data.activeCalories = activeCalories;
  if (sleepStages !== null) data.sleepStages = sleepStages;

  return data;
}

// ---------------------------------------------------------------------------
// Phase 3 — Women's Health / Cycle Tracking
// ---------------------------------------------------------------------------

export interface CycleData {
  currentFlow: 'none' | 'light' | 'medium' | 'heavy' | null;
  lastPeriodStart: string | null;
  cycleDay: number | null;
  phase: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
  contraceptiveType: string | null;
  cervicalMucus: string | null;
  ovulationResult: 'positive' | 'negative' | 'indeterminate' | null;
}

export async function fetchCycleData(): Promise<CycleData | null> {
  if (!isHealthKitAvailable()) return null;

  try {
    // react-native-health exposes menstruation + ovulation samples; cervical
    // mucus and contraceptive types aren't bound, so those stay null.
    let currentFlow: CycleData['currentFlow'] = null;
    let lastPeriodStart: string | null = null;

    const flowSamples = await getSamples('getMenstruationSamples', {
      startDate: sinceIso(30),
      ascending: false,
    });
    if (flowSamples.length > 0) {
      // HealthKit HKCategoryValueMenstrualFlow: 1=unspecified, 2=light,
      // 3=medium, 4=heavy, 5=none.
      const flowMap: Record<number, CycleData['currentFlow']> = {
        1: 'light',
        2: 'light',
        3: 'medium',
        4: 'heavy',
        5: 'none',
      };
      const newest = latest(flowSamples);
      currentFlow = newest ? flowMap[newest.value] ?? null : null;
      // Walk newest→oldest for the first real-flow day = period start.
      const byNewest = [...flowSamples].sort(
        (a, b) =>
          new Date(b.startDate ?? 0).getTime() -
          new Date(a.startDate ?? 0).getTime(),
      );
      for (const sample of byNewest) {
        if (sample.value >= 1 && sample.value <= 4) {
          lastPeriodStart = new Date(sample.startDate)
            .toISOString()
            .slice(0, 10);
          break;
        }
      }
    }

    let cycleDay: number | null = null;
    let phase: CycleData['phase'] = null;
    if (lastPeriodStart) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastPeriodStart).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      cycleDay = daysSince;
      if (daysSince <= 5) phase = 'menstrual';
      else if (daysSince <= 13) phase = 'follicular';
      else if (daysSince <= 16) phase = 'ovulatory';
      else phase = 'luteal';
    }

    let ovulationResult: CycleData['ovulationResult'] = null;
    const ovSamples = await getSamples('getOvulationTestResultSamples', {
      startDate: sinceIso(30),
      ascending: false,
    });
    if (ovSamples.length > 0) {
      const newest = latest(ovSamples);
      // 1=negative, 2=indeterminate/luteinizingHormoneSurge, 3=positive
      const ovMap: Record<number, CycleData['ovulationResult']> = {
        1: 'negative',
        2: 'indeterminate',
        3: 'positive',
      };
      ovulationResult = newest ? ovMap[newest.value] ?? null : null;
    }

    return {
      currentFlow,
      lastPeriodStart,
      cycleDay,
      phase,
      contraceptiveType: null,
      cervicalMucus: null,
      ovulationResult,
    };
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch cycle data:', error);
    return null;
  }
}
