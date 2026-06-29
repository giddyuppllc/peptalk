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
import { secureStorage } from '../secureStorage';

// ── Dynamic module load ────────────────────────────────────────────────────

let AppleHealthKit: any = null;
try {
  if (Platform.OS === 'ios') {
     
    AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
  }
} catch {
  // Not installed yet — adapter reports unavailable.
  AppleHealthKit = null;
}

// HealthKit links into the binary on iPad too, but the DATA layer is
// unavailable there (iPadOS has no Health app). The native isAvailable() result
// is the only reliable signal — Platform.isPad is wrong when an iPhone-only app
// runs on iPad in compatibility mode. Cache the async result; `null` = not yet
// resolved (treat as available so a normal iPhone cold-start doesn't briefly
// hide the card), self-correcting to false on iPad.
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

/**
 * Map HealthKit menstrual flow category values to our FlowIntensity.
 * Apple HKCategoryValueMenstrualFlow enum:
 *   1 = Unspecified — user logged a flow but didn't pick a level
 *   2 = Light
 *   3 = Medium
 *   4 = Heavy
 *   5 = None — logged "no flow" (skip, not a period day)
 *
 * Apple does NOT model "spotting" in this enum — spotting lives in a
 * separate `HKCategoryTypeIdentifierIntermenstrualBleeding` category
 * that we don't sync yet. We treat 1 (unspecified) as 'light' because
 * that's the most common user intent when picking "flow" without a
 * level, and 5 (none) as undefined so it doesn't create a period day.
 */
function mapMenstrualFlow(hkValue: number): FlowIntensity | undefined {
  switch (hkValue) {
    case 2: return 'light';
    case 3: return 'medium';
    case 4: return 'heavy';
    case 1: return 'light';     // unspecified → safest default
    case 5: return undefined;   // none → not a flow day, skip
    default: return undefined;
  }
}

// ── Cached auth state (avoids re-prompts during a session) ─────────────────

let authorized = false;
let lastSyncedAt: string | undefined;

function log(...args: unknown[]) {
  if (__DEV__) console.log('[HealthKit]', ...args);
}

// ── Persisted "user connected Apple Health" flag ──────────────────────────
//
// `authorized` is module-level and resets to false on every cold start, and
// HealthKit exposes NO API to query read-authorization. Without persistence
// the card showed "Not connected" after each relaunch and background sync
// stopped until the user manually re-connected. We persist the scopes the
// user connected with and silently re-init HealthKit on launch. Re-init never
// re-prompts for already-decided types, so re-hydration is invisible.
const HK_CONNECTED_KEY = 'peptalk:apple_health_connected';

let rehydratePromise: Promise<void> | null = null;

async function persistConnected(scopes: BiomarkerScope[]): Promise<void> {
  try {
    await secureStorage.setItem(HK_CONNECTED_KEY, JSON.stringify(scopes));
  } catch (err) {
    log('persist connected flag failed', err);
  }
}

async function clearConnected(): Promise<void> {
  try {
    await secureStorage.removeItem(HK_CONNECTED_KEY);
  } catch (err) {
    log('clear connected flag failed', err);
  }
}

/**
 * Re-hydrate authorization on cold start from the persisted flag. Idempotent
 * and safe to call unconditionally — no-ops when already authorized, when the
 * flag is absent, or off iOS. Re-init does not re-prompt for granted types.
 */
async function rehydrateAuth(): Promise<void> {
  if (!AppleHealthKit || Platform.OS !== 'ios') return;
  if (authorized) return;
  try {
    const raw = await secureStorage.getItem(HK_CONNECTED_KEY);
    if (!raw) return;
    let scopes: BiomarkerScope[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) scopes = parsed as BiomarkerScope[];
    } catch {
      // Corrupt value — fall back to a minimal read scope below.
    }
    const read = scopeToHKPerms(scopes.length > 0 ? scopes : (['steps'] as BiomarkerScope[]));
    await initHealthKit({ permissions: { read, write: getWriteScope() } });
    authorized = true;
    log('re-hydrated Apple Health authorization from persisted flag');
  } catch (err) {
    log('re-hydrate failed', err);
  }
}

/** Kick off (once) and await re-hydration. Called at module load and before
 *  any auth-dependent read so a relaunch resumes without a manual reconnect. */
export function ensureHealthKitRehydrated(): Promise<void> {
  if (!rehydratePromise) rehydratePromise = rehydrateAuth();
  return rehydratePromise;
}

// Fire-and-forget re-hydration on module import (app cold start).
if (Platform.OS === 'ios' && AppleHealthKit) {
  void ensureHealthKitRehydrated();
}

/**
 * Runtime check against HealthKit — catches the case where a user has
 * revoked permissions in iOS Settings while the app still thinks it's
 * connected. Fires a small read and checks for auth-denied errors.
 *
 * 5-second hard timeout so a hung HealthKit callback (rare but observed
 * on flaky connections and rapid sequential calls) can't freeze the UI.
 */
