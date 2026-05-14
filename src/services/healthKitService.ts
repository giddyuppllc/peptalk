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
 * - This service ONLY works on iOS in a development build (EAS Build).
 *   It will gracefully return null / false when running in Expo Go or on
 *   Android — no crashes, no red screens.
 * - The native module (@kingstinct/react-native-healthkit) must be installed
 *   and linked via a custom dev client (`npx expo run:ios` or EAS Build).
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic module loading
// ---------------------------------------------------------------------------

// @kingstinct/react-native-healthkit requires a native build (EAS).
// In Expo Go it can't load — react-native-nitro-modules isn't in that runtime.
// We use a try/require so the import is silently skipped when the module isn't
// present (Expo Go, Android, web), and active when the user runs a real
// development client or production build.
let HKModule: any = null;
try {
  if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HKModule = require('@kingstinct/react-native-healthkit');
  }
} catch {
  // Native module not available — graceful fallback. Every read function
  // checks `HKModule !== null` before touching it, so this returns null
  // everywhere downstream and nothing crashes.
  HKModule = null;
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

/**
 * Returns `true` only when running on iOS AND the native HealthKit module
 * was successfully loaded. Safe to call on any platform.
 */
export function isHealthKitAvailable(): boolean {
  return HKModule !== null && Platform.OS === 'ios';
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request read-only HealthKit permissions for all metrics PepTalk uses,
 * including Apple Watch–specific data types.
 */
export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!HKModule) return false;

  try {
    const { HKQuantityTypeIdentifier, HKCategoryTypeIdentifier } = HKModule;

    await HKModule.requestAuthorization(
      [
        // Phase 1 — basic metrics
        HKQuantityTypeIdentifier.stepCount,
        HKQuantityTypeIdentifier.bodyMass,
        HKQuantityTypeIdentifier.heartRate,
        HKCategoryTypeIdentifier.sleepAnalysis,
        HKQuantityTypeIdentifier.activeEnergyBurned,

        // Phase 2 — Apple Watch metrics
        HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
        HKQuantityTypeIdentifier.vo2Max,
        HKQuantityTypeIdentifier.oxygenSaturation,
        HKQuantityTypeIdentifier.respiratoryRate,
        HKQuantityTypeIdentifier.restingHeartRate,

        // Phase 3 — Women's health / cycle tracking
        HKCategoryTypeIdentifier.menstrualFlow,
        HKCategoryTypeIdentifier.cervicalMucusQuality,
        HKCategoryTypeIdentifier.ovulationTestResult,
        HKCategoryTypeIdentifier.contraceptive,
        HKCategoryTypeIdentifier.intermenstrualBleeding,
      ],
      [] // no write permissions
    );

    return true;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Permission request failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — Basic data fetching
// ---------------------------------------------------------------------------

export async function fetchTodaySteps(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const samples = await HKModule.queryStatisticsForQuantity(
      HKQuantityTypeIdentifier.stepCount,
      { from: today, to: new Date() }
    );

    return samples?.sumQuantity?.doubleValue ?? null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch steps:', error);
    return null;
  }
}

export async function fetchLatestWeight(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.bodyMass,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      const kilograms = samples[0].quantity;
      const pounds = kilograms * 2.20462;
      return Math.round(pounds * 10) / 10;
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch weight:', error);
    return null;
  }
}

export async function fetchLatestHeartRate(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.heartRate,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      return Math.round(samples[0].quantity);
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch heart rate:', error);
    return null;
  }
}

export async function fetchLastNightSleep(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKCategoryTypeIdentifier } = HKModule;

    const now = new Date();
    const sleepWindowEnd = new Date(now);
    sleepWindowEnd.setHours(12, 0, 0, 0);

    const sleepWindowStart = new Date(sleepWindowEnd);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    const samples = await HKModule.queryCategorySamples(
      HKCategoryTypeIdentifier.sleepAnalysis,
      { from: sleepWindowStart, to: sleepWindowEnd }
    );

    if (!samples || samples.length === 0) return null;

    let totalMinutes = 0;
    for (const sample of samples) {
      const value = sample.value;
      if (value === 1 || value === 3 || value === 4 || value === 5) {
        const start = new Date(sample.startDate).getTime();
        const end = new Date(sample.endDate).getTime();
        totalMinutes += (end - start) / (1000 * 60);
      }
    }

    if (totalMinutes === 0) return null;
    return Math.round((totalMinutes / 60) * 10) / 10;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch sleep data:', error);
    return null;
  }
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

/**
 * Fetch last night's sleep broken down by stage (Apple Watch only).
 * Returns null if Watch sleep data isn't available.
 */
