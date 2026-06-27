/**
 * Google Health Connect adapter (Android).
 *
 * Uses react-native-health-connect via dynamic require. Exposes the
 * equivalent set of scopes to the HealthKit adapter for cross-platform
 * parity, and normalizes reads into the same SyncResult shape.
 *
 * Reads are gated behind the Health Connect permission prompt (connect())
 * and the SDK availability check. When the native module isn't linked
 * (Expo Go / iOS) the adapter reports unavailable and all reads no-op.
 *
 * The read record types mirror the `android.permission.health.READ_*`
 * entries declared in app.json:
 *   Steps, SleepSession, HeartRate, ActiveCaloriesBurned,
 *   TotalCaloriesBurned, Weight, BodyFat.
 */

import { Platform } from 'react-native';
import type {
  BiomarkerAdapter,
  SyncResult,
  AdapterStatus,
  ScalarSample,
  SleepSample,
} from './types';
import type { BiomarkerScope } from '../../types/cycle';

// ── Dynamic module load ────────────────────────────────────────────────────

type HealthConnectModule = typeof import('react-native-health-connect');

let HealthConnect: HealthConnectModule | null = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    HealthConnect = require('react-native-health-connect') as HealthConnectModule;
  }
} catch {
  HealthConnect = null;
}

// SdkAvailabilityStatus.SDK_AVAILABLE === 3.
const SDK_AVAILABLE = 3;

// SleepStageType: 2=SLEEPING, 4=LIGHT, 5=DEEP, 6=REM (1=AWAKE, 3=OUT_OF_BED).
const ASLEEP_STAGES = new Set<number>([2, 4, 5, 6]);

// Health Connect read permissions PepTalk requests. Mirrors app.json.
const READ_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'BodyFat' },
] as const;

let authorized = false;
let lastSyncedAt: string | undefined;
let initialized = false;

function log(...args: unknown[]) {
  if (__DEV__) console.log('[HealthConnect]', ...args);
}

/** Lazily initialize the SDK once. Returns false if unavailable. */
async function ensureInitialized(): Promise<boolean> {
  if (!HealthConnect) return false;
  if (initialized) return true;
  try {
    const status = await HealthConnect.getSdkStatus();
    if (status !== SDK_AVAILABLE) {
      log('SDK not available, status', status);
      return false;
    }
    initialized = await HealthConnect.initialize();
    return initialized;
  } catch (err) {
    log('initialize failed', err);
    return false;
  }
}

