/**
 * Biometrics store — durable per-day cache of synced device readings.
 *
 * The integration sync router writes here whenever any adapter (HealthKit,
 * Health Connect, Oura, Whoop, Garmin, etc.) reports a scalar/sleep
 * sample. UI components — DaySummarySheet, weekly summary, home dashboard
 * — read from here so they don't have to re-query native modules every
 * render.
 *
 * Aggregation rule: per (date, scope) we keep the highest-priority source
 * (manual > device > aggregator). Re-imports from a lower-priority source
 * never overwrite a manual entry.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import type { BiomarkerSource } from '../types/cycle';
import { SOURCE_PRIORITY } from '../types/cycle';

/** Single per-day reading for one scope (steps, hrv, etc.). */
export interface BiometricReading {
  /** YYYY-MM-DD. */
  date: string;
  /** What this reading measures. Matches BiomarkerScope. */
  scope: BiometricScope;
  value: number;
  unit: string;
  source: BiomarkerSource;
  /** Last-write timestamp — useful for "synced 12 min ago" UI. */
  updatedAt: string;
  /** Peptide IDs of any active protocol on the day this reading covers.
   *  Stamped at write-time so a "your weight while on retatrutide" trend
   *  query is a simple filter — no protocol-history join needed. Empty
   *  for readings outside any active protocol window. */
  activePeptideIds?: string[];
}

/** Scopes we cache here. Subset of BiomarkerScope — only daily-summable ones. */
export type BiometricScope =
  | 'steps'
  | 'active_calories'
  | 'resting_heart_rate'
  | 'hrv'
  | 'vo2_max'
  | 'spo2'
  | 'respiratory_rate'
  | 'weight'
  | 'body_fat'
  | 'sleep_minutes'
  | 'sleep_deep_minutes'
  | 'sleep_rem_minutes'
  | 'wrist_temp'
  | 'blood_glucose';

interface BiometricsState {
  /** Flat list — easier to filter than nested map. <2k entries even after a year. */
  readings: BiometricReading[];
}

interface BiometricsActions {
  /**
   * Upsert one reading honoring source priority. Returns true if the
   * write happened, false if a higher-priority source already exists.
   */
  upsertReading: (reading: BiometricReading) => boolean;
  /** Bulk version — for adapter sync results. */
  upsertMany: (readings: BiometricReading[]) => { written: number; skipped: number };
  /** All readings for one date, optionally filtered by scope. */
  getReadingsForDate: (date: string, scope?: BiometricScope) => BiometricReading[];
  /** Single most-authoritative reading for (date, scope). */
  getReading: (date: string, scope: BiometricScope) => BiometricReading | undefined;
  /** Sum of `value` across a date range, e.g. weekly steps. */
  sumScopeInRange: (scope: BiometricScope, startDate: string, endDate: string) => number;
  /** Average of `value` across a date range, e.g. avg HRV. */
  avgScopeInRange: (scope: BiometricScope, startDate: string, endDate: string) => number | null;
  /** All readings stamped with a given peptide id — for "weight while on
   *  retatrutide" trend cards. Filter is on the materialized
   *  activePeptideIds array, not a runtime protocol-history join. */
  getReadingsWhileOnPeptide: (peptideId: string, scope?: BiometricScope) => BiometricReading[];
  clearAll: () => void;
}

