/**
 * performanceMetrics — pure functions that compute bubble-by-bubble
 * scores for the Performance page.
 *
 * Inputs: nothing. Pulls from the local Zustand stores at call time so
 * the metrics screen always sees the most recent state without prop
 * threading.
 *
 * Each bubble metric returns:
 *   - value: number to render in the bubble (% or count)
 *   - unit: '%' | 'days' | etc.
 *   - label: short identifier shown under the value
 *   - breakdown: rows for the drill-down sheet (one line per contributor)
 *
 * Why not a heatmap: customers asked for single-glance numbers in
 * tappable bubbles instead of a contribution-style grid. The pillar
 * scoring + 30-day windowing logic from the old heat map is preserved
 * here — same data, new presentation.
 */

import { useCheckinStore } from '../store/useCheckinStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useMealStore } from '../store/useMealStore';
import { useJournalStore } from '../store/useJournalStore';

export type BubbleId =
  | 'consistency'
  | 'adherence'
  | 'nutrition'
  | 'workouts'
  | 'streak'
  | 'today';

export interface BreakdownRow {
  label: string;
  value: string;
  /** Optional sentiment to color the row. */
  tone?: 'positive' | 'neutral' | 'negative';
}

export interface BubbleMetric {
  id: BubbleId;
  value: number;
  unit: '%' | 'days' | 'count';
  label: string;
  /** One-sentence framing under the breakdown title. */
  description: string;
  /** Detail rows shown when the bubble is tapped. */
  breakdown: BreakdownRow[];
}

const DAYS_30 = 30;
const DAYS_7 = 7;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toDateKey(d));
  }
  return out;
}

/**
 * Bubble 1 — Consistency over the last 30 days.
 * Score = % of days where the user touched at least 2 of the 5 pillars.
 * Why 2: a single check-in alone is too low a bar; 2+ pillars = real engagement.
 */
function computeConsistency(): BubbleMetric {
  const checkins = useCheckinStore.getState().entries;
  const doses = useDoseLogStore.getState().doses;
  const workouts = useWorkoutStore.getState().logs;
  const meals = useMealStore.getState().meals;
  const journal = useJournalStore.getState().entries;

  const dates = lastNDates(DAYS_30);
  const dateSet = new Set(dates);

  // Build {date → Set<pillar>}
  const pillarsByDate = new Map<string, Set<string>>();
  const tag = (date: string, pillar: string) => {
    if (!dateSet.has(date)) return;
    if (!pillarsByDate.has(date)) pillarsByDate.set(date, new Set());
    pillarsByDate.get(date)!.add(pillar);
  };

  for (const c of checkins) if (c.date) tag(c.date, 'checkin');
  for (const d of doses) if (d.date) tag(d.date, 'dose');
  for (const w of workouts) if (w.date) tag(w.date, 'workout');
  for (const m of meals) if (m.date) tag(m.date, 'meal');
  for (const j of journal) if (j.date) tag(j.date, 'journal');

  let activeDays = 0;
  let totalPillars = 0;
  const pillarTotals = { checkin: 0, dose: 0, workout: 0, meal: 0, journal: 0 };
  for (const date of dates) {
    const set = pillarsByDate.get(date);
    if (!set) continue;
    if (set.size >= 2) activeDays++;
    totalPillars += set.size;
    for (const p of set) {
      if (p in pillarTotals) {
        (pillarTotals as Record<string, number>)[p]++;
      }
    }
  }
  const pct = Math.round((activeDays / DAYS_30) * 100);

  return {
    id: 'consistency',
    value: pct,
    unit: '%',
    label: 'Consistency',
    description: `Days in the last 30 where you used 2+ pillars (check-in / dose / workout / meal / journal).`,
    breakdown: [
      { label: 'Check-ins logged', value: `${pillarTotals.checkin} / 30 days` },
      { label: 'Dose days', value: `${pillarTotals.dose} / 30 days` },
      { label: 'Workout days', value: `${pillarTotals.workout} / 30 days` },
      { label: 'Meals logged', value: `${pillarTotals.meal} / 30 days` },
      { label: 'Journal entries', value: `${pillarTotals.journal} / 30 days` },
      { label: 'Active days (2+)', value: `${activeDays} / 30 days`, tone: pct >= 70 ? 'positive' : pct >= 40 ? 'neutral' : 'negative' },
    ],
  };
}

/**
 * Bubble 2 — Plan adherence.
 * For each active dose protocol, what % of expected dose days had a
 * dose logged. Counts only the last 30 days.
 */