export async function fetchSleepStages(): Promise<SleepStages | null> {
  if (!HKModule) return null;

  try {
    const { HKCategoryTypeIdentifier } = HKModule;

    const now = new Date();
    const sleepWindowEnd = new Date(now);
    sleepWindowEnd.setHours(12, 0, 0, 0);

    const sleepWindowStart = new Date(sleepWindowEnd);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    const samples = await HKModule.queryCategorySamples(
      HKCategoryTypeIdentifier.sleepAnalysis,
      { from: sleepWindowStart, to: sleepWindowEnd }
    );

    if (!samples || samples.length === 0) return null;

    let awakeMinutes = 0;
    let coreMinutes = 0;
    let deepMinutes = 0;
    let remMinutes = 0;

    for (const sample of samples) {
      const duration = (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / (1000 * 60);
      switch (sample.value) {
        case 2: awakeMinutes += duration; break;  // awake
        case 1: // asleep unspecified — count as core
        case 3: coreMinutes += duration; break;    // asleep core
        case 4: deepMinutes += duration; break;    // asleep deep
        case 5: remMinutes += duration; break;     // asleep REM
      }
    }

    const total = coreMinutes + deepMinutes + remMinutes;
    if (total === 0) return null;

    // Detect bedtime and wake time from first/last sleep samples
    const sleepSamples = samples
      .filter((s: any) => s.value >= 1 && s.value <= 5)
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const bedtime = sleepSamples.length > 0 ? sleepSamples[0].startDate : undefined;
    const wakeTime = sleepSamples.length > 0 ? sleepSamples[sleepSamples.length - 1].endDate : undefined;

    // Sleep efficiency: time asleep / total time in bed
    const timeInBed = total + awakeMinutes;
    const efficiency = timeInBed > 0 ? Math.round((total / timeInBed) * 100) : undefined;

    // Quality score (0-100): weighted by deep (40%), REM (30%), efficiency (20%), duration (10%)
    const deepScore = Math.min((deepMinutes / 90) * 100, 100); // 90 min deep = perfect
    const remScore = Math.min((remMinutes / 120) * 100, 100);  // 120 min REM = perfect
    const durationScore = Math.min((total / 480) * 100, 100);  // 8 hours = perfect
    const effScore = efficiency ?? 85;
    const qualityScore = Math.round(
      deepScore * 0.4 + remScore * 0.3 + effScore * 0.2 + durationScore * 0.1
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
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch sleep stages:', error);
    return null;
  }
}

/**
 * Fetch the most recent Heart Rate Variability (SDNN) from Apple Watch.
 * @returns HRV in milliseconds, or null if unavailable.
 */
export async function fetchLatestHRV(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      // HRV SDNN is stored in seconds, convert to ms
      return Math.round(samples[0].quantity * 1000);
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch HRV:', error);
    return null;
  }
}

/**
 * Fetch the most recent VO2 max from Apple Watch.
 * @returns VO2 max in mL/(kg·min), or null if unavailable.
 */
export async function fetchLatestVO2Max(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.vo2Max,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      return Math.round(samples[0].quantity * 10) / 10;
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch VO2 max:', error);
    return null;
  }
}

/**
 * Fetch the most recent blood oxygen saturation (SpO2) from Apple Watch.
 * @returns SpO2 as a percentage (e.g. 98.5), or null if unavailable.
 */
export async function fetchLatestSpO2(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.oxygenSaturation,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      // HealthKit stores SpO2 as a fraction (0.0–1.0), convert to %
      return Math.round(samples[0].quantity * 1000) / 10;
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch SpO2:', error);
    return null;
  }
}

/**
 * Fetch the most recent respiratory rate from Apple Watch.
 * @returns Breaths per minute, or null if unavailable.
 */
export async function fetchLatestRespiratoryRate(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.respiratoryRate,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      return Math.round(samples[0].quantity * 10) / 10;
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch respiratory rate:', error);
    return null;
  }
}

/**
 * Fetch the most recent resting heart rate from Apple Watch.
 * This is computed by Apple Watch over the course of the day.
 * @returns Resting HR in BPM, or null if unavailable.
 */
export async function fetchLatestRestingHeartRate(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const samples = await HKModule.queryQuantitySamples(
      HKQuantityTypeIdentifier.restingHeartRate,
      { limit: 1, ascending: false }
    );

    if (samples && samples.length > 0) {
      return Math.round(samples[0].quantity);
    }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch resting heart rate:', error);
    return null;
  }
}

/**
 * Fetch today's total active energy burned (calories).
 * @returns Active calories burned, or null if unavailable.
 */