export const healthConnectAdapter: BiomarkerAdapter = {
  source: 'health_connect',

  available() {
    return Platform.OS === 'android' && HealthConnect != null;
  },

  async isAuthorized() {
    if (!this.available()) return false;
    if (!(await ensureInitialized())) return false;
    try {
      const granted = await HealthConnect!.getGrantedPermissions();
      authorized = Array.isArray(granted) && granted.length > 0;
      return authorized;
    } catch {
      return authorized;
    }
  },

  async connect(_scopes: BiomarkerScope[]) {
    if (!this.available()) return false;
    try {
      if (!(await ensureInitialized())) return false;

      // Already granted in a prior session / via OS settings.
      try {
        const existing = await HealthConnect!.getGrantedPermissions();
        if (existing && existing.length > 0) {
          authorized = true;
          return true;
        }
      } catch {
        // fall through to request
      }

      const granted = await HealthConnect!.requestPermission(
        READ_PERMISSIONS as any,
      );
      authorized = Array.isArray(granted) && granted.length > 0;
      log('connect granted', granted);
      return authorized;
    } catch (err) {
      log('connect failed', err);
      authorized = false;
      return false;
    }
  },

  async disconnect() {
    authorized = false;
    lastSyncedAt = undefined;
    try {
      await HealthConnect?.revokeAllPermissions?.();
    } catch {
      // Revoke is best-effort; on Android 14+ it applies on next restart.
    }
  },

  async status(): Promise<AdapterStatus> {
    if (Platform.OS !== 'android') {
      return { connected: false, message: 'Android only' };
    }
    if (!this.available()) {
      return { connected: false, message: 'Health Connect not available' };
    }
    const live = await this.isAuthorized();
    return {
      connected: live,
      lastSyncedAt,
      message: live ? 'Connected to Health Connect' : 'Not connected',
    };
  },

  async sync(scopes: BiomarkerScope[], sinceIso?: string): Promise<SyncResult> {
    const emptyAt = () => new Date().toISOString();
    if (!this.available() || !(await ensureInitialized())) {
      return {
        scalars: [], ranges: [], sleeps: [], periods: [], cycleDayLogs: [],
        syncedAt: emptyAt(),
      };
    }

    // Confirm we hold permissions before reading.
    if (!(await this.isAuthorized())) {
      return {
        scalars: [], ranges: [], sleeps: [], periods: [], cycleDayLogs: [],
        syncedAt: emptyAt(),
        notes: 'Health Connect not authorized',
      };
    }

    const startTime =
      sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();
    const timeRangeFilter = { operator: 'between' as const, startTime, endTime };

    const scopeSet = new Set(scopes);
    const scalars: ScalarSample[] = [];
    const sleeps: SleepSample[] = [];

    const readSafe = async <T extends Parameters<HealthConnectModule['readRecords']>[0]>(
      recordType: T,
    ) => {
      try {
        const res = await HealthConnect!.readRecords(recordType, { timeRangeFilter });
        return res.records ?? [];
      } catch (err) {
        log(`read ${recordType} failed`, err);
        return [];
      }
    };

    // ── Steps ───────────────────────────────────────────────────────────
    if (scopeSet.has('steps')) {
      const records = await readSafe('Steps');
      for (const r of records as any[]) {
        scalars.push({
          scope: 'steps',
          value: r.count ?? 0,
          unit: 'count',
          timestamp: r.endTime ?? r.startTime ?? endTime,
          source: 'health_connect',
        });
      }
    }

    // ── Active energy (ActiveCaloriesBurned) ────────────────────────────
    if (scopeSet.has('active_energy')) {
      const records = await readSafe('ActiveCaloriesBurned');
      for (const r of records as any[]) {
        const kcal = r.energy?.inKilocalories;
        if (typeof kcal === 'number') {
          scalars.push({
            scope: 'active_energy',
            value: kcal,
            unit: 'kcal',
            timestamp: r.endTime ?? r.startTime ?? endTime,
            source: 'health_connect',
          });
        }
      }
    }

    // ── Resting heart rate (derived from HeartRate samples) ─────────────
    // Health Connect exposes RestingHeartRate as its own record type, but
    // many phones only populate HeartRate. We surface the lowest sample as
    // a reasonable resting proxy when resting_heart_rate is requested.
    if (scopeSet.has('resting_heart_rate')) {
      const records = await readSafe('HeartRate');
      for (const r of records as any[]) {
        const samples = r.samples ?? [];
        if (samples.length === 0) continue;
        let min = Infinity;
        let ts = r.endTime ?? r.startTime ?? endTime;
        for (const s of samples) {
          if (typeof s.beatsPerMinute === 'number' && s.beatsPerMinute < min) {
            min = s.beatsPerMinute;
            ts = s.time ?? ts;
          }
        }
        if (min !== Infinity) {
          scalars.push({
            scope: 'resting_heart_rate',
            value: Math.round(min),
            unit: 'bpm',
            timestamp: ts,
            source: 'health_connect',
          });
        }
      }
    }

    // ── Weight ──────────────────────────────────────────────────────────
    if (scopeSet.has('weight')) {
      const records = await readSafe('Weight');
      for (const r of records as any[]) {
        const lbs = r.weight?.inPounds;
        if (typeof lbs === 'number') {
          scalars.push({
            scope: 'weight',
            value: Math.round(lbs * 10) / 10,
            unit: 'lb',
            timestamp: r.time ?? endTime,
            source: 'health_connect',
          });
        }
      }
    }

    // ── Body fat ────────────────────────────────────────────────────────
    if (scopeSet.has('body_fat')) {
      const records = await readSafe('BodyFat');
      for (const r of records as any[]) {
        if (typeof r.percentage === 'number') {
          scalars.push({
            scope: 'body_fat',
            value: r.percentage,
            unit: '%',
            timestamp: r.time ?? endTime,
            source: 'health_connect',
          });
        }
      }
    }

    // ── Sleep ───────────────────────────────────────────────────────────
    if (scopeSet.has('sleep')) {
      const records = await readSafe('SleepSession');
      for (const r of records as any[]) {
        const start = new Date(r.startTime).getTime();
        const end = new Date(r.endTime).getTime();
        if (!(end > start)) continue;

        let asleepMinutes = 0;
        if (r.stages && r.stages.length > 0) {
          for (const stage of r.stages) {
            if (ASLEEP_STAGES.has(stage.stage)) {
              const sStart = new Date(stage.startTime).getTime();
              const sEnd = new Date(stage.endTime).getTime();
              if (sEnd > sStart) asleepMinutes += (sEnd - sStart) / 60000;
            }
          }
        }
        const totalMinutes =
          asleepMinutes > 0 ? Math.round(asleepMinutes) : Math.round((end - start) / 60000);

        sleeps.push({
          scope: 'sleep',
          startIso: r.startTime,
          endIso: r.endTime,
          totalMinutes,
          source: 'health_connect',
        });
      }
    }

    lastSyncedAt = new Date().toISOString();
    return {
      scalars,
      ranges: [],
      sleeps,
      periods: [],
      cycleDayLogs: [],
      syncedAt: lastSyncedAt,
      notes: `Synced ${scalars.length} readings, ${sleeps.length} sleep sessions`,
    };
  },
};

export default healthConnectAdapter;
