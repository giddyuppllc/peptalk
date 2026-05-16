/**
 * Body Composition Store
 *
 * Storage for scan-results-over-time. Today the data comes from manual
 * entry (user types their numbers off an InBody printout / app). The
 * inBodyAdapter scaffold will populate this same store once we have
 * API credentials from InBody.
 *
 * Why a dedicated store (not Zustand health profile or HealthKit):
 *   - Multiple measurements per scan (lean mass, body fat %, ECW/TBW,
 *     BMR, segmental breakdown) that should land together as one row
 *   - Need full scan history for line charts on Home (Phase 3)
 *   - Source attribution matters — an InBody scan beats a bathroom
 *     scale reading at the source-priority table in src/types/cycle
 *   - Independent persistence so we can keep the last 365 scans
 *     without bloating the health-profile store
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BiomarkerSource } from '../types/cycle';

const uid = () =>
  `bodycomp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

/**
 * One body composition reading (typically one InBody scan, or one
 * manual data dump). Optional fields are tolerated — the user may
 * only enter weight + body fat % from a quick check-in, or a full
 * segmental breakdown from a clinic scan.
 */
export interface BodyCompositionScan {
  id: string;
  /** ISO timestamp of the scan. */
  scannedAt: string;
  source: BiomarkerSource;

  // Core metrics (almost always present)
  weightLb?: number;
  bodyFatPercent?: number;        // %
  leanMassLb?: number;            // SMM (skeletal muscle mass) or total lean
  fatMassLb?: number;

  // Fluid balance — InBody's ECW/TBW ratio. 0.36-0.39 is "balanced".
  // Above 0.39 hints at edema / inflammation; below hints at dehydration.
  ecwTbwRatio?: number;

  // Metabolism
  bmrKcal?: number;

  // Visceral fat level (InBody returns this as a 1-20 scale, not raw kg)
  visceralFatLevel?: number;

  // Segmental lean mass (lbs) — left/right asymmetry is a recovery signal
  segmental?: {
    rightArm?: number;
    leftArm?: number;
    trunk?: number;
    rightLeg?: number;
    leftLeg?: number;
  };

  // Free-text scan notes (clinic remarks, hydration state, time-of-day)
  notes?: string;
}

export interface BodyCompositionState {
  scans: BodyCompositionScan[];
  hasHydrated: boolean;

  /** Add a new scan. Returns the generated id. */
  addScan: (scan: Omit<BodyCompositionScan, 'id'>) => string;

  /** Update an existing scan by id. */
  updateScan: (id: string, patch: Partial<BodyCompositionScan>) => void;

  /** Delete a scan by id. */
  deleteScan: (id: string) => void;

  /** Most-recent scan (or null). */
  latestScan: () => BodyCompositionScan | null;

  /**
   * Scans within the last N days, oldest first (chart-friendly order).
   * Pass `null` to get the full history.
   */
  recentScans: (days: number | null) => BodyCompositionScan[];

  /**
   * Delta from oldest to newest in the window. Each field returns null
   * if either endpoint is missing that measurement.
   */
  deltaWindow: (days: number) => {
    weightLbDelta: number | null;
    bodyFatDelta: number | null;
    leanMassDelta: number | null;
  };
}

const MAX_SCANS = 365; // ~1 year of weekly scans, or 1 year of daily

export const useBodyCompositionStore = create<BodyCompositionState>()(
  persist(
    (set, get) => ({
      scans: [],
      hasHydrated: false,

      addScan: (scan) => {
        const id = uid();
        set((s) => ({
          // Newest first; clamp the tail to MAX_SCANS to keep AsyncStorage
          // payload bounded.
          scans: [{ id, ...scan }, ...s.scans].slice(0, MAX_SCANS),
        }));
        return id;
      },

      updateScan: (id, patch) => {
        set((s) => ({
          scans: s.scans.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
        }));
      },

      deleteScan: (id) => {
        set((s) => ({ scans: s.scans.filter((sc) => sc.id !== id) }));
      },

      latestScan: () => {
        const { scans } = get();
        return scans.length > 0 ? scans[0]! : null;
      },

      recentScans: (days) => {
        const { scans } = get();
        if (days === null) return [...scans].reverse(); // oldest first
        const cutoff = Date.now() - days * 86_400_000;
        return scans
          .filter((s) => new Date(s.scannedAt).getTime() >= cutoff)
          .reverse();
      },

      deltaWindow: (days) => {
        const window = get().recentScans(days);
        if (window.length < 2) {
          return { weightLbDelta: null, bodyFatDelta: null, leanMassDelta: null };
        }
        const oldest = window[0]!;
        const newest = window[window.length - 1]!;
        const diff = <K extends keyof BodyCompositionScan>(k: K): number | null => {
          const a = oldest[k];
          const b = newest[k];
          return typeof a === 'number' && typeof b === 'number'
            ? Number(((b as number) - (a as number)).toFixed(2))
            : null;
        };
        return {
          weightLbDelta: diff('weightLb'),
          bodyFatDelta: diff('bodyFatPercent'),
          leanMassDelta: diff('leanMassLb'),
        };
      },
    }),
    {
      name: 'peptalk-body-composition',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist `hasHydrated` — it's a load-time flag.
      partialize: (s) => ({ scans: s.scans }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true;
        }
      },
    },
  ),
);
