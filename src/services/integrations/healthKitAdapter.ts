/**
 * Apple HealthKit adapter.
 *
 * Uses react-native-health (community-maintained RN HealthKit bindings)
 * via dynamic require so the app doesn't crash on Android / Expo Go
 * where the module is unavailable.
 *
 * Scopes wired in 1.9.0 (most common femtech + performance signals):
 *   - menstrual flow            (HKCategoryTypeIdentifierMenstrualFlow)
 *   - basal body temperature    (HKQuantityTypeIdentifierBasalBodyTemperature)
 *   - ovulation test results    (HKCategoryTypeIdentifierOvulationTestResult)
 *   - cervical mucus            (HKCategoryTypeIdentifierCervicalMucusQuality)
 *   - sexual activity           (HKCategoryTypeIdentifierSexualActivity)
 *   - wrist temperature         (HKQuantityTypeIdentifierAppleSleepingWristTemperature)
 *   - HRV                       (HKQuantityTypeIdentifierHeartRateVariabilitySDNN)
 *   - resting heart rate        (HKQuantityTypeIdentifierRestingHeartRate)
 *   - sleep                     (HKCategoryTypeIdentifierSleepAnalysis)
 *   - steps                     (HKQuantityTypeIdentifierStepCount)
 *   - active energy             (HKQuantityTypeIdentifierActiveEnergyBurned)
 *   - weight                    (HKQuantityTypeIdentifierBodyMass)
 *   - body fat                  (HKQuantityTypeIdentifierBodyFatPercentage)
 *   - blood pressure            (systolic + diastolic)
 *   - blood glucose             (HKQuantityTypeIdentifierBloodGlucose)
 *   - respiratory rate          (HKQuantityTypeIdentifierRespiratoryRate)
 *   - VO₂ max                   (HKQuantityTypeIdentifierVO2Max)
 *   - SpO₂                      (HKQuantityTypeIdentifierOxygenSaturation)
 */

import { Platform } from 'react-native';
import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
  ScalarSample,
  RangeSample,
  SleepSample,
} from './types';
import type { PeriodEntry, CycleDayLog, FlowIntensity, BiomarkerScope } from '../../types/cycle';

// ── Dynamic module load ────────────────────────────────────────────────────

let AppleHealthKit: any = null;
try {
  if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
  }
} catch {
  // Not installed yet — adapter reports unavailable.
  AppleHealthKit = null;
}

const PERMS = AppleHealthKit?.Constants?.Permissions ?? {};

/** Map our scope names to HealthKit read-permission constants. */
function scopeToHKPerms(scopes: BiomarkerScope[]): string[] {
  const map: Record<BiomarkerScope, string[]> = {
    steps:              [PERMS.Steps],
    active_energy:      [PERMS.ActiveEnergyBurned],
    resting_heart_rate: [PERMS.RestingHeartRate],
    hrv:                [PERMS.HeartRateVariability],
    vo2_max:            [PERMS.Vo2Max],
    spo2:               [PERMS.OxygenSaturation],
    sleep:              [PERMS.SleepAnalysis],
    weight:             [PERMS.Weight],
    body_fat:           [PERMS.BodyFatPercentage],
    blood_pressure:     [PERMS.BloodPressureSystolic, PERMS.BloodPressureDiastolic],
    blood_glucose:      [PERMS.BloodGlucose],
    bbt:                [PERMS.BasalBodyTemperature],
    wrist_temperature:  [PERMS.AppleSleepingWristTemperature],
    menstrual_flow:     [PERMS.MenstrualFlow],
    ovulation_test:     [PERMS.OvulationTestResult],
    cervical_mucus:     [PERMS.CervicalMucusQuality],
    sexual_activity:    [PERMS.SexualActivity],
    workouts:           [PERMS.Workout],
    respiratory_rate:   [PERMS.RespiratoryRate],
  };
  const out = new Set<string>();
  for (const s of scopes) {
    for (const p of map[s] ?? []) if (p) out.add(p);
  }
  return Array.from(out);
}

/** Map HealthKit menstrual flow category values (1-5) to our FlowIntensity. */
function mapMenstrualFlow(hkValue: number): FlowIntensity | undefined {
  // 1=None (spotting), 2=Light, 3=Medium, 4=Heavy, 5=Unspecified
  switch (hkValue) {
    case 1: return 'spotting';
    case 2: return 'light';
    case 3: return 'medium';
    case 4: return 'heavy';
    default: return undefined;
  }
}

// ── Cached auth state (avoids re-prompts during a session) ─────────────────