async function verifyLiveAuth(): Promise<boolean> {
  if (!AppleHealthKit) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => {
      log('live-auth check timed out after 5s');
      finish(false);
    }, 5000);

    // Pull the last 24h of steps — cheap read, fails fast if unauthorized.
    const options = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
    };
    try {
      AppleHealthKit.getDailyStepCountSamples(options, (err: Error | null) => {
        clearTimeout(timer);
        if (err) {
          log('live-auth check failed:', err.message);
          authorized = false;
          return finish(false);
        }
        finish(true);
      });
    } catch (err) {
      clearTimeout(timer);
      log('live-auth check threw:', err);
      finish(false);
    }
  });
}

// ── Promise wrappers (react-native-health uses callbacks) ──────────────────

function initHealthKit(permissions: {
  permissions: { read: string[]; write?: string[] };
}): Promise<void> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (err: Error | null) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * HealthKit categories PepTalk writes back to. Marketing copy claims
 * we write Body Mass, Mindful Session, and Sleep Analysis (e.g. a
 * user logs sleep in our check-in flow → it lands in Health), so the
 * Info.plist `NSHealthUpdateUsageDescription` is set up and Apple's
 * permission sheet shows the right toggles on first connect.
 *
 * If the underlying react-native-health module isn't loaded (Expo
 * Go, simulator without HealthKit) PERMS will be {} and this resolves
 * to an empty array — the connect flow gracefully degrades.
 */
function getWriteScope(): string[] {
  // Write-back enabled: weight (BodyMass) + check-ins/symptoms (MindfulSession)
  // are written via saveWeight / saveMindfulSession below. Backed by
  // NSHealthUpdateUsageDescription in app.json — the two MUST stay in sync or
  // connect crashes.
  const out: string[] = [];
  if (PERMS.Weight) out.push(PERMS.Weight);
  if (PERMS.MindfulSession) out.push(PERMS.MindfulSession);
  return out;
}

// ── Write-back helpers ─────────────────────────────────────────────────────
//
// Standalone (not part of the BiomarkerAdapter read interface) so the other
// adapters don't have to implement them. Each resolves false on any
// error / missing native method rather than throwing.

function saveOne(method: string, options: any): Promise<boolean> {
  return new Promise((resolve) => {
    const fn = AppleHealthKit?.[method];
    if (typeof fn !== 'function') return resolve(false);
    try {
      fn.call(AppleHealthKit, options, (err: Error | null) => {
        if (err) {
          log(`${method} failed:`, err);
          return resolve(false);
        }
        resolve(true);
      });
    } catch (err) {
      log(`${method} threw:`, err);
      resolve(false);
    }
  });
}

/** Write a body-weight sample (pounds) to Apple Health. */
export async function saveWeight(
  weightLbs: number,
  date: Date = new Date(),
): Promise<boolean> {
  if (!healthKitAdapter.available()) return false;
  if (!(typeof weightLbs === 'number' && weightLbs > 0)) return false;
  return saveOne('saveWeight', {
    value: weightLbs,
    unit: 'pound',
    startDate: date.toISOString(),
  });
}