function computeAdherence(): BubbleMetric {
  const doses = useDoseLogStore.getState().doses;
  const protocols = useDoseLogStore.getState().protocols ?? [];
  const dates = lastNDates(DAYS_30);
  const dateSet = new Set(dates);

  const activeProtocols = protocols.filter((p) => p.isActive);
  const breakdown: BreakdownRow[] = [];

  if (activeProtocols.length === 0) {
    return {
      id: 'adherence',
      value: 0,
      unit: '%',
      label: 'Adherence',
      description: 'How often you log doses on your scheduled days.',
      breakdown: [
        { label: 'No active protocols', value: 'Activate one to track adherence' },
      ],
    };
  }

  let totalExpected = 0;
  let totalHit = 0;
  for (const proto of activeProtocols) {
    // Heuristic: assume each active protocol expects 1 dose per day for now.
    // (Per-protocol frequency lives on the template; this is a 1.0 approximation.)
    const expected = DAYS_30;
    const hit = doses.filter((d) => d.peptideId === proto.peptideId && dateSet.has(d.date)).length;
    totalExpected += expected;
    totalHit += hit;
    const pct = Math.round((hit / expected) * 100);
    breakdown.push({
      label: proto.peptideId,
      value: `${pct}% (${hit}/${expected})`,
      tone: pct >= 80 ? 'positive' : pct >= 50 ? 'neutral' : 'negative',
    });
  }
  const overall = totalExpected > 0 ? Math.round((totalHit / totalExpected) * 100) : 0;

  return {
    id: 'adherence',
    value: overall,
    unit: '%',
    label: 'Adherence',
    description: `% of scheduled dose-days you logged a dose, last 30 days.`,
    breakdown,
  };
}

/**
 * Bubble 3 — Nutrition target hit rate.
 * % of last 14 days where logged calories landed within ±10% of the
 * user's calorie goal. 14d window so a few off-days don't tank the metric.
 */
function computeNutrition(): BubbleMetric {
  const meals = useMealStore.getState().meals;
  const targets = useMealStore.getState().targets;
  const dates = lastNDates(14);
  const calorieGoal = targets?.calories ?? 0;

  if (calorieGoal <= 0) {
    return {
      id: 'nutrition',
      value: 0,
      unit: '%',
      label: 'Nutrition',
      description: 'How often you hit your calorie target.',
      breakdown: [{ label: 'No calorie target set', value: 'Set one in Nutrition → Targets' }],
    };
  }

  let hitDays = 0;
  let totalDays = 0;
  const breakdown: BreakdownRow[] = [];
  for (const date of dates) {
    const dayMeals = meals.filter((m) => m.date === date);
    if (dayMeals.length === 0) continue;
    totalDays++;
    const cals = dayMeals.reduce((s, m) => s + ((m as any).quickLog?.calories ?? 0), 0);
    const pctOfGoal = (cals / calorieGoal) * 100;
    if (pctOfGoal >= 90 && pctOfGoal <= 110) hitDays++;
  }

  const pct = totalDays > 0 ? Math.round((hitDays / totalDays) * 100) : 0;
  const proteinTotal = meals
    .filter((m) => dates.includes(m.date))
    .reduce((s, m) => s + ((m as any).quickLog?.proteinGrams ?? 0), 0);

  return {
    id: 'nutrition',
    value: pct,
    unit: '%',
    label: 'Nutrition',
    description: `% of logged days in the last 14 where calories landed within ±10% of your target.`,
    breakdown: [
      { label: 'Calorie target', value: `${calorieGoal} kcal/day` },
      { label: 'Days within ±10%', value: `${hitDays} / ${totalDays}`, tone: pct >= 70 ? 'positive' : pct >= 40 ? 'neutral' : 'negative' },
      { label: 'Avg protein (last 14d)', value: `${Math.round(proteinTotal / Math.max(totalDays, 1))} g/day` },
    ],
  };
}

/**
 * Bubble 4 — Workout completion.
 * % of last 4 weeks that hit at least 3 workout sessions (rough fitness
 * baseline). User's actual goal lives elsewhere; 3/wk is the floor.
 */