let authorized = false;
let lastSyncedAt: string | undefined;

function log(...args: unknown[]) {
  if (__DEV__) console.log('[HealthKit]', ...args);
}

// ── Promise wrappers (react-native-health uses callbacks) ──────────────────

function initHealthKit(permissions: { permissions: { read: string[] } }): Promise<void> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getSamples<T>(method: string, opts: any): Promise<T[]> {
  return new Promise((resolve) => {
    AppleHealthKit[method](opts, (err: Error | null, results: T[]) => {
      if (err) {
        log(`${method} failed:`, err);
        return resolve([]);
      }
      resolve(results ?? []);
    });
  });
}

// ── Adapter implementation ─────────────────────────────────────────────────

export const healthKitAdapter: BiomarkerAdapter = {
  source: 'apple_health',

  available() {
    return Platform.OS === 'ios' && AppleHealthKit != null;
  },

  async isAuthorized() {
    return authorized;
  },

  async connect(scopes: BiomarkerScope[]) {
    if (!this.available()) return false;
    try {
      await initHealthKit({
        permissions: { read: scopeToHKPerms(scopes) },
      });
      authorized = true;
      log('connected with scopes', scopes);
      return true;
    } catch (err) {
      log('connect failed', err);
      authorized = false;
      return false;
    }
  },

  async disconnect() {
    // HealthKit doesn't expose an API to revoke; user must do it in Settings.
    authorized = false;
    lastSyncedAt = undefined;
  },

  async status(): Promise<AdapterStatus> {
    return {
      connected: authorized,
      lastSyncedAt,
      message: authorized
        ? 'Connected to Apple Health'
        : Platform.OS === 'ios'
        ? 'Not connected'
        : 'iOS only',
    };
  },

  async sync(scopes: BiomarkerScope[], sinceIso?: string): Promise<SyncResult> {
    if (!this.available() || !authorized) {
      return {
        scalars: [],
        ranges: [],
        sleeps: [],
        periods: [],
        cycleDayLogs: [],
        syncedAt: new Date().toISOString(),
      };
    }

    const startDate =
      sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date();

    const scalars: ScalarSample[] = [];
    const ranges: RangeSample[] = [];
    const sleeps: SleepSample[] = [];
    const periods: PeriodEntry[] = [];
    const cycleDayLogs: CycleDayLog[] = [];

    const scopeSet = new Set(scopes);

    // ── Scalar quantity samples ─────────────────────────────────────────
    const pullScalar = async (
      scope: BiomarkerScope,
      method: string,
      unit: string,
      options: any = {},
    ) => {
      if (!scopeSet.has(scope)) return;
      const samples = await getSamples<any>(method, { startDate, ...options });
      for (const s of samples) {
        scalars.push({
          scope,
          value: s.value,
          unit,
          timestamp: s.endDate ?? s.startDate ?? new Date().toISOString(),
          source: 'apple_health',
        });
      }
    };

    await pullScalar('steps', 'getDailyStepCountSamples', 'count', { endDate: now });
    await pullScalar('active_energy', 'getActiveEnergyBurned', 'kcal', { endDate: now });
    await pullScalar('resting_heart_rate', 'getRestingHeartRateSamples', 'bpm');
    await pullScalar('hrv', 'getHeartRateVariabilitySamples', 'ms');
    await pullScalar('vo2_max', 'getVo2MaxSamples', 'ml/kg/min');
    await pullScalar('spo2', 'getOxygenSaturationSamples', '%');
    await pullScalar('weight', 'getWeightSamples', 'lb');
    await pullScalar('body_fat', 'getBodyFatPercentageSamples', '%');
    await pullScalar('blood_glucose', 'getBloodGlucoseSamples', 'mg/dL');
    await pullScalar('bbt', 'getBasalBodyTemperatureSamples', '°F');
    await pullScalar('wrist_temperature', 'getWristTemperatureSamples', '°F');
    await pullScalar('respiratory_rate', 'getRespiratoryRateSamples', 'br/min');

    // ── Blood pressure (range) ──────────────────────────────────────────
    if (scopeSet.has('blood_pressure')) {
      const bp = await getSamples<any>('getBloodPressureSamples', { startDate });
      for (const s of bp) {
        ranges.push({
          scope: 'blood_pressure',
          values: {
            systolic: s.bloodPressureSystolicValue ?? s.systolic ?? 0,
            diastolic: s.bloodPressureDiastolicValue ?? s.diastolic ?? 0,
          },
          unit: 'mmHg',
          timestamp: s.endDate ?? s.startDate ?? new Date().toISOString(),
          source: 'apple_health',
        });
      }
    }

    // ── Sleep ───────────────────────────────────────────────────────────
    if (scopeSet.has('sleep')) {
      const sleepSamples = await getSamples<any>('getSleepSamples', { startDate });
      for (const s of sleepSamples) {
        const start = new Date(s.startDate);
        const end = new Date(s.endDate);
        sleeps.push({
          scope: 'sleep',
          startIso: s.startDate,
          endIso: s.endDate,
          totalMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
          source: 'apple_health',
        });
      }
    }

    // ── Menstrual flow → PeriodEntry synthesis ─────────────────────────
    if (scopeSet.has('menstrual_flow')) {
      const flows = await getSamples<any>('getMenstruationSamples', { startDate });
      // Group consecutive days into period entries
      const flowsByDate = new Map<string, FlowIntensity>();
      for (const f of flows) {
        const dateKey = (f.startDate ?? f.endDate ?? '').slice(0, 10);
        const intensity = mapMenstrualFlow(f.value ?? 0);
        if (dateKey && intensity) flowsByDate.set(dateKey, intensity);
      }

      const sortedDates = Array.from(flowsByDate.keys()).sort();
      if (sortedDates.length > 0) {
        let currentStart = sortedDates[0];
        let currentEnd = currentStart;
        const currentDailyFlow: Record<string, FlowIntensity> = {};
        currentDailyFlow[currentStart] = flowsByDate.get(currentStart)!;

        for (let i = 1; i < sortedDates.length; i++) {
          const prev = new Date(sortedDates[i - 1] + 'T12:00:00Z');
          const cur = new Date(sortedDates[i] + 'T12:00:00Z');
          const diffDays = (cur.getTime() - prev.getTime()) / (24 * 3600 * 1000);
          if (diffDays <= 2) {
            // Part of same period
            currentEnd = sortedDates[i];
            currentDailyFlow[sortedDates[i]] = flowsByDate.get(sortedDates[i])!;
          } else {
            // New period
            periods.push({
              id: `hk-period-${currentStart}`,
              startDate: currentStart,
              endDate: currentEnd,
              dailyFlow: { ...currentDailyFlow },
              source: 'apple_health',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            currentStart = sortedDates[i];
            currentEnd = currentStart;
            Object.keys(currentDailyFlow).forEach((k) => delete currentDailyFlow[k]);
            currentDailyFlow[currentStart] = flowsByDate.get(currentStart)!;
          }
        }
        // Push the final group
        periods.push({
          id: `hk-period-${currentStart}`,
          startDate: currentStart,
          endDate: currentEnd,
          dailyFlow: { ...currentDailyFlow },
          source: 'apple_health',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // ── Ovulation tests + sexual activity + cervical mucus → day logs ──
    if (
      scopeSet.has('ovulation_test') ||
      scopeSet.has('sexual_activity') ||
      scopeSet.has('cervical_mucus')
    ) {
      const daysByDate = new Map<string, Partial<CycleDayLog>>();

      const ensure = (date: string) => {
        if (!daysByDate.has(date)) {
          daysByDate.set(date, {
            id: `hk-day-${date}`,
            date,
            symptoms: [],
            moods: [],
            source: 'apple_health',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return daysByDate.get(date)!;
      };

      if (scopeSet.has('ovulation_test')) {
        const tests = await getSamples<any>('getOvulationTestResultSamples', { startDate });
        for (const t of tests) {
          const date = (t.startDate ?? t.endDate ?? '').slice(0, 10);
          if (!date) continue;
          const day = ensure(date);
          // HealthKit values: 1=negative, 2=positive, 3=luteinizingHormoneSurge, etc.
          if (t.value === 2 || t.value === 3) {
            day.positiveOvulationTest = true;
          }
        }
      }

      if (scopeSet.has('sexual_activity')) {
        const acts = await getSamples<any>('getSexualActivitySamples', { startDate });
        for (const a of acts) {
          const date = (a.startDate ?? a.endDate ?? '').slice(0, 10);
          if (!date) continue;
          const day = ensure(date);
          day.sexualActivity = true;
        }
      }

      // react-native-health doesn't expose getCervicalMucusSamples yet — skip.

      for (const partial of daysByDate.values()) {
        cycleDayLogs.push(partial as CycleDayLog);
      }
    }

    lastSyncedAt = new Date().toISOString();
    return { scalars, ranges, sleeps, periods, cycleDayLogs, syncedAt: lastSyncedAt };
  },
};

export default healthKitAdapter;