/** Write a brief Mindful Session (a check-in / symptom log moment) to Health. */
export async function saveMindfulSession(
  date: Date = new Date(),
): Promise<boolean> {
  if (!healthKitAdapter.available()) return false;
  const startDate = new Date(date.getTime() - 60 * 1000);
  return saveOne('saveMindfulSession', {
    startDate: startDate.toISOString(),
    endDate: date.toISOString(),
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
    // iPad has no HealthKit data layer — gate on the native availability check
    // so the Apple Health card shows as unavailable (not a dead "Connect") on
    // iPad, the device Apple reviews on. `null` (pending) counts as available.
    return Platform.OS === 'ios' && AppleHealthKit != null && hkDataAvailable !== false;
  },

  async isAuthorized() {
    // Re-hydrate the persisted connection first so a cold start doesn't
    // report "not connected" before connect() has been called this session.
    await ensureHealthKitRehydrated();
    // Double-check against HealthKit — user may have revoked in iOS Settings.
    if (!authorized) return false;
    return verifyLiveAuth();
  },

  async connect(scopes: BiomarkerScope[]) {
    if (!this.available()) return false;
    try {
      await initHealthKit({
        permissions: {
          read: scopeToHKPerms(scopes),
          // Write scope is fixed (weight + mindful-session/check-in) regardless
          // of which biomarker the user toggled on, and is listed up-front in
          // NSHealthUpdateUsageDescription so the permission sheet matches.
          write: getWriteScope(),
        },
      });
      authorized = true;
      // Persist so the connection survives relaunch (HealthKit has no
      // read-auth query API to re-derive this from).
      await persistConnected(scopes);
      log('connected with scopes', scopes, 'write scope', getWriteScope());
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
    // Clear the persisted flag so we don't re-init on next launch.
    await clearConnected();
  },

  async status(): Promise<AdapterStatus> {
    // Re-hydrate so the card reflects a persisted connection after relaunch.
    await ensureHealthKitRehydrated();
    // Re-verify against HealthKit so revoked-in-Settings shows correctly.
    const live = authorized ? await verifyLiveAuth() : false;
    return {
      connected: live,
      lastSyncedAt,
      message: live
        ? 'Connected to Apple Health'
        : Platform.OS === 'ios'
        ? authorized
          ? 'Access revoked — reconnect in iOS Settings → Privacy → Health'
          : 'Not connected'
        : 'iOS only',
    };
  },

  async sync(scopes: BiomarkerScope[], sinceIso?: string): Promise<SyncResult> {
    // Resume background sync after a cold start by re-hydrating first.
    await ensureHealthKitRehydrated();
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

    // ── Workouts → emit per-workout active-energy + duration scalars ───
    // We don't yet have a first-class Workout shape in SyncResult, so each
    // HealthKit workout gets normalized into two scalars (kcal burned and
    // duration in minutes). Downstream stores can still pull useful signal
    // from this even before the workout type lands.
    if (scopeSet.has('workouts')) {
      const workouts = await getSamples<any>('getSamples', {
        startDate,
        endDate: now.toISOString(),
        type: 'Workout',
      });
      for (const w of workouts) {
        const ts = w.endDate ?? w.startDate ?? new Date().toISOString();
        const start = w.startDate ? new Date(w.startDate).getTime() : 0;
        const end = w.endDate ? new Date(w.endDate).getTime() : 0;
        const minutes = end > start ? Math.round((end - start) / 60000) : 0;
        const kcal = Number(w.calories ?? w.activeEnergyBurned ?? 0);
        if (kcal > 0) {
          scalars.push({
            scope: 'active_energy',
            value: kcal,
            unit: 'kcal',
            timestamp: ts,
            source: 'apple_health',
          });
        }
        if (minutes > 0) {
          scalars.push({
            scope: 'workouts' as BiomarkerScope,
            value: minutes,
            unit: 'min',
            timestamp: ts,
            source: 'apple_health',
          });
        }
      }
    }

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
    // Apple Watch writes MANY fragments per night — an INBED bracket plus a
    // stream of CORE/DEEP/REM/AWAKE stage segments. Emitting one SleepSample
    // per fragment made the router's per-night last-write-wins collapse to a
    // single fragment's duration → wildly wrong nightly totals. Instead we
    // group fragments into sessions (a >3h gap starts a new night) and sum
    // only the asleep-stage durations, excluding INBED (which brackets and
    // would double-count the whole window) and AWAKE (interruptions).
    if (scopeSet.has('sleep')) {
      const sleepSamples = await getSamples<any>('getSleepSamples', { startDate });

      // react-native-health `value` strings: INBED, ASLEEP, CORE, DEEP, REM, AWAKE.
      const ASLEEP_STAGES = new Set(['ASLEEP', 'CORE', 'DEEP', 'REM']);

      type Frag = {
        value: string;
        start: number;
        end: number;
      };
      const frags: Frag[] = sleepSamples
        .map((s: any) => ({
          value: String(s.value ?? '').toUpperCase(),
          start: new Date(s.startDate).getTime(),
          end: new Date(s.endDate).getTime(),
        }))
        .filter((f: Frag) => Number.isFinite(f.start) && Number.isFinite(f.end) && f.end > f.start)
        .sort((a: Frag, b: Frag) => a.start - b.start);

      // Split fragments into per-night sessions on a >3h gap.
      const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
      const sessions: Frag[][] = [];
      let current: Frag[] = [];
      let lastEnd = -Infinity;
      for (const f of frags) {
        if (current.length > 0 && f.start - lastEnd > SESSION_GAP_MS) {
          sessions.push(current);
          current = [];
        }
        current.push(f);
        lastEnd = Math.max(lastEnd, f.end);
      }
      if (current.length > 0) sessions.push(current);

      for (const session of sessions) {
        let asleepMs = 0;
        let deepMs = 0;
        let remMs = 0;
        let sessionStart = Infinity;
        let sessionEnd = -Infinity;
        for (const f of session) {
          sessionStart = Math.min(sessionStart, f.start);
          sessionEnd = Math.max(sessionEnd, f.end);
          const dur = f.end - f.start;
          if (f.value === 'DEEP') deepMs += dur;
          if (f.value === 'REM') remMs += dur;
          if (ASLEEP_STAGES.has(f.value)) asleepMs += dur;
        }
        // Fallback: a source that wrote only INBED (no stage/asleep data) —
        // approximate with the in-bed span so the night isn't lost entirely.
        const totalMs = asleepMs > 0 ? asleepMs : sessionEnd - sessionStart;
        const totalMinutes = Math.round(totalMs / 60000);
        if (totalMinutes <= 0) continue;
        sleeps.push({
          scope: 'sleep',
          startIso: new Date(sessionStart).toISOString(),
          endIso: new Date(sessionEnd).toISOString(),
          totalMinutes,
          deepMinutes: deepMs > 0 ? Math.round(deepMs / 60000) : undefined,
          remMinutes: remMs > 0 ? Math.round(remMs / 60000) : undefined,
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
