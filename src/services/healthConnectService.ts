/**
 * Health Connect (Android) Integration Service for PepTalk
 *
 * Mirrors the HealthKit service API shape so the platform-agnostic facade
 * (healthDataService.ts) can delegate to either service transparently.
 *
 * IMPORTANT NOTES:
 * ----------------
 * - This service ONLY works on Android in a development build (EAS Build).
 *   It will gracefully return null / false when running in Expo Go or on iOS.
 * - The native module (react-native-health-connect) must be installed and
 *   linked via a custom dev client (`npx expo run:android` or EAS Build).
 * - Currently uses a stub/mock layer. To swap in the real SDK, replace the
 *   HCModule loading block and the function bodies below — the public API
 *   shape stays identical.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic module loading
// ---------------------------------------------------------------------------
// Mirrors the HealthKit approach: dynamic require wrapped in try/catch so the
// app never crashes when the native module isn't available.

let HCModule: any = null;

try {
  if (Platform.OS === 'android') {
    // Uncomment when react-native-health-connect is installed:
    // HCModule = require('react-native-health-connect');
  }
} catch {
  // Module not available — running in Expo Go, on iOS, or the native module
  // hasn't been linked. All public functions below will return null / false.
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

/**
 * Returns `true` only when running on Android AND the native Health Connect
 * module was successfully loaded. Safe to call on any platform.
 */