function computeWorkouts(): BubbleMetric {
  const logs = useWorkoutStore.getState().logs;
  const dates = lastNDates(DAYS_30);
  const dateSet = new Set(dates);

  // Bucket into 4 weeks.
  const weekCounts = [0, 0, 0, 0];
  for (const log of logs) {
    if (!log.date || !dateSet.has(log.date)) continue;
    const idx = dates.indexOf(log.date);
    if (idx < 0) continue;
    const weekIdx = Math.floor(idx / 7);
    if (weekIdx < 4) weekCounts[weekIdx]++;
  }

  const targetPerWeek = 3;
  const weeksHit = weekCounts.filter((c) => c >= targetPerWeek).length;
  const pct = Math.round((weeksHit / 4) * 100);

  return {
    id: 'workouts',
    value: pct,
    unit: '%',
    label: 'Training',
    description: `% of the last 4 weeks where you hit ≥3 workouts.`,
    breakdown: [
      { label: 'Target', value: '3 sessions / week' },
      { label: 'Last week', value: `${weekCounts[0]} sessions`, tone: weekCounts[0] >= 3 ? 'positive' : 'negative' },
      { label: 'Week -1', value: `${weekCounts[1]} sessions` },
      { label: 'Week -2', value: `${weekCounts[2]} sessions` },
      { label: 'Week -3', value: `${weekCounts[3]} sessions` },
      { label: 'Weeks at target', value: `${weeksHit} / 4`, tone: weeksHit >= 3 ? 'positive' : weeksHit >= 2 ? 'neutral' : 'negative' },
    ],
  };
}

/**
 * Bubble 5 — Current check-in streak.
 * Consecutive days from today backward where a check-in exists.
 */
function computeStreak(): BubbleMetric {
  const checkins = useCheckinStore.getState().entries;
  const dates = new Set(checkins.map((e) => e.date).filter(Boolean));
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  let streak = 0;
  let cur = new Date(today);
  while (true) {
    const key = toDateKey(cur);
    if (dates.has(key)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }

  // Find longest streak in the last 90 days too — gives context.
  const sorted = Array.from(dates).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev === null) {
      run = 1;
    } else {
      const a = new Date(prev + 'T12:00:00');
      const b = new Date(d + 'T12:00:00');
      const gap = Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
      run = gap === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return {
    id: 'streak',
    value: streak,
    unit: 'days',
    label: 'Streak',
    description: 'Consecutive days you\'ve logged a daily check-in.',
    breakdown: [
      { label: 'Current streak', value: `${streak} days`, tone: streak >= 7 ? 'positive' : streak >= 3 ? 'neutral' : 'negative' },
      { label: 'Longest streak', value: `${longest} days` },
      { label: 'Total check-ins', value: `${checkins.length}` },
    ],
  };
}

/**
 * Bubble 6 — Today's pillar score (0-5).
 * How many of the 5 pillars touched today.
 */
function computeToday(): BubbleMetric {
  const today = toDateKey(new Date());
  const checkins = useCheckinStore.getState().entries;
  const doses = useDoseLogStore.getState().doses;
  const workouts = useWorkoutStore.getState().logs;
  const meals = useMealStore.getState().meals;
  const journal = useJournalStore.getState().entries;

  const hits = {
    checkin: checkins.some((e) => e.date === today),
    dose: doses.some((d) => d.date === today),
    workout: workouts.some((w) => w.date === today),
    meal: meals.some((m) => m.date === today),
    journal: journal.some((j) => j.date === today),
  };
  const score = Object.values(hits).filter(Boolean).length;
  const pct = Math.round((score / 5) * 100);

  return {
    id: 'today',
    value: pct,
    unit: '%',
    label: 'Today',
    description: 'Pillars you\'ve already used today.',
    breakdown: [
      { label: 'Check-in', value: hits.checkin ? '✓ done' : '— not yet', tone: hits.checkin ? 'positive' : 'neutral' },
      { label: 'Dose', value: hits.dose ? '✓ done' : '— not yet', tone: hits.dose ? 'positive' : 'neutral' },
      { label: 'Workout', value: hits.workout ? '✓ done' : '— not yet', tone: hits.workout ? 'positive' : 'neutral' },
      { label: 'Meal', value: hits.meal ? '✓ done' : '— not yet', tone: hits.meal ? 'positive' : 'neutral' },
      { label: 'Journal', value: hits.journal ? '✓ done' : '— not yet', tone: hits.journal ? 'positive' : 'neutral' },
      { label: 'Score', value: `${score} / 5 pillars`, tone: score >= 4 ? 'positive' : score >= 2 ? 'neutral' : 'negative' },
    ],
  };
}

/** Build all six metrics in one shot. Cheap — pure store reads. */
export function computeAllMetrics(): BubbleMetric[] {
  return [
    computeConsistency(),
    computeAdherence(),
    computeNutrition(),
    computeWorkouts(),
    computeStreak(),
    computeToday(),
  ];
}
