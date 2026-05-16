/**
 * doseAdherence — shared helpers for resolving the user's "active
 * cycle" and computing their dose-adherence percent.
 *
 * The Peptides tab uses this to drive the hero AdherenceDial inside
 * TodayCycleView; the Home tab re-uses the same logic so users see
 * the same adherence number on their unified progress dashboard.
 *
 * NO React imports here on purpose — keep this a pure data helper so
 * either screen can call it inside a useMemo without spinning up an
 * extra hook.
 */

import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { getDosingReference } from '../data/peptideDosingReference';
import { getPeptideById } from '../data/peptides';
import type { ActiveProtocol, DoseLogEntry } from '../types';

export interface ActiveCycleResolved {
  protocol: ActiveProtocol;
  /** Peptide display name. */
  peptideName: string;
  /** Calendar-day index inside the cycle (1-indexed). */
  currentDay: number;
  /** Total cycle length in days. Derived from
   *  PROTOCOL_TEMPLATES.durationWeeks.min × 7, or from a parsed
   *  cycleLength on the dosing reference, falling back to 28. */
  totalDays: number;
  /** Expected number of doses by today, given frequency × days
   *  elapsed. Always >= 1 so we never divide by zero. */
  expectedDoses: number;
  /** Doses logged for this peptide inside the cycle window. */
  loggedDoses: DoseLogEntry[];
  /** Adherence percent (0-100, clamped). */
  adherencePct: number;
  /** Cycle start date (parsed, normalized to 00:00 local). */
  startDate: Date;
}

/** Convert a stored DoseLogEntry into the Date it was logged at
 *  (uses date + time fields the store writes). Falls back to
 *  createdAt, then to "now" for legacy entries with neither field. */
export function doseLoggedAt(d: DoseLogEntry): Date {
  if (d.date && d.time) {
    const dt = new Date(`${d.date}T${d.time}:00`);
    if (!isNaN(dt.getTime())) return dt;
  }
  if (d.createdAt) {
    const dt = new Date(d.createdAt);
    if (!isNaN(dt.getTime())) return dt;
  }
  return new Date();
}

/** Doses-per-week implied by a ProtocolFrequency string. */
export function dosesPerWeekFor(
  frequency: ActiveProtocol['frequency'],
): number {
  switch (frequency) {
    case 'twice_daily':
      return 14;
    case 'daily':
      return 7;
    case 'eod':
      return 3.5;
    case 'tiw':
      return 3;
    case 'biw':
      return 2;
    case 'weekly':
      return 1;
    case 'biweekly':
      return 0.5;
    case 'monthly':
      return 0.25;
    case 'custom':
    default:
      return 7;
  }
}

/** Pick the most relevant active cycle and compute its adherence.
 *  Returns null when the user has no active protocols.
 *
 *  Tie-break: most-recent startDate, then highest adherencePct. */
export function resolveActiveCycle(
  protocols: ActiveProtocol[],
  allDoses: DoseLogEntry[],
): ActiveCycleResolved | null {
  const active = protocols.filter((p) => p.isActive);
  if (active.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scored: ActiveCycleResolved[] = active.map((p) => {
    // Prefer template durationWeeks.min, fall back to a parsed
    // cycleLength string from the dosing reference, else default to
    // a 4-week cycle so the visualization is never empty.
    const template = PROTOCOL_TEMPLATES.find(
      (t) => t.peptideId === p.peptideId,
    );
    let totalDays = template?.durationWeeks?.min
      ? template.durationWeeks.min * 7
      : 28;

    const ref = getDosingReference(p.peptideId);
    if (ref?.cycleLength) {
      const m = ref.cycleLength.match(/(\d+)\s*(day|week)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 0) {
          totalDays = /week/i.test(m[2]) ? n * 7 : n;
        }
      }
    }

    const start = new Date(p.startDate);
    start.setHours(0, 0, 0, 0);
    const daysElapsed = Math.max(
      0,
      Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const currentDay = Math.min(totalDays, daysElapsed + 1);

    const cycleStartKey = start.toISOString().slice(0, 10);
    const cycleEndDate = new Date(start);
    cycleEndDate.setDate(start.getDate() + totalDays - 1);
    const cycleEndKey = cycleEndDate.toISOString().slice(0, 10);

    const loggedDoses = allDoses.filter(
      (d) =>
        d.peptideId === p.peptideId &&
        d.date >= cycleStartKey &&
        d.date <= cycleEndKey,
    );

    const expectedPerDay = dosesPerWeekFor(p.frequency) / 7;
    const expectedDoses = Math.max(
      1,
      Math.round(expectedPerDay * (daysElapsed + 1)),
    );
    const adherencePct = Math.min(
      100,
      Math.round((loggedDoses.length / expectedDoses) * 100),
    );

    const peptide = getPeptideById(p.peptideId);
    const peptideName = peptide?.name ?? p.peptideId;

    return {
      protocol: p,
      peptideName,
      currentDay,
      totalDays,
      expectedDoses,
      loggedDoses,
      adherencePct,
      startDate: start,
    };
  });

  scored.sort((a, b) => {
    const dt = b.startDate.getTime() - a.startDate.getTime();
    if (dt !== 0) return dt;
    return b.adherencePct - a.adherencePct;
  });

  return scored[0];
}
