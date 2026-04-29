/**
 * Aimee proactive nudges — context-aware empty-state prompts.
 *
 * Replaces the 3 generic empty-state chips on the Aimee chat screen
 * with prompts that reference the user's actual state: skipped check-in,
 * dose due, titration step about to bump, period approaching, lab out
 * of range, etc.
 *
 * Returns up to 4 nudges in priority order. Each nudge is a string the
 * user can tap to send to Aimee — phrased as the user would naturally
 * speak it, not as an instruction to the model.
 */

import { useDoseLogStore } from '../store/useDoseLogStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { useLabResultsStore, LAB_MARKERS } from '../store/useLabResultsStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { getPeptideById } from '../data/peptides';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { computeCyclePhase } from './cycleService';
import { getGoalLabel } from '../constants/goals';
import type { GoalType } from '../types';

export interface AimeeNudge {
  /** Short label shown on the chip. Phrased as user speech. */
  prompt: string;
  /** Icon name for the chip. */
  icon:
    | 'sparkles-outline'
    | 'clipboard-outline'
    | 'flask-outline'
    | 'flower-outline'
    | 'trending-up-outline'
    | 'warning-outline'
    | 'time-outline'
    | 'pulse-outline';
  /** Higher = surfaced first. Within same priority, source order wins. */
  priority: number;
  /** Tag for analytics. */
  source: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T12:00:00').getTime();
  const b = new Date(toIso + 'T12:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Build the context-aware list of nudges. Reads stores via getState() —
 * doesn't subscribe, so the caller can decide when to recompute (e.g.
 * once per chat-screen mount).
 */
export function getAimeeNudges(): AimeeNudge[] {
  const nudges: AimeeNudge[] = [];

  const today = todayKey();

  // ── Check-in today ────────────────────────────────────────────────
  try {
    const checkIns = useCheckinStore.getState().entries;
    const hasCheckedInToday = checkIns.some((c) => c.date === today);
    if (!hasCheckedInToday && checkIns.length > 0) {
      nudges.push({
        prompt: "I haven't checked in today — what should I focus on?",
        icon: 'clipboard-outline',
        priority: 70,
        source: 'no_checkin_today',
      });
    }
  } catch {
    /* ignore */
  }

  // ── Active protocols → dose timing + titration step bumps ────────
  try {
    const dose = useDoseLogStore.getState();
    const active = dose.protocols.filter((p) => p.isActive);
    for (const p of active) {
      if (!p.startDate) continue;
      const peptide = getPeptideById(p.peptideId);
      const peptideName = peptide?.name ?? p.peptideId;
      const template = p.templateId
        ? PROTOCOL_TEMPLATES.find((tp) => tp.id === p.templateId)
        : undefined;

      const dayOfCycle = Math.max(1, daysBetween(p.startDate, today) + 1);
      const weekOfCycle = Math.ceil(dayOfCycle / 7);

      // Missed-dose nudge: most recent dose for this peptide
      const lastDose = dose.doses
        .filter((d) => d.peptideId === p.peptideId)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const daysSinceDose = lastDose ? daysBetween(lastDose.date, today) : null;
      if (daysSinceDose != null && daysSinceDose >= 2 && p.frequency === 'daily') {
        nudges.push({
          prompt: `I missed my last ${peptideName} dose — what should I do?`,
          icon: 'warning-outline',
          priority: 90,
          source: 'missed_dose',
        });
      }

      // Titration step bump nudge — surfaces 5 days BEFORE the next step
      // so the user has time to ask "what should I expect at 7.5mg?".
      const schedule = template?.titrationSchedule;
      if (schedule) {
        const currentStepIdx = schedule.findIndex(
          (s) =>
            weekOfCycle >= s.weekStart &&
            (s.weekEnd == null || weekOfCycle <= s.weekEnd),
        );
        const currentStep = currentStepIdx >= 0 ? schedule[currentStepIdx] : undefined;
        const nextStep =
          currentStepIdx >= 0 && currentStepIdx < schedule.length - 1
            ? schedule[currentStepIdx + 1]
            : undefined;
        if (currentStep && nextStep && currentStep.weekEnd != null) {
          const daysToBump =
            (currentStep.weekEnd - weekOfCycle + 1) * 7 - (dayOfCycle % 7 || 7);
          if (daysToBump >= 0 && daysToBump <= 5) {
            nudges.push({
              prompt: `What should I expect when ${peptideName} bumps from ${currentStep.dose}${currentStep.unit} to ${nextStep.dose}${nextStep.unit}?`,
              icon: 'trending-up-outline',
              priority: 80,
              source: 'titration_bump',
            });
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  // ── Cycle nudges (female + tracking enabled) ─────────────────────
  try {
    const profile = useHealthProfileStore.getState().profile;
    if (
      profile?.biologicalSex === 'female' &&
      profile?.cycle?.trackingEnabled &&
      profile?.cycle?.lastPeriodStartDate
    ) {
      const phaseInfo = computeCyclePhase(
        profile.cycle.lastPeriodStartDate,
        profile.cycle.typicalCycleLength,
        profile.cycle.typicalPeriodLength,
      );
      if (phaseInfo) {
        if (phaseInfo.daysUntilNextPeriod <= 3 && phaseInfo.daysUntilNextPeriod > 0) {
          nudges.push({
            prompt: `My period is in ${phaseInfo.daysUntilNextPeriod} day${phaseInfo.daysUntilNextPeriod === 1 ? '' : 's'} — how can I prepare?`,
            icon: 'flower-outline',
            priority: 75,
            source: 'period_approaching',
          });
        } else if (phaseInfo.phase === 'ovulatory') {
          nudges.push({
            prompt: 'Anything I should know about training and nutrition during ovulation?',
            icon: 'flower-outline',
            priority: 50,
            source: 'cycle_phase',
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  // ── Lab values out of range ──────────────────────────────────────
  try {
    const results = useLabResultsStore.getState().results;
    if (results.length > 0) {
      // Find one out-of-range value to ask about. If multiple, take the
      // most recent so the question references current data.
      const sorted = [...results].sort((a, b) => b.date.localeCompare(a.date));
      const oor = sorted.find((r) => {
        const m = LAB_MARKERS.find((mk) => mk.id === r.markerId);
        if (!m || m.refLow == null || m.refHigh == null) return false;
        return r.value < m.refLow || r.value > m.refHigh;
      });
      if (oor) {
        const marker = LAB_MARKERS.find((mk) => mk.id === oor.markerId);
        if (marker) {
          nudges.push({
            prompt: `My ${marker.label} came back ${oor.value} ${marker.unit} — what does that mean?`,
            icon: 'pulse-outline',
            priority: 65,
            source: 'lab_out_of_range',
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  // ── Goal-based fallback (always offered, low priority) ───────────
  try {
    const goals: GoalType[] = useOnboardingStore.getState().profile?.healthGoals ?? [];
    if (goals.length > 0) {
      nudges.push({
        prompt: `Best peptides for ${getGoalLabel(goals[0]).toLowerCase()}?`,
        icon: 'sparkles-outline',
        priority: 30,
        source: 'goal_match',
      });
    }
  } catch {
    /* ignore */
  }

  // Always-available evergreen
  nudges.push({
    prompt: 'Based on my data, what should I focus on this week?',
    icon: 'sparkles-outline',
    priority: 20,
    source: 'evergreen',
  });

  // Sort by priority (desc), de-dupe by prompt text, cap at 4
  const seen = new Set<string>();
  return nudges
    .sort((a, b) => b.priority - a.priority)
    .filter((n) => {
      if (seen.has(n.prompt)) return false;
      seen.add(n.prompt);
      return true;
    })
    .slice(0, 4);
}
