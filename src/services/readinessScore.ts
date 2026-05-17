/**
 * Readiness score — 0-100 composite of biometrics + check-in signals
 * normalized against the user's own 30-day baseline (not population norms).
 *
 * Inputs (each contributes proportionally based on what's available):
 *   - HRV vs 30-day baseline (positive when above)
 *   - Resting HR vs 30-day baseline (positive when below)
 *   - Sleep last night vs 7-day baseline (positive when above)
 *   - Most recent check-in: mood + energy + recovery 1-5 ratings (averaged, scaled)
 *
 * Returns null when nothing is available (no biometrics + no check-ins).
 * Falls back gracefully when only one or two inputs exist.
 */

import { useBiometricsStore } from '../store/useBiometricsStore';
import { useCheckinStore } from '../store/useCheckinStore';

export interface ReadinessSummary {
  /** 0-100. */
  score: number;
  /** "Ready / Hold steady / Recover" — one-word verdict. */
  verdict: 'recover' | 'hold' | 'ready';
  /** Per-input contributions used so the UI can explain the score. */
  inputs: { label: string; value: string; delta?: string }[];
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 50% baseline → 50 score; ±20% delta → ±25 score points. Capped 0-100. */
function deltaToScore(current: number, baseline: number, higherIsBetter: boolean): number {
  if (baseline === 0) return 50;
  const ratio = current / baseline;
  const direction = higherIsBetter ? ratio - 1 : 1 - ratio;
  const scaled = direction * (25 / 0.2); // ±20% delta = ±25 points
  return Math.max(0, Math.min(100, 50 + scaled));
}

export function getReadinessScore(): ReadinessSummary | null {
  const today = toDateKey(new Date());
  const weekAgo = toDateKey(new Date(Date.now() - 7 * 86_400_000));
  const monthAgo = toDateKey(new Date(Date.now() - 30 * 86_400_000));

  const inputs: ReadinessSummary['inputs'] = [];
  const subscores: number[] = [];

  try {
    const bio = useBiometricsStore.getState();

    const hrv7 = bio.avgScopeInRange?.('hrv', weekAgo, today) ?? null;
    const hrv30 = bio.avgScopeInRange?.('hrv', monthAgo, today) ?? null;
    if (hrv7 != null && hrv30 != null && hrv30 > 0) {
      const sub = deltaToScore(hrv7, hrv30, true);
      subscores.push(sub);
      const pct = Math.round((hrv7 / hrv30 - 1) * 100);
      inputs.push({
        label: 'HRV',
        value: `${Math.round(hrv7)} ms`,
        delta: pct > 0 ? `+${pct}% vs 30d` : pct < 0 ? `${pct}% vs 30d` : 'flat vs 30d',
      });
    }

    const rhr7 = bio.avgScopeInRange?.('resting_heart_rate', weekAgo, today) ?? null;
    const rhr30 = bio.avgScopeInRange?.('resting_heart_rate', monthAgo, today) ?? null;
    if (rhr7 != null && rhr30 != null && rhr30 > 0) {
      const sub = deltaToScore(rhr7, rhr30, false);
      subscores.push(sub);
      const pct = Math.round((rhr7 / rhr30 - 1) * 100);
      inputs.push({
        label: 'Resting HR',
        value: `${Math.round(rhr7)} bpm`,
        delta: pct > 0 ? `+${pct}% vs 30d` : pct < 0 ? `${pct}% vs 30d` : 'flat vs 30d',
      });
    }

    const sleepLast = bio.getReading?.(today, 'sleep_minutes')?.value
      ?? bio.getReading?.(toDateKey(new Date(Date.now() - 86_400_000)), 'sleep_minutes')?.value
      ?? null;
    const sleepWeek = bio.avgScopeInRange?.('sleep_minutes', weekAgo, today) ?? null;
    if (sleepLast != null && sleepWeek != null && sleepWeek > 0) {
      const sub = deltaToScore(sleepLast, sleepWeek, true);
      subscores.push(sub);
      const h = Math.floor(sleepLast / 60);
      const m = Math.round(sleepLast % 60);
      const pct = Math.round((sleepLast / sleepWeek - 1) * 100);
      inputs.push({
        label: 'Sleep',
        value: `${h}h ${m}m`,
        delta: pct > 0 ? `+${pct}% vs 7d` : pct < 0 ? `${pct}% vs 7d` : 'flat vs 7d',
      });
    }
  } catch { /* ignore */ }

  // Most recent check-in within last 2 days
  try {
    const checkIns = useCheckinStore.getState().entries;
    if (checkIns.length > 0) {
      const sorted = [...checkIns].sort((a, b) => b.date.localeCompare(a.date));
      const recent = sorted.find((c) => {
        const days = Math.abs(
          (new Date(c.date + 'T12:00:00').getTime() - Date.now()) / 86_400_000,
        );
        return days <= 2;
      });
      if (recent) {
        const ratings = ([recent.mood, recent.energy, recent.recovery] as unknown[]).filter(
          (n): n is number => typeof n === 'number',
        );
        if (ratings.length > 0) {
          // 1-5 rating → 0-100 score linearly
          const avg = ratings.reduce((s, n) => s + n, 0) / ratings.length;
          const sub = Math.round(((avg - 1) / 4) * 100);
          subscores.push(sub);
          inputs.push({
            label: 'Self-rating',
            value: `${avg.toFixed(1)} / 5`,
          });
        }
      }
    }
  } catch { /* ignore */ }

  if (subscores.length === 0) return null;

  const score = Math.round(
    subscores.reduce((acc, n) => acc + n, 0) / subscores.length,
  );
  const verdict: ReadinessSummary['verdict'] =
    score >= 70 ? 'ready' : score >= 45 ? 'hold' : 'recover';

  return { score, verdict, inputs };
}
