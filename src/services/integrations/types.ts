/**
 * BiomarkerAdapter — a single interface every data-source integration
 * implements. Writing four adapters (HealthKit, Health Connect, Oura,
 * Whoop) against it validates the shape before we add more.
 *
 * Scope:
 *   - `available()` — is the SDK present / platform supports it?
 *   - `connect()` / `disconnect()` — OAuth / permission prompts
 *   - `status()` — current connection state
 *   - `sync(scopes)` — fetch readings for requested scopes since last sync
 *
 * All reads are normalized to our internal types and tagged with the
 * adapter's `source` so the source-of-truth resolver can prioritize.
 */

import type {
  BiomarkerSource,
  BiomarkerScope,
  PeriodEntry,
  CycleDayLog,
} from '../../types/cycle';

// ── Normalized sample types ────────────────────────────────────────────────

export interface ScalarSample {
  scope: BiomarkerScope;
  value: number;
  unit: string;
  /** ISO timestamp of the measurement. */
  timestamp: string;
  source: BiomarkerSource;
}

export interface RangeSample {
  scope: BiomarkerScope;
  /** e.g. systolic / diastolic blood pressure */
  values: Record<string, number>;
  unit: string;
  timestamp: string;
  source: BiomarkerSource;
}

export interface SleepSample {
  scope: 'sleep';
  startIso: string;
  endIso: string;
  totalMinutes: number;
  deepMinutes?: number;
  remMinutes?: number;
  lightMinutes?: number;
  awakeMinutes?: number;
  source: BiomarkerSource;
}

export interface SyncResult {
  scalars: ScalarSample[];
  ranges: RangeSample[];
  sleeps: SleepSample[];
  /** Any period/cycle events we pulled from HealthKit / Health Connect. */
  periods: PeriodEntry[];
  cycleDayLogs: CycleDayLog[];
  /** Arbitrary source-specific notes for logs. */
  notes?: string;
  /** ISO timestamp this sync completed at. */
  syncedAt: string;
}

export interface AdapterStatus {
  connected: boolean;
  lastSyncedAt?: string;
  message?: string;
  error?: string;
}

export interface BiomarkerAdapter {
  source: BiomarkerSource;
  /** Whether this platform/SDK combo supports the adapter. */
  available(): boolean;
  /** Whether the user has granted permission to this source. */
  isAuthorized(): Promise<boolean>;
  /** Trigger OAuth / permissions prompt. */
  connect(scopes: BiomarkerScope[]): Promise<boolean>;
  /** Revoke tokens / clear state. */
  disconnect(): Promise<void>;
  /** Current status for UI display. */
  status(): Promise<AdapterStatus>;
  /** Pull readings for the requested scopes since the last sync. */
  sync(scopes: BiomarkerScope[], sinceIso?: string): Promise<SyncResult>;
}

export const EMPTY_SYNC_RESULT: SyncResult = {
  scalars: [],
  ranges: [],
  sleeps: [],
  periods: [],
  cycleDayLogs: [],
  syncedAt: new Date().toISOString(),
};
