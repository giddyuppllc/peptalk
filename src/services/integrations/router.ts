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

      store.updatePeriod?.(existing?.id ?? p.id, {
        startDate: p.startDate,
        endDate: p.endDate,
        dailyFlow: p.dailyFlow,
        source: p.source,
      });
      if (!existing) {
        // updatePeriod only merges existing rows; for new imports, push directly
        store.periods.unshift(p);
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

  // ── Sleep / HRV / RHR — noted for 1.9.1 check-in auto-fill ─────────────
  // We don't have a dedicated biometrics store yet; the check-in flow
  // reads live from HealthKit rather than from a cached layer. This is
  // where we'd land sleeps / hrv / rhr samples once that store exists.
  void _keepReferenced(result.sleeps);

  return stats;
}

function _keepReferenced(_: SleepSample[]): void {
  // Intentionally empty — placeholder so the sleep-sample param isn't
  // treated as unused while the downstream store is under construction.
}
