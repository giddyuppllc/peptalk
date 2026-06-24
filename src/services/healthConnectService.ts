/**
 * Health Connect (Android) Integration Service for PepTalk
 *
 * Mirrors the HealthKit service API shape so the platform-agnostic facade
 * (healthDataService.ts) can delegate to either service transparently.
 *
 * IMPORTANT NOTES:
 * ----------------
 * - This service ONLY works on Android in a development / production build
 *   that bundles the native module (`npx expo run:android` or EAS Build).
 *   It gracefully returns null / false when running in Expo Go or on iOS,
 *   so importing it is always safe.
 * - The native module is `react-native-health-connect`. It is loaded via a
 *   dynamic require wrapped in try/catch so the app never crashes when the
 *   module isn't linked.
 * - Reads are normalized to the same units HealthKit returns (steps as a
 *   count, weight in lbs, heart rate in BPM, sleep in hours) so downstream
 *   code doesn't need to know which platform produced the value.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic module loading
// ---------------------------------------------------------------------------
// Mirrors the HealthKit approach: dynamic require wrapped in try/catch so the
// app never crashes when the native module isn't available.

type HealthConnectModule = typeof import('react-native-health-connect');

let HCModule: HealthConnectModule | null = null;

try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    HCModule = require('react-native-health-connect') as HealthConnectModule;
  }
} catch {
  // Module not available — running in Expo Go, on iOS, or the native module
  // hasn't been linked. All public functions below will return null / false.
  HCModule = null;
}

// SdkAvailabilityStatus.SDK_AVAILABLE === 3. Hard-coded so we don't depend on
// the constant being present when the module failed to load.
const SDK_AVAILABLE = 3;

// SleepStageType values that represent actual sleep (vs awake / out-of-bed):
//   2 = SLEEPING, 4 = LIGHT, 5 = DEEP, 6 = REM
const ASLEEP_STAGES = new Set<number>([2, 4, 5, 6]);

// The read permissions PepTalk requests. These mirror the
// `android.permission.health.READ_*` entries declared in app.json.
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'BodyFat' },
] as const;

// ---------------------------------------------------------------------------
// Initialization (idempotent)
// ---------------------------------------------------------------------------

let initPromise: Promise<boolean> | null = null;

/**
 * Lazily initialize the Health Connect SDK. Safe to call repeatedly — the
 * underlying init only runs once and the result is cached. Returns `false`
 * when the module is missing, the SDK isn't installed/available on the
 * device, or initialization fails.
 */
async function ensureInitialized(): Promise<boolean> {
  if (!HCModule) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const status = await HCModule!.getSdkStatus();
      if (status !== SDK_AVAILABLE) {
        if (__DEV__) {
          console.warn(
            `[HealthConnect] SDK not available (status ${status}). ` +
              'Health Connect may need to be installed/updated on this device.',
          );
        }
        return false;
      }
      return await HCModule!.initialize();
    } catch (error) {
      if (__DEV__) console.warn('[HealthConnect] initialize failed:', error);
      return false;
    }
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

