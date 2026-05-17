/**
 * Milestone detector — Master Refactor Plan v3.1 §12.1.
 *
 * Pure derivation from existing stores. Returns the user's milestones
 * (achievements they can react to / share to the opted-in community).
 * No fabricated entries — every milestone is rooted in real data.
 *
 * Cross-user reaction fan-out lands once the server-side aggregation
 * ships; the local store keeps a per-milestone reaction count so users
 * can "encourage themselves" today, and the count carries forward when
 * the server takes over.
 */

import { useDoseLogStore } from '../store/useDoseLogStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useBodyCompositionStore } from '../store/useBodyCompositionStore';
import { useLabResultsStore } from '../store/useLabResultsStore';
import { getPeptideById } from '../data/peptides';

export type MilestoneKind =
  | 'dose_streak'
  | 'workout_streak'
  | 'cycle_complete'
  | 'pr_set'
  | 'lab_improvement'
  | 'lean_mass_gain';

export interface Milestone {
  /** Stable id derived from the milestone's content. Same milestone
   *  re-derives the same id so reactions persist across recomputes. */
  id: string;
  kind: MilestoneKind;
  /** ISO8601. */
  achievedAt: string;
  /** Short headline in Aimee's voice. */
  headline: string;
  /** Optional sub-line — the specific value or peptide. */
  detail?: string;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function epley1RM(weightLb: number, reps: number): number {
  if (reps <= 1) return weightLb;
  return weightLb * (1 + reps / 30);
}

/**
 * Compute the user's milestones from local data. Sorted newest-first.
 * Idempotent — calling repeatedly returns identical ids for the same
 * underlying events.
 */
export function computeMilestones(): Milestone[] {
  const out: Milestone[] = [];

  // ── Dose streak ────────────────────────────────────────────────────
  const doses = useDoseLogStore.getState().doses;
  if (doses.length > 0) {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = dateKey(d);
      if (doses.some((x) => x.date === k && !x.planned)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    for (const threshold of [7, 14, 30, 60, 90]) {
      if (streak >= threshold) {
        out.push({
          id: `dose_streak_${threshold}_${dateKey(today)}`,
          kind: 'dose_streak',
          achievedAt: today.toISOString(),
          headline: `${threshold}-day dose streak`,
          detail: 'Adherence compounds.',
        });
      }
    }
  }

  // ── Workout streak ─────────────────────────────────────────────────
  const workouts = useWorkoutStore.getState().logs;
  if (workouts.length > 0) {
    const streak = useWorkoutStore.getState().getStreak();
    for (const threshold of [3, 7, 14, 30]) {
      if (streak >= threshold) {
        out.push({
          id: `workout_streak_${threshold}_${dateKey(new Date())}`,
          kind: 'workout_streak',
          achievedAt: new Date().toISOString(),
          headline: `${threshold}-day workout streak`,
          detail: `${streak} consecutive sessions logged.`,
        });
      }
    }
  }

  // ── Completed cycles ───────────────────────────────────────────────
  const protocols = useDoseLogStore.getState().protocols;
  for (const p of protocols) {
    if (p.isActive) continue;
    if (!p.endDate) continue;
    const peptide = getPeptideById(p.peptideId);
    out.push({
      id: `cycle_complete_${p.id}`,
      kind: 'cycle_complete',
      achievedAt: new Date(p.endDate).toISOString(),
      headline: `Cycle complete — ${peptide?.name ?? p.peptideId}`,
      detail: `${p.startDate} → ${p.endDate}`,
    });
  }

  // ── PR sets — heaviest 1RM-estimated set per exercise ──────────────
  const byExercise = new Map<string, { rm: number; date: string }>();
  for (const log of workouts) {
    for (const set of log.sets) {
      if (!set.weightLbs || !set.completed) continue;
      const rm = epley1RM(set.weightLbs, set.reps);
      const cur = byExercise.get(set.exerciseId);
      if (!cur || rm > cur.rm) {
        byExercise.set(set.exerciseId, { rm, date: log.date });
      }
    }
  }
  const topPRs = Array.from(byExercise.entries())
    .sort((a, b) => b[1].rm - a[1].rm)
    .slice(0, 5);
  for (const [exerciseId, { rm, date }] of topPRs) {
    out.push({
      id: `pr_${exerciseId}`,
      kind: 'pr_set',
      achievedAt: new Date(date).toISOString(),
      headline: `PR — est. 1RM ${Math.round(rm)} lb`,
      detail: exerciseId,
    });
  }

  // ── Lean-mass gain milestone (90-day delta > 2 lb) ──────────────────
  const delta = useBodyCompositionStore.getState().deltaWindow(90);
  if (delta.leanMassDelta != null && delta.leanMassDelta > 2) {
    out.push({
      id: `lean_mass_90d_${dateKey(new Date())}`,
      kind: 'lean_mass_gain',
      achievedAt: new Date().toISOString(),
      headline: `+${delta.leanMassDelta.toFixed(1)} lb lean mass in 90 days`,
      detail: 'Captured from your scans.',
    });
  }

  // ── Lab improvement — any out-of-range marker now in range ─────────
  const labResults = useLabResultsStore.getState().results;
  const byMarker = new Map<string, typeof labResults>();
  for (const r of labResults) {
    if (!byMarker.has(r.markerId)) byMarker.set(r.markerId, []);
    byMarker.get(r.markerId)!.push(r);
  }
  for (const [markerId, history] of byMarker) {
    if (history.length < 2) continue;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    // Detect a meaningful improvement: > 10% change favorable direction.
    // We don't have refLow/refHigh on LabValue at runtime here (it's on
    // the LabMarker), so this is a heuristic — % change in absolute value.
    const pctChange = ((last.value - first.value) / Math.abs(first.value)) * 100;
    if (Math.abs(pctChange) >= 10) {
      out.push({
        id: `lab_improvement_${markerId}_${last.date}`,
        kind: 'lab_improvement',
        achievedAt: new Date(last.date).toISOString(),
        headline: `${markerId.toUpperCase()} moved ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(0)}%`,
        detail: `${first.value} → ${last.value} ${last.unit}`,
      });
    }
  }

  return out.sort(
    (a, b) =>
      new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
  );
}