export const useBiometricsStore = create<BiometricsState & BiometricsActions>()(
  persist(
    (set, get) => ({
      readings: [],

      upsertReading: (reading) => {
        // Stamp active-peptide context if not provided. This lets a
        // "your weight while on reta" query filter on the activePeptideIds
        // array directly without joining protocol-history at read-time.
        // Lazy-loaded to avoid a static circular dep with useDoseLogStore.
        let stamped = reading;
        if (!reading.activePeptideIds) {
          try {
            const { useDoseLogStore } = require('./useDoseLogStore');
            const protocols = useDoseLogStore.getState().protocols ?? [];
            const activeOnDate = protocols
              .filter((p: any) => {
                if (!p.isActive) return false;
                if (p.startDate && reading.date < p.startDate) return false;
                if (p.endDate && reading.date > p.endDate) return false;
                return true;
              })
              .map((p: any) => p.peptideId)
              .filter(Boolean);
            stamped = { ...reading, activePeptideIds: activeOnDate };
          } catch {
            // Dose store not ready (very early boot) — write reading
            // without tagging. Future readings will tag correctly.
          }
        }

        const existing = get().readings.find(
          (r) => r.date === stamped.date && r.scope === stamped.scope,
        );
        if (existing) {
          const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
          const incomingPriority = SOURCE_PRIORITY[stamped.source] ?? 0;
          if (existingPriority > incomingPriority) return false;
          set({
            readings: get().readings.map((r) =>
              r.date === stamped.date && r.scope === stamped.scope ? stamped : r,
            ),
          });
        } else {
          set({ readings: [stamped, ...get().readings] });
        }
        return true;
      },

      upsertMany: (readings) => {
        let written = 0;
        let skipped = 0;
        for (const r of readings) {
          if (get().upsertReading(r)) written++;
          else skipped++;
        }
        return { written, skipped };
      },

      getReadingsForDate: (date, scope) => {
        const all = get().readings.filter((r) => r.date === date);
        return scope ? all.filter((r) => r.scope === scope) : all;
      },

      getReading: (date, scope) =>
        get().readings.find((r) => r.date === date && r.scope === scope),

      sumScopeInRange: (scope, startDate, endDate) => {
        return get()
          .readings.filter(
            (r) => r.scope === scope && r.date >= startDate && r.date <= endDate,
          )
          .reduce((acc, r) => acc + r.value, 0);
      },

      avgScopeInRange: (scope, startDate, endDate) => {
        const matches = get().readings.filter(
          (r) => r.scope === scope && r.date >= startDate && r.date <= endDate,
        );
        if (matches.length === 0) return null;
        const sum = matches.reduce((acc, r) => acc + r.value, 0);
        return sum / matches.length;
      },

      getReadingsWhileOnPeptide: (peptideId, scope) =>
        get().readings.filter(
          (r) =>
            r.activePeptideIds?.includes(peptideId) &&
            (!scope || r.scope === scope),
        ),

      clearAll: () => set({ readings: [] }),
    }),
    {
      name: 'peptalk-biometrics',
      storage: createJSONStorage(() => secureStorage),
      // Cap persisted size — 6 months of readings × ~10 scopes = ~1800 entries.
      // Anything older lives in cloud-side analytics; the local cache trims.
      partialize: (state) => ({
        readings: state.readings.slice(0, 2000),
      }),
    },
  ),
);

// Convenience selectors / helpers ------------------------------------------

/**
 * Map a raw HealthKit/Connect ScalarSample scope to our cache scope.
 * Returns null for scopes we don't store at the daily-aggregate level
 * (e.g. arrhythmia events).
 */
export function biometricScopeFromSyncScope(scope: string): BiometricScope | null {
  switch (scope) {
    case 'steps': return 'steps';
    case 'active_calories': return 'active_calories';
    case 'resting_heart_rate': return 'resting_heart_rate';
    case 'hrv': return 'hrv';
    case 'vo2_max': return 'vo2_max';
    case 'spo2': return 'spo2';
    case 'respiratory_rate': return 'respiratory_rate';
    case 'weight': return 'weight';
    case 'body_fat': return 'body_fat';
    case 'wrist_temp': return 'wrist_temp';
    case 'blood_glucose': return 'blood_glucose';
    default: return null;
  }
}

/**
 * Coerce ISO timestamp → YYYY-MM-DD using the device's local time.
 * Daily aggregates are date-anchored, not timestamp-anchored, so a
 * Watch reading at 11pm local belongs to that day even if UTC rolled.
 */
export function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