export function isHealthConnectAvailable(): boolean {
  return HCModule !== null && Platform.OS === 'android';
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request read-only Health Connect permissions for the metrics PepTalk uses.
 *
 * Requested data types:
 *  - Steps
 *  - Weight
 *  - Heart Rate
 *  - Sleep Session
 *  - Active Calories Burned
 *
 * @returns `true` if permissions were granted (or previously granted),
 *          `false` if the module is unavailable or the user denied access.
 */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (!HCModule) return false;

  try {
    // When the real SDK is wired up, this will look something like:
    //
    // const granted = await HCModule.requestPermission([
    //   { accessType: 'read', recordType: 'Steps' },
    //   { accessType: 'read', recordType: 'Weight' },
    //   { accessType: 'read', recordType: 'HeartRate' },
    //   { accessType: 'read', recordType: 'SleepSession' },
    //   { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    // ]);
    // return granted.length > 0;

    return false;
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Permission request failed:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/**
 * Fetch today's total step count from Health Connect.
 *
 * @returns Step count as a number, or `null` if unavailable.
 */
export async function fetchTodaySteps(): Promise<number | null> {
  if (!HCModule) return null;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Real SDK usage:
    // const result = await HCModule.readRecords('Steps', {
    //   timeRangeFilter: {
    //     operator: 'between',
    //     startTime: today.toISOString(),
    //     endTime: new Date().toISOString(),
    //   },
    // });
    // return result.reduce((sum: number, r: any) => sum + r.count, 0) || null;

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch steps:', error);
    return null;
  }
}

/**
 * Fetch the most recent body weight measurement from Health Connect.
 *
 * @returns Weight in pounds (lbs), or `null` if unavailable.
 */
export async function fetchLatestWeight(): Promise<number | null> {
  if (!HCModule) return null;

  try {
    // Real SDK usage:
    // const result = await HCModule.readRecords('Weight', {
    //   timeRangeFilter: {
    //     operator: 'between',
    //     startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
    //     endTime: new Date().toISOString(),
    //   },
    //   limit: 1,
    //   ascending: false,
    // });
    // if (result.length > 0) {
    //   const kg = result[0].weight.inKilograms;
    //   return Math.round(kg * 2.20462 * 10) / 10;
    // }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch weight:', error);
    return null;
  }
}

/**
 * Fetch the most recent heart rate reading from Health Connect.
 *
 * @returns Heart rate in BPM, or `null` if unavailable.
 */
export async function fetchLatestHeartRate(): Promise<number | null> {
  if (!HCModule) return null;

  try {
    // Real SDK usage:
    // const result = await HCModule.readRecords('HeartRate', {
    //   timeRangeFilter: {
    //     operator: 'between',
    //     startTime: new Date(Date.now() - 86400000).toISOString(),
    //     endTime: new Date().toISOString(),
    //   },
    //   limit: 1,
    //   ascending: false,
    // });
    // if (result.length > 0 && result[0].samples?.length > 0) {
    //   return Math.round(result[0].samples[0].beatsPerMinute);
    // }

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch heart rate:', error);
    return null;
  }
}

/**
 * Estimate last night's total sleep duration from Health Connect.
 *
 * Looks at sleep sessions from 6 PM yesterday to 12 PM (noon) today and
 * sums all stages that indicate actual sleep.
 *
 * @returns Sleep duration in hours (e.g. 7.5), or `null` if unavailable.
 */
export async function fetchLastNightSleep(): Promise<number | null> {
  if (!HCModule) return null;

  try {
    const now = new Date();
    const sleepWindowEnd = new Date(now);
    sleepWindowEnd.setHours(12, 0, 0, 0);

    const sleepWindowStart = new Date(sleepWindowEnd);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    // Real SDK usage:
    // const result = await HCModule.readRecords('SleepSession', {
    //   timeRangeFilter: {
    //     operator: 'between',
    //     startTime: sleepWindowStart.toISOString(),
    //     endTime: sleepWindowEnd.toISOString(),
    //   },
    // });
    //
    // let totalMinutes = 0;
    // for (const session of result) {
    //   if (session.stages) {
    //     for (const stage of session.stages) {
    //       // stage types: 1=awake, 2=sleeping, 3=out_of_bed, 4=light, 5=deep, 6=rem
    //       if ([2, 4, 5, 6].includes(stage.stage)) {
    //         const start = new Date(stage.startTime).getTime();
    //         const end = new Date(stage.endTime).getTime();
    //         totalMinutes += (end - start) / (1000 * 60);
    //       }
    //     }
    //   } else {
    //     // No stages — use full session duration
    //     const start = new Date(session.startTime).getTime();
    //     const end = new Date(session.endTime).getTime();
    //     totalMinutes += (end - start) / (1000 * 60);
    //   }
    // }
    //
    // if (totalMinutes === 0) return null;
    // return Math.round((totalMinutes / 60) * 10) / 10;

    return null;
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch sleep data:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Composite sync helper
// ---------------------------------------------------------------------------

interface HealthCheckInData {
  steps?: number;
  weightLbs?: number;
  restingHeartRate?: number;
  sleepHours?: number;
}

/**
 * Fetch all available health metrics in one call and return them as a
 * partial check-in data object. Useful for pre-filling the daily check-in
 * screen with real device data.
 *
 * Any metric that is unavailable will simply be omitted from the result.
 *
 * @returns An object with whichever metrics were successfully fetched.
 */
export async function syncHealthDataToCheckIn(): Promise<HealthCheckInData> {
  if (!HCModule) return {};

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

// ---------------------------------------------------------------------------
// Women's Health / Cycle Tracking (Health Connect - Android)
// ---------------------------------------------------------------------------

export interface CycleData {
  currentFlow: 'none' | 'light' | 'medium' | 'heavy' | null;
  lastPeriodStart: string | null;
  cycleDay: number | null;
  phase: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
  contraceptiveType: string | null;
}

export async function fetchCycleData(): Promise<CycleData | null> {
  if (!HCModule) return null;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let currentFlow: CycleData['currentFlow'] = null;
    let lastPeriodStart: string | null = null;

    // Read menstruation flow records
    try {
      const records = await HCModule.readRecords('MenstruationFlow', {
        timeRangeFilter: { operator: 'between', startTime: thirtyDaysAgo.toISOString(), endTime: new Date().toISOString() },
      });
      if (records?.length > 0) {
        const latest = records[records.length - 1];
        const flowMap: Record<number, CycleData['currentFlow']> = {
          0: 'none', 1: 'light', 2: 'medium', 3: 'heavy',
        };
        currentFlow = flowMap[latest.flow] ?? null;
      }
    } catch {}

    // Read menstruation period records for last period start
    try {
      const periods = await HCModule.readRecords('MenstruationPeriod', {
        timeRangeFilter: { operator: 'between', startTime: thirtyDaysAgo.toISOString(), endTime: new Date().toISOString() },
      });
      if (periods?.length > 0) {
        const latest = periods[periods.length - 1];
        lastPeriodStart = new Date(latest.startTime).toISOString().slice(0, 10);
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

    return { currentFlow, lastPeriodStart, cycleDay, phase, contraceptiveType: null };
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch cycle data:', error);
    return null;
  }
}
