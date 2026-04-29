/**
 * Daily Insights — picks the single most-relevant insight to surface on
 * the home dashboard right now, derived from real user state.
 *
 * Designed to be the passive, "Aimee notices..." voice. Each candidate
 * has a priority. We return the highest-priority one that fires; the UI
 * renders it as a single card with a primary CTA. This is NOT a chat
 * prompt — Aimee's nudge chips already cover that pattern.
 *
 * Returns null when nothing fires — the home card hides itself.
 */

import { useDoseLogStore } from '../store/useDoseLogStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { useBiometricsStore } from '../store/useBiometricsStore';
import { useLabResultsStore, LAB_MARKERS } from '../store/useLabResultsStore';
import { getPeptideById } from '../data/peptides';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { computeCyclePhase, PHASE_BLURBS } from './cycleService';

export interface DailyInsight {
  /** Stable id for analytics + de-dupe within a session. */
  id: string;
  /** Header label — bold, ~3 words. */
  title: string;
  /** Short explanation — 1-2 sentences. */
  body: string;
  /** Primary action label. */
  ctaLabel: string;
  /** Route or callback hint — UI decides how to dispatch. */
  ctaRoute: string;
  /** Ionicons name. */
  icon:
    | 'sparkles-outline'
    | 'pulse-outline'
    | 'flower-outline'
    | 'flask-outline'
    | 'moon-outline'
    | 'trending-up-outline'
    | 'trending-down-outline'
    | 'heart-outline'
    | 'warning-outline';
  /** Accent color from the theme palette. */
  accentColor: string;
  /** Higher = surface first. */
  priority: number;
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
 * Compute the highest-priority insight for right now. Reads stores via
 * getState() so consumers don't pin to every store update.
 */
export function getTodaysInsight(): DailyInsight | null {
  const candidates: DailyInsight[] = [];

  const today = todayKey();

  // ── 1. Out-of-range lab marker — highest priority. Health-first. ──
  try {
    const results = useLabResultsStore.getState().results;
    if (results.length > 0) {
      const sorted = [...results].sort((a, b) => b.date.localeCompare(a.date));
      const oor = sorted.find((r) => {
        const m = LAB_MARKERS.find((mk) => mk.id === r.markerId);
        if (!m || m.refLow == null || m.refHigh == null) return false;
        return r.value < m.refLow || r.value > m.refHigh;
      });
      if (oor) {
        const marker = LAB_MARKERS.find((mk) => mk.id === oor.markerId);
        if (marker) {
          const overUnder = oor.value > (marker.refHigh ?? 0) ? 'above' : 'below';
          candidates.push({
            id: `lab-oor-${marker.id}`,
            title: `${marker.label} flagged`,
            body: `Your most recent ${marker.label.toLowerCase()} (${oor.value} ${marker.unit}) is ${overUnder} the typical reference range. Aimee can walk you through what that means and what to discuss with your provider.`,
            ctaLabel: 'Discuss with Aimee',
            ctaRoute: `/(tabs)/peptalk?prefill=My ${marker.label} came back ${oor.value} ${marker.unit} — what does that mean?`,
            icon: 'pulse-outline',
            accentColor: '#B45309',
            priority: 95,
          });
        }
      }
    }
  } catch { /* ignore */ }

  // ── 2. Recovery signal: sustained low HRV vs baseline ──
  try {
    const bio = useBiometricsStore.getState();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const last7 = bio.avgScopeInRange?.('hrv', weekAgo, today) ?? null;
    const last30 = bio.avgScopeInRange?.('hrv', monthAgo, today) ?? null;
    if (last7 != null && last30 != null && last30 > 0) {
      const ratio = last7 / last30;
      if (ratio < 0.85) {
        candidates.push({
          id: 'hrv-trending-down',
          title: 'Recovery is dragging',
          body: `Your 7-day HRV avg (${Math.round(last7)} ms) is ~${Math.round((1 - ratio) * 100)}% below your 30-day baseline. Worth checking sleep, training load, and stress before stacking anything taxing this week.`,
          ctaLabel: 'See trends',
          ctaRoute: '/(tabs)/calendar',
          icon: 'trending-down-outline',
          accentColor: '#B45309',
          priority: 80,
        });
      } else if (ratio > 1.1) {
        candidates.push({
          id: 'hrv-trending-up',
          title: 'Recovery looks strong',
          body: `Your 7-day HRV (${Math.round(last7)} ms) is up ~${Math.round((ratio - 1) * 100)}% over your 30-day baseline. Good window for a hard training session.`,
          ctaLabel: 'Open workouts',
          ctaRoute: '/(tabs)/workouts',
          icon: 'trending-up-outline',
          accentColor: '#6FA891',
          priority: 55,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 3. Sleep debt — recent average significantly below 7h ──
  try {
    const bio = useBiometricsStore.getState();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const avgSleepMin = bio.avgScopeInRange?.('sleep_minutes', weekAgo, today) ?? null;
    if (avgSleepMin != null && avgSleepMin < 6 * 60) {
      const h = Math.floor(avgSleepMin / 60);
      const m = Math.round(avgSleepMin % 60);
      candidates.push({
        id: 'sleep-debt',
        title: 'Sleep is short',
        body: `Last 7 days you've averaged ${h}h ${m}m. That's well below the 7-9h that supports recovery, hormone balance, and GLP-1 / GH protocol response.`,
        ctaLabel: 'Log a check-in',
        ctaRoute: '/(tabs)/check-in',
        icon: 'moon-outline',
        accentColor: '#9B86A4',
        priority: 70,
      });
    }
  } catch { /* ignore */ }

  // ── 4. Cycle phase × peptide guidance ──
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
      if (phaseInfo && phaseInfo.daysUntilNextPeriod <= 3 && phaseInfo.daysUntilNextPeriod > 0) {
        candidates.push({
          id: 'cycle-period-soon',
          title: `Period in ${phaseInfo.daysUntilNextPeriod} day${phaseInfo.daysUntilNextPeriod === 1 ? '' : 's'}`,
          body: 'Iron-rich meals + extra hydration + lighter training tend to feel best in the day or two before. Aimee can pull a personalized prep checklist.',
          ctaLabel: 'Open Aimee',
          ctaRoute: '/(tabs)/peptalk?prefill=My period is in a couple days — give me a prep checklist',
          icon: 'flower-outline',
          accentColor: '#9B86A4',
          priority: 65,
        });
      } else if (phaseInfo) {
        // Always-fires fallback for female cycle-tracked users when nothing
        // urgent is happening — keep the phase top-of-mind without nagging.
        candidates.push({
          id: `cycle-phase-${phaseInfo.phase}`,
          title: `${phaseInfo.phase[0].toUpperCase()}${phaseInfo.phase.slice(1)} phase, day ${phaseInfo.dayOfCycle}`,
          body: PHASE_BLURBS[phaseInfo.phase],
          ctaLabel: 'See cycle dashboard',
          ctaRoute: '/cycle',
          icon: 'flower-outline',
          accentColor: '#9B86A4',
          priority: 35,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 5. Active titration step bumping next week ──
  try {
    const dose = useDoseLogStore.getState();
    const active = dose.protocols.filter((p) => p.isActive);
    for (const p of active) {
      if (!p.startDate || !p.templateId) continue;
      const template = PROTOCOL_TEMPLATES.find((tp) => tp.id === p.templateId);
      const schedule = template?.titrationSchedule;
      if (!schedule) continue;
      const dayOfCycle = Math.max(1, daysBetween(p.startDate, today) + 1);
      const weekOfCycle = Math.ceil(dayOfCycle / 7);
      const idx = schedule.findIndex(
        (s) => weekOfCycle >= s.weekStart && (s.weekEnd == null || weekOfCycle <= s.weekEnd),
      );
      if (idx === -1 || idx === schedule.length - 1) continue;
      const current = schedule[idx];
      const next = schedule[idx + 1];
      if (current.weekEnd == null) continue;
      const daysToBump = (current.weekEnd - weekOfCycle + 1) * 7 - (dayOfCycle % 7 || 7);
      if (daysToBump >= 0 && daysToBump <= 7) {
        const peptideName = getPeptideById(p.peptideId)?.name ?? p.peptideId;
        candidates.push({
          id: `titration-bump-${p.peptideId}`,
          title: `${peptideName} step bumps soon`,
          body: `In ${daysToBump} day${daysToBump === 1 ? '' : 's'} you move from ${current.dose} ${current.unit} to ${next.dose} ${next.unit}. Common to feel a bit more GI noise the first week of a step — keep hydration up.`,
          ctaLabel: 'Ask Aimee',
          ctaRoute: `/(tabs)/peptalk?prefill=What should I expect when ${peptideName} bumps to ${next.dose}${next.unit}?`,
          icon: 'trending-up-outline',
          accentColor: '#3E7CB1',
          priority: 75,
        });
        break; // one is enough
      }
    }
  } catch { /* ignore */ }

  // ── 6. Streak win — surface positive momentum ──
  try {
    const checkIns = useCheckinStore.getState().entries;
    const streak = checkIns.length === 0 ? 0 : (() => {
      let n = 0;
      const set = new Set(checkIns.map((c) => c.date));
      const cursor = new Date();
      while (true) {
        const k = cursor.toISOString().slice(0, 10);
        if (!set.has(k)) break;
        n++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return n;
    })();
    if (streak >= 7 && streak % 7 === 0) {
      candidates.push({
        id: `streak-${streak}`,
        title: `${streak}-day check-in streak`,
        body: 'You\'re building real signal. The longer the streak, the more accurate Aimee\'s recovery / mood / energy correlations get.',
        ctaLabel: 'Log today',
        ctaRoute: '/(tabs)/check-in',
        icon: 'sparkles-outline',
        accentColor: '#6FA891',
        priority: 30,
      });
    }
  } catch { /* ignore */ }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.priority - a.priority)[0];
}
