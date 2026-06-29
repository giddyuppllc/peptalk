/**
 * Integration sync router — takes a SyncResult from any adapter and
 * writes each category into the appropriate store. This is the piece
 * that was missing in 1.9.0 — without it, HealthKit data was fetched
 * but never landed anywhere.
 *
 * Source-of-truth policy: when a sample's date/scope already has a
 * manual entry (user-authored), we skip the import to honor
 * SOURCE_PRIORITY (manual > device > aggregator).
 */

import type { SyncResult, ScalarSample, SleepSample } from './types';
import type { BiomarkerSource } from '../../types/cycle';
import { SOURCE_PRIORITY } from '../../types/cycle';

export interface RouteStats {
  periodsImported: number;
  cycleDaysImported: number;
  /** Daily-aggregate scalars (steps / hrv / rhr / etc.) written to biometrics store. */
  biometricsImported: number;
  /** Sleep nights summarized into biometrics store. */
  sleepsImported: number;
  skippedByPriority: number;
  errors: string[];
}

/**
 * Routes a SyncResult into the right stores. Uses dynamic require
 * so the routing doesn't force-load stores that may not be present
 * in a test/isolated environment.
 */
export async function routeSyncResult(result: SyncResult): Promise<RouteStats> {
  const stats: RouteStats = {
    periodsImported: 0,
    cycleDaysImported: 0,
    biometricsImported: 0,
    sleepsImported: 0,
    skippedByPriority: 0,
    errors: [],
  };

  // ── Cycle periods + day logs ───────────────────────────────────────────
  try {
    const { useCycleStore } = require('../../store/useCycleStore');
    const store = useCycleStore.getState();

    for (const p of result.periods) {
      // Source-of-truth: skip if a manual period already covers this start date
      const existing = store.periods.find(
        (x: any) => x.startDate === p.startDate,
      );
      if (existing) {
        const existingPriority = SOURCE_PRIORITY[(existing.source as BiomarkerSource) ?? 'manual'] ?? 0;
        const incomingPriority = SOURCE_PRIORITY[p.source] ?? 0;
        if (existingPriority >= incomingPriority) {
          stats.skippedByPriority++;
          continue;
        }
      }

      if (existing) {
        // Matching manual/older row exists — merge the imported fields in.
        store.updatePeriod?.(existing.id, {
          startDate: p.startDate,
          endDate: p.endDate,
          dailyFlow: p.dailyFlow,
          source: p.source,
        });
      } else {
        // Brand-new import: insert through the store so it renders,
        // persists locally, and syncs to Supabase (updatePeriod's map()
        // would no-op on an id that isn't in the store yet).
        store.importPeriod?.(p);
      }
      stats.periodsImported++;
    }

    for (const d of result.cycleDayLogs) {
      const existing = store.getDayLog?.(d.date);
      if (existing) {
        const existingPriority = SOURCE_PRIORITY[(existing.source as BiomarkerSource) ?? 'manual'] ?? 0;
        const incomingPriority = SOURCE_PRIORITY[d.source] ?? 0;
        if (existingPriority >= incomingPriority) {
          stats.skippedByPriority++;
          continue;
        }
      }
      store.upsertDayLog?.(d.date, {
        flow: d.flow,
        symptoms: d.symptoms ?? [],
        moods: d.moods ?? [],
        discharge: d.discharge,
        bbt: d.bbt,
        bbtSource: d.bbtSource,
        sexualActivity: d.sexualActivity,
        positiveOvulationTest: d.positiveOvulationTest,
        positivePregnancyTest: d.positivePregnancyTest,
        source: d.source,
      });
      stats.cycleDaysImported++;
    }
  } catch (err) {
    stats.errors.push(`cycle route failed: ${String(err)}`);
  }

  // ── Weight / BBT / biometrics — write into check-in history ────────────
  // For 1.9.0 we just preserve the samples in memory; the full
  // check-in-from-HealthKit pipeline lands in 1.9.1.
  try {
    const weightSamples = result.scalars.filter((s: ScalarSample) => s.scope === 'weight');
    if (weightSamples.length > 0) {
      const { useHealthProfileStore } = require('../../store/useHealthProfileStore');
      const profile = useHealthProfileStore.getState();
      // Use the most recent weight sample to update body metrics
      const latest = weightSamples.sort((a: ScalarSample, b: ScalarSample) =>
        a.timestamp > b.timestamp ? -1 : 1,
      )[0];
      if (latest && latest.value > 50 && latest.value < 600) {
        profile.setBodyMetrics?.({ weightLbs: Math.round(latest.value * 10) / 10 });
      }
    }
  } catch (err) {
    stats.errors.push(`weight route failed: ${String(err)}`);
  }

  // ── Daily biometrics (steps / hrv / rhr / spo2 / vo2 / respiratory) ───
  try {
    const {
      useBiometricsStore,
      biometricScopeFromSyncScope,
      toLocalDateKey,
    } = require('../../store/useBiometricsStore');
    const biometricsStore = useBiometricsStore.getState();

    // Scalars → daily readings
    const dailyAggregates = new Map<string, ScalarSample>();
    for (const sample of result.scalars) {
      const cacheScope = biometricScopeFromSyncScope(sample.scope);
      if (!cacheScope) continue;
      const dateKey = toLocalDateKey(sample.timestamp);
      const aggKey = `${dateKey}|${cacheScope}|${sample.source}`;
      // For cumulative scopes (steps / active_calories) we want the
      // most recent / highest sample for the day. For instantaneous
      // scopes (hrv / rhr) the most recent is also fine.
      const existing = dailyAggregates.get(aggKey);
      if (!existing || sample.timestamp > existing.timestamp) {
        dailyAggregates.set(aggKey, sample);
      }
    }
    for (const [key, sample] of dailyAggregates) {
      const [dateKey, cacheScope] = key.split('|');
      const wrote = biometricsStore.upsertReading({
        date: dateKey,
        scope: cacheScope as any,
        value: sample.value,
        unit: sample.unit,
        source: sample.source,
        updatedAt: result.syncedAt,
      });
      if (wrote) stats.biometricsImported++;
      else stats.skippedByPriority++;
    }

    // Sleep → totalMinutes + deep + rem (3 readings per night)
    for (const sleep of result.sleeps) {
      const dateKey = toLocalDateKey(sleep.endIso); // sleep "belongs" to wake date
      const writes: { scope: any; value?: number }[] = [
        { scope: 'sleep_minutes', value: sleep.totalMinutes },
        { scope: 'sleep_deep_minutes', value: sleep.deepMinutes },
        { scope: 'sleep_rem_minutes', value: sleep.remMinutes },
      ];
      for (const w of writes) {
        if (w.value == null) continue;
        const wrote = biometricsStore.upsertReading({
          date: dateKey,
          scope: w.scope,
          value: w.value,
          unit: 'min',
          source: sleep.source,
          updatedAt: result.syncedAt,
        });
        if (wrote && w.scope === 'sleep_minutes') stats.sleepsImported++;
        else if (!wrote) stats.skippedByPriority++;
      }
    }
  } catch (err) {
    stats.errors.push(`biometrics route failed: ${String(err)}`);
  }

  return stats;
}
