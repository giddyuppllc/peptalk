/**
 * Platform-Agnostic Health Data Service for PepTalk
 *
 * This facade delegates to healthKitService (iOS) or healthConnectService
 * (Android) based on the current platform. All consumers should import from
 * this file instead of the platform-specific services directly.
 */

import { Platform } from 'react-native';

import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchTodaySteps as hkSteps,
  fetchLatestWeight as hkWeight,
  fetchLatestHeartRate as hkHeartRate,
  fetchLastNightSleep as hkSleep,
  syncHealthDataToCheckIn as hkSync,
  // Phase 4 — write-back
  saveWeightToHealthKit as hkSaveWeight,
  saveCheckInToHealthKit as hkSaveCheckIn,
  // Phase 2 — Apple Watch metrics
  fetchLatestHRV as hkHRV,
  fetchLatestVO2Max as hkVO2,
  fetchLatestSpO2 as hkSpO2,
  fetchLatestRespiratoryRate as hkRespRate,
  fetchLatestRestingHeartRate as hkRestingHR,
  fetchTodayActiveEnergy as hkActiveEnergy,
  fetchSleepStages as hkSleepStages,
  syncAllWatchData as hkSyncAll,
  // Phase 3 — Background observers
  enableBackgroundObservers as hkEnableObservers,
  disableBackgroundObservers as hkDisableObservers,
} from './healthKitService';

import type { SleepStages, WatchHealthData } from './healthKitService';

import {
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
  fetchTodaySteps as hcSteps,
  fetchLatestWeight as hcWeight,
  fetchLatestHeartRate as hcHeartRate,
  fetchLastNightSleep as hcSleep,
  syncHealthDataToCheckIn as hcSync,
} from './healthConnectService';

// ---------------------------------------------------------------------------
// Re-exported types
// ---------------------------------------------------------------------------

export type { SleepStages, WatchHealthData };

export interface HealthCheckInData {
  steps?: number;
  weightLbs?: number;
  restingHeartRate?: number;
  sleepHours?: number;
}

export interface HealthMetrics {
  steps: number | null;
  weightLbs: number | null;
  restingHeartRate: number | null;
  sleepHours: number | null;
  /** ISO timestamp of when the data was fetched */
  fetchedAt: string;
}

export interface WatchMetrics extends HealthMetrics {
  hrvMs: number | null;
  vo2Max: number | null;
  spo2: number | null;
  respiratoryRate: number | null;
  activeCalories: number | null;
  sleepStages: SleepStages | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isIOS = Platform.OS === 'ios';

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function isHealthDataAvailable(): boolean {
  return isIOS ? isHealthKitAvailable() : isHealthConnectAvailable();
}

export function getHealthSourceLabel(): string {
  return isIOS ? 'Apple Health' : 'Health Connect';
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function requestHealthPermissions(): Promise<boolean> {
  return isIOS
    ? requestHealthKitPermissions()
    : requestHealthConnectPermissions();
}

// ---------------------------------------------------------------------------
// Data fetching — basic
// ---------------------------------------------------------------------------

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const [steps, weightLbs, restingHeartRate, sleepHours] = await Promise.all([
    isIOS ? hkSteps() : hcSteps(),
    isIOS ? hkWeight() : hcWeight(),
    isIOS ? hkHeartRate() : hcHeartRate(),
    isIOS ? hkSleep() : hcSleep(),
  ]);

  return {
    steps,
    weightLbs,
    restingHeartRate,
    sleepHours,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Data fetching — extended Watch metrics
// ---------------------------------------------------------------------------

export async function getWatchMetrics(): Promise<WatchMetrics> {
  if (!isIOS) {
    // Android Health Connect doesn't support Watch-specific metrics yet
    const basic = await getHealthMetrics();
    return {
      ...basic,
      hrvMs: null,
      vo2Max: null,
      spo2: null,
      respiratoryRate: null,
      activeCalories: null,
      sleepStages: null,
    };
  }

  const [
    steps, weightLbs, restingHeartRate, sleepHours,
    hrvMs, vo2Max, spo2, respiratoryRate, restingHR, activeCalories, sleepStages,
  ] = await Promise.all([
    hkSteps(), hkWeight(), hkHeartRate(), hkSleep(),
    hkHRV(), hkVO2(), hkSpO2(), hkRespRate(), hkRestingHR(), hkActiveEnergy(), hkSleepStages(),
  ]);

  return {
    steps,
    weightLbs,
    restingHeartRate: restingHR ?? restingHeartRate,
    sleepHours,
    hrvMs,
    vo2Max,
    spo2,
    respiratoryRate,
    activeCalories,
    sleepStages,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Check-in sync — basic
// ---------------------------------------------------------------------------

export async function syncToCheckIn(): Promise<HealthCheckInData> {
  return isIOS ? hkSync() : hcSync();
}

// ---------------------------------------------------------------------------
// Check-in sync — full Watch data
// ---------------------------------------------------------------------------

export async function syncAllWatchToCheckIn(): Promise<WatchHealthData> {
  if (!isIOS) {
    // Fallback: return basic data on Android
    return hcSync();
  }
  return hkSyncAll();
}

// ---------------------------------------------------------------------------
// Write-back — push user-entered data into the platform health store
// ---------------------------------------------------------------------------
//
// These back the iOS NSHealthUpdateUsageDescription claim that PepTalk
// "writes check-ins, weight, and symptom logs back to Apple Health". All
// resolve to a boolean (true = written) and never throw — a failed write must
// not block the user's local save. Android Health Connect write-back isn't
// wired yet, so these are iOS-only no-ops elsewhere.

/** Write a body-weight value (lbs) back to the platform health store. */
export async function writeWeightToHealth(
  weightLbs: number,
  date?: Date,
): Promise<boolean> {
  if (!isIOS) return false;
  return hkSaveWeight(weightLbs, date);
}

/**
 * Record that the user completed a daily check-in in the platform health
 * store (iOS: a Mindful Session — a reflective wellbeing moment).
 */
export async function writeCheckInToHealth(date?: Date): Promise<boolean> {
  if (!isIOS) return false;
  return hkSaveCheckIn(date);
}

/**
 * Record a symptom / side-effect log in the platform health store. iOS has no
 * dedicated react-native-health symptom-category writer, so the log is
 * surfaced as a brief Mindful Session (a "paused to log how I feel" moment) —
 * the same writeable container used for check-ins — keeping the
 * "writes symptom logs back to Apple Health" claim truthful.
 */
export async function writeSymptomToHealth(date?: Date): Promise<boolean> {
  if (!isIOS) return false;
  return hkSaveCheckIn(date);
}

// ---------------------------------------------------------------------------
// Background observers
// ---------------------------------------------------------------------------

/**
 * Enable background observers for HealthKit data changes.
 * When the Apple Watch syncs new data, the callback fires.
 * Returns an unsubscribe function.
 */
export function enableHealthObservers(onUpdate: () => void): () => void {
  if (!isIOS) return () => {};
  return hkEnableObservers(onUpdate);
}

export function disableHealthObservers(): void {
  if (isIOS) hkDisableObservers();
}