/**
 * Returns `true` only when running on Android AND the native Health Connect
 * module was successfully loaded. Safe to call on any platform.
 *
 * Note: this is a cheap, synchronous "is the module linked?" check. Whether
 * the SDK is actually installed/available on the device is resolved lazily
 * inside the async readers via `ensureInitialized()`.
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
 *  - Sleep Session
 *  - Heart Rate
 *  - Active Calories Burned
 *  - Total Calories Burned
 *  - Weight
 *  - Body Fat
 *
 * @returns `true` if permissions were granted (or previously granted),
 *          `false` if the module is unavailable or the user denied access.
 */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (!HCModule) return false;

  try {
    const ready = await ensureInitialized();
    if (!ready) return false;

    // If we already hold the permissions (granted in a previous session or
    // via the OS settings) skip the prompt and report success.
    try {
      const existing = await HCModule.getGrantedPermissions();
      if (existing && existing.length > 0) return true;
    } catch {
      // Non-fatal — fall through to the request below.
    }

    const granted = await HCModule.requestPermission(READ_PERMISSIONS as any);
    return Array.isArray(granted) && granted.length > 0;
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
    const ready = await ensureInitialized();
    if (!ready) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { records } = await HCModule.readRecords('Steps', {
      timeRangeFilter: {
        operator: 'between',
        startTime: today.toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    if (!records || records.length === 0) return null;
    const total = records.reduce((sum, r) => sum + (r.count ?? 0), 0);
    return total > 0 ? total : null;
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
    const ready = await ensureInitialized();
    if (!ready) return null;

    const { records } = await HCModule.readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
        endTime: new Date().toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1,
    });

    if (!records || records.length === 0) return null;
    const lbs = records[0].weight?.inPounds;
    if (typeof lbs !== 'number') return null;
    return Math.round(lbs * 10) / 10;
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
    const ready = await ensureInitialized();
    if (!ready) return null;

    const { records } = await HCModule.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(Date.now() - 86400000).toISOString(),
        endTime: new Date().toISOString(),
      },
      ascendingOrder: false,
      pageSize: 1,
    });

    if (!records || records.length === 0) return null;
    const samples = records[0].samples;
    if (!samples || samples.length === 0) return null;
    // Samples within a record are time-ordered; take the most recent one.
    const latest = samples[samples.length - 1];
    if (typeof latest.beatsPerMinute !== 'number') return null;
    return Math.round(latest.beatsPerMinute);
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
    const ready = await ensureInitialized();
    if (!ready) return null;

    const now = new Date();
    const sleepWindowEnd = new Date(now);
    sleepWindowEnd.setHours(12, 0, 0, 0);

    const sleepWindowStart = new Date(sleepWindowEnd);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    const { records } = await HCModule.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: sleepWindowStart.toISOString(),
        endTime: sleepWindowEnd.toISOString(),
      },
    });

    if (!records || records.length === 0) return null;

    let totalMinutes = 0;
    for (const session of records) {
      if (session.stages && session.stages.length > 0) {
        for (const stage of session.stages) {
          if (ASLEEP_STAGES.has(stage.stage)) {
            const start = new Date(stage.startTime).getTime();
            const end = new Date(stage.endTime).getTime();
            if (end > start) totalMinutes += (end - start) / 60000;
          }
        }
      } else {
        // No stage breakdown — use the full session duration.
        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime).getTime();
        if (end > start) totalMinutes += (end - start) / 60000;
      }
    }

    if (totalMinutes === 0) return null;
    return Math.round((totalMinutes / 60) * 10) / 10;
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
    const ready = await ensureInitialized();
    if (!ready) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let currentFlow: CycleData['currentFlow'] = null;
    let lastPeriodStart: string | null = null;

    // Read menstruation flow records
    try {
      const { records } = await HCModule.readRecords('MenstruationFlow', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo.toISOString(),
          endTime: new Date().toISOString(),
        },
      });
      if (records && records.length > 0) {
        const latest = records[records.length - 1];
        const flowMap: Record<number, CycleData['currentFlow']> = {
          0: 'none', 1: 'light', 2: 'medium', 3: 'heavy',
        };
        currentFlow = flowMap[latest.flow ?? 0] ?? null;
      }
    } catch {}

    // Read menstruation period records for last period start
    try {
      const { records: periods } = await HCModule.readRecords('MenstruationPeriod', {
        timeRangeFilter: {
          operator: 'between',
          startTime: thirtyDaysAgo.toISOString(),
          endTime: new Date().toISOString(),
        },
      });
      if (periods && periods.length > 0) {
        const latest = periods[periods.length - 1] as { time?: string; startTime?: string };
        // MenstruationPeriod is an instantaneous record (carries `time`); fall
        // back to startTime for forward-compat with provider variations.
        const periodStart = latest.time ?? latest.startTime;
        if (periodStart) {
          lastPeriodStart = new Date(periodStart).toISOString().slice(0, 10);
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

    return { currentFlow, lastPeriodStart, cycleDay, phase, contraceptiveType: null };
  } catch (error) {
    if (__DEV__) console.warn('[HealthConnect] Failed to fetch cycle data:', error);
    return null;
  }
}
