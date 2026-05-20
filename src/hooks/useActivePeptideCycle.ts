/**
 * useActivePeptideCycle — surfaces the user's current peptide cycle for
 * the male v3 greeting subline (Master Refactor Plan v3.1 §4.5).
 *
 * Returns the most recently started ACTIVE protocol with its peptide
 * name, intent inferred from dose vs reference, current week, and
 * total cycle weeks. Returns null when no protocol is active — caller
 * collapses the subline so we don't render an empty serif row.
 */

import { useMemo } from 'react';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { getPeptideById } from '../data/peptides';
import { getDosingReference } from '../data/peptideDosingReference';

export interface ActivePeptideCycle {
  peptideId: string;
  peptideName: string;
  intent: 'Gradual' | 'Aggressive' | 'Maintenance';
  startedAt: string;
  weekNumber: number;
  totalWeeks: number | null;
}

function parseCycleWeeks(cycleLength: string | undefined): number | null {
  if (!cycleLength) return null;
  // Matches "12 weeks", "20 days on", "Weeks 4-26 off", etc.
  const weekMatch = cycleLength.match(/(\d+)\s*weeks?/i);
  if (weekMatch) return Number(weekMatch[1]);
  const dayMatch = cycleLength.match(/(\d+)\s*days?/i);
  if (dayMatch) return Math.ceil(Number(dayMatch[1]) / 7);
  return null;
}

function inferIntent(
  protocolDoseMg: number,
  scheduleDoseMgRange: { min: number; max: number } | null,
): ActivePeptideCycle['intent'] {
  if (!scheduleDoseMgRange) return 'Maintenance';
  const { min, max } = scheduleDoseMgRange;
  if (max === min) return 'Maintenance';
  const span = max - min;
  if (protocolDoseMg <= min + span * 0.33) return 'Gradual';
  if (protocolDoseMg >= max - span * 0.05) return 'Aggressive';
  return 'Maintenance';
}

export function useActivePeptideCycle(): ActivePeptideCycle | null {
  const protocols = useDoseLogStore((s) => s.protocols);

  return useMemo(() => {
    const active = protocols.filter((p) => p.isActive);
    if (active.length === 0) return null;
    // Most recently started wins when multiple are active.
    const sorted = [...active].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
    const p = sorted[0];

    const peptide = getPeptideById(p.peptideId);
    const ref = getDosingReference(p.peptideId);

    const totalWeeks = parseCycleWeeks(ref?.cycleLength);
    const daysIn = Math.floor(
      (Date.now() - new Date(p.startDate).getTime()) / 86400_000,
    );
    const weekNumber = Math.max(1, Math.floor(daysIn / 7) + 1);

    const doseMcgInProtocol = p.unit === 'mcg' ? p.dose : p.dose * 1000;
    const scheduleMcgValues =
      ref?.schedule.map((s) => s.doseMcg).filter((n) => n > 0) ?? [];
    const range =
      scheduleMcgValues.length > 0
        ? {
            min: Math.min(...scheduleMcgValues) / 1000,
            max: Math.max(...scheduleMcgValues) / 1000,
          }
        : null;

    return {
      peptideId: p.peptideId,
      peptideName: peptide?.name ?? p.peptideId,
      intent: inferIntent(doseMcgInProtocol / 1000, range),
      startedAt: p.startDate,
      weekNumber,
      totalWeeks,
    };
  }, [protocols]);
}