export async function fetchTodayActiveEnergy(): Promise<number | null> {
  if (!HKModule) return null;

  try {
    const { HKQuantityTypeIdentifier } = HKModule;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const samples = await HKModule.queryStatisticsForQuantity(
      HKQuantityTypeIdentifier.activeEnergyBurned,
      { from: today, to: new Date() }
    );

    return samples?.sumQuantity?.doubleValue
      ? Math.round(samples.sumQuantity.doubleValue)
      : null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch active energy:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Background observer for real-time Watch data
// ---------------------------------------------------------------------------

type HealthDataCallback = () => void;

let observerSubscriptions: Array<() => void> = [];

/**
 * Register background observers for key Apple Watch metrics.
 * When new data arrives from the Watch, the callback is invoked
 * so the app can refresh its displayed data.
 *
 * Call this once at app startup (e.g. in the root layout).
 * Returns an unsubscribe function.
 */
export function enableBackgroundObservers(onUpdate: HealthDataCallback): () => void {
  if (!HKModule) return () => {};

  const { HKQuantityTypeIdentifier, HKCategoryTypeIdentifier } = HKModule;

  const typesToObserve = [
    HKQuantityTypeIdentifier.stepCount,
    HKQuantityTypeIdentifier.heartRate,
    HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
    HKQuantityTypeIdentifier.restingHeartRate,
    HKQuantityTypeIdentifier.oxygenSaturation,
    HKQuantityTypeIdentifier.respiratoryRate,
    HKCategoryTypeIdentifier.sleepAnalysis,
    HKQuantityTypeIdentifier.activeEnergyBurned,
  ];

  // Clean up any existing observers
  disableBackgroundObservers();

  for (const type of typesToObserve) {
    try {
      const subscription = HKModule.subscribeToChanges(type, () => {
        onUpdate();
      });
      if (subscription && typeof subscription === 'function') {
        observerSubscriptions.push(subscription);
      }
    } catch (error) {
      if (__DEV__) console.warn(`[HealthKit] Failed to observe ${type}:`, error);
    }
  }

  return disableBackgroundObservers;
}

/**
 * Remove all active HealthKit observer subscriptions.
 */
export function disableBackgroundObservers(): void {
  for (const unsub of observerSubscriptions) {
    try { unsub(); } catch {}
  }
  observerSubscriptions = [];
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
  if (!HKModule) return {};

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
  if (!HKModule) return {};

  const [
    steps, weightLbs, heartRate, sleepHours,
    hrv, vo2Max, spo2, respiratoryRate, restingHR, activeCalories, sleepStages,
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
  if (!HKModule) return null;

  try {
    const { HKCategoryTypeIdentifier } = HKModule;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let currentFlow: CycleData['currentFlow'] = null;
    let lastPeriodStart: string | null = null;
    try {
      const flowSamples = await HKModule.queryCategorySamples(
        HKCategoryTypeIdentifier.menstrualFlow,
        { from: thirtyDaysAgo, to: new Date(), limit: 30, ascending: false }
      );
      if (flowSamples?.length > 0) {
        const flowMap: Record<number, CycleData['currentFlow']> = {
          1: 'light', 2: 'medium', 3: 'heavy', 4: 'none',
        };
        currentFlow = flowMap[flowSamples[0].value] ?? null;
        for (let i = 0; i < flowSamples.length; i++) {
          if (flowSamples[i].value >= 1 && flowSamples[i].value <= 3) {
            lastPeriodStart = new Date(flowSamples[i].startDate).toISOString().slice(0, 10);
            break;
          }
        }
      }
    } catch {}

    let cycleDay: number | null = null;
    let phase: CycleData['phase'] = null;
    if (lastPeriodStart) {
      const daysSince = Math.floor(
        (Date.now() - new Date(lastPeriodStart).getTime()) / (1000 * 60 * 60 * 24)
      );
      cycleDay = daysSince;
      if (daysSince <= 5) phase = 'menstrual';
      else if (daysSince <= 13) phase = 'follicular';
      else if (daysSince <= 16) phase = 'ovulatory';
      else phase = 'luteal';
    }

    let contraceptiveType: string | null = null;
    try {
      const samples = await HKModule.queryCategorySamples(
        HKCategoryTypeIdentifier.contraceptive,
        { limit: 1, ascending: false }
      );
      if (samples?.length > 0) {
        const typeMap: Record<number, string> = {
          1: 'Unspecified', 2: 'Implant', 3: 'Injection',
          4: 'IUD', 5: 'Ring', 6: 'Oral Pill', 7: 'Patch',
        };
        contraceptiveType = typeMap[samples[0].value] ?? 'Unknown';
      }
    } catch {}

    let cervicalMucus: string | null = null;
    try {
      const samples = await HKModule.queryCategorySamples(
        HKCategoryTypeIdentifier.cervicalMucusQuality,
        { limit: 1, ascending: false }
      );
      if (samples?.length > 0) {
        const mucusMap: Record<number, string> = {
          1: 'Dry', 2: 'Sticky', 3: 'Creamy', 4: 'Watery', 5: 'Egg White',
        };
        cervicalMucus = mucusMap[samples[0].value] ?? null;
      }
    } catch {}

    let ovulationResult: CycleData['ovulationResult'] = null;
    try {
      const samples = await HKModule.queryCategorySamples(
        HKCategoryTypeIdentifier.ovulationTestResult,
        { limit: 1, ascending: false }
      );
      if (samples?.length > 0) {
        const ovMap: Record<number, CycleData['ovulationResult']> = {
          1: 'negative', 2: 'indeterminate', 3: 'positive',
        };
        ovulationResult = ovMap[samples[0].value] ?? null;
      }
    } catch {}

    return { currentFlow, lastPeriodStart, cycleDay, phase, contraceptiveType, cervicalMucus, ovulationResult };
  } catch (error) {
    if (__DEV__) console.warn('[HealthKit] Failed to fetch cycle data:', error);
    return null;
  }
}
