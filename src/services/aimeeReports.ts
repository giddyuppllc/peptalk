/**
 * Aimee Reports + Insights generator — Master Refactor Plan v3.1 §9.3 + §9.4.
 *
 * Pulls data from every existing store (dose log, meals, workouts, side
 * effects, biometrics, lab results, journal) and produces:
 *
 *   - generateWeeklyReport(weekStartISO) — 2–3 paragraphs + charts +
 *     1 specific recommendation (Sunday auto).
 *   - generateCycleReport(protocolId) — end-of-cycle review.
 *   - generateInsights() — small correlation cards for the insights feed.
 *
 * These are pure-TypeScript — they read real data and emit structured
 * narrative using template fragments + actual numbers. The LLM rewrite
 * pass that turns these into Aimee's second-person voice is wired via
 * the `aimee-report-rewrite` edge function: `refreshWeekly()` returns
 * the templated body immediately; `useAimeeReportsStore.rewriteReportBody`
 * patches it once the server returns. Fail-soft — templated body stays
 * if the rewrite call fails.
 */

import { useDoseLogStore } from '../store/useDoseLogStore';
import { useMealStore } from '../store/useMealStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useSideEffectStore } from '../store/useSideEffectStore';
import { useBiometricsStore } from '../store/useBiometricsStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { getPeptideById } from '../data/peptides';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportKind = 'weekly' | 'cycle' | 'insight';

export interface ReportChart {
  kind: 'volume_trend' | 'protein_trend' | 'adherence' | 'weight';
  /** Series values in chronological order. */
  values: number[];
  /** Labels per series point (e.g. ISO date). */
  labels: string[];
  /** Optional target value for goal overlay. */
  target?: number;
}

export interface Report {
  id: string;
  kind: ReportKind;
  /** ISO8601 generated-at timestamp. */
  generatedAt: string;
  /** ISO8601 — start of the period this report covers. */
  periodStart: string;
  /** ISO8601 — end of the period this report covers. */
  periodEnd: string;
  /** 2–3 paragraphs of narrative. */
  body: string;
  /** Up to 3 chart definitions surfaced inline. */
  charts: ReportChart[];
  /** One specific, actionable recommendation. */
  recommendation: string | null;
  /** Headline metric to surface in the ReportRibbon. */
  headline: string;
}

export interface Insight {
  id: string;
  generatedAt: string;
  /** Short label used in the insight card pill. */
  category: 'nutrition' | 'training' | 'sleep' | 'doses' | 'side_effects';
  /** Single sentence in Aimee's voice. */
  body: string;
  /** Optional support data — visualized in the card. */
  delta?: { label: string; value: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  // 2026-05-17 timezone fix: `new Date('2026-05-17')` parses as UTC
  // midnight, but `.setDate(d.getDate() + n)` reads local time. In all
  // Western TZs the result is the previous day, so every weekly-report
  // date window was off-by-one for ~80% of users. Anchor to local noon
  // so the day component is stable across DST + offset.
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return iso;
  const local = new Date(y, mo - 1, d, 12, 0, 0, 0);
  local.setDate(local.getDate() + days);
  return toDateKey(local);
}

function lastMondayISO(now = new Date()): string {
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff - 7);
  return toDateKey(d);
}

// ─── Weekly Report ───────────────────────────────────────────────────────────

export function generateWeeklyReport(weekStartISO?: string): Report {
  const start = weekStartISO ?? lastMondayISO();
  const end = addDays(start, 6);

  const meals = useMealStore.getState();
  const workouts = useWorkoutStore.getState();
  const doses = useDoseLogStore.getState();
  const sideEffects = useSideEffectStore.getState();
  const checkins = useCheckinStore.getState();

  // Per-day macro hit counts.
  const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  const proteinSeries: number[] = [];
  let proteinHitDays = 0;
  for (const dk of days) {
    const totals = meals.getDailyTotals(dk);
    proteinSeries.push(totals.proteinGrams);
    if (totals.proteinGrams >= meals.targets.proteinGrams * 0.9) {
      proteinHitDays++;
    }
  }

  // Workouts in window
  const workoutsThisWeek = workouts.logs.filter(
    (w) => w.date >= start && w.date <= end,
  );
  const volumeThisWeek = workoutsThisWeek.reduce(
    (s, w) =>
      s +
      w.sets.reduce(
        (ss, set) => ss + (set.weightLbs ?? 0) * set.reps,
        0,
      ),
    0,
  );

  // Doses in window
  const dosesThisWeek = doses.doses.filter(
    (d) => d.date >= start && d.date <= end,
  );
  const dosesByPeptide = new Map<string, number>();
  for (const d of dosesThisWeek) {
    dosesByPeptide.set(d.peptideId, (dosesByPeptide.get(d.peptideId) ?? 0) + 1);
  }

  // Side effects in window
  const sideEffectsThisWeek = sideEffects.entries.filter(
    (e) => e.loggedAt.slice(0, 10) >= start && e.loggedAt.slice(0, 10) <= end,
  );
  const severeSideEffects = sideEffectsThisWeek.filter(
    (e) => e.severity >= 4,
  );

  // Check-ins for mood
  const checkInsThisWeek = checkins.entries.filter(
    (c) => c.date >= start && c.date <= end,
  );
  const avgMood =
    checkInsThisWeek.length > 0
      ? checkInsThisWeek.reduce((s, c) => s + (c.mood ?? 0), 0) /
        checkInsThisWeek.length
      : null;

  // Compose narrative — template-based but uses real numbers.
  const paragraphs: string[] = [];

  const topPeptide = Array.from(dosesByPeptide.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (topPeptide) {
    const name = getPeptideById(topPeptide[0])?.name ?? topPeptide[0];
    paragraphs.push(
      `You logged ${topPeptide[1]} dose${topPeptide[1] === 1 ? '' : 's'} of ${name} this week.${
        dosesByPeptide.size > 1
          ? ` Plus ${dosesByPeptide.size - 1} other peptide${dosesByPeptide.size > 2 ? 's' : ''}.`
          : ''
      }`,
    );
  } else {
    paragraphs.push(
      'No doses logged this week. If you are on a protocol, tap into the Calculator and add an entry to keep the streak.',
    );
  }

  paragraphs.push(
    `Protein hit target on ${proteinHitDays} of 7 days. ${
      workoutsThisWeek.length > 0
        ? `You trained ${workoutsThisWeek.length} time${workoutsThisWeek.length === 1 ? '' : 's'} for a total tonnage of ${Math.round(volumeThisWeek).toLocaleString()} lb.`
        : 'No workouts logged.'
    }`,
  );

  if (sideEffectsThisWeek.length > 0) {
    paragraphs.push(
      `${sideEffectsThisWeek.length} side-effect entr${sideEffectsThisWeek.length === 1 ? 'y' : 'ies'} this week${
        severeSideEffects.length > 0
          ? ` — ${severeSideEffects.length} at severity 4+. Worth a clinical conversation.`
          : '. All mild to moderate.'
      }`,
    );
  }

  if (avgMood != null) {
    paragraphs.push(
      `Average mood ${avgMood.toFixed(1)}/5 across ${checkInsThisWeek.length} check-in${checkInsThisWeek.length === 1 ? '' : 's'}.`,
    );
  }

  // Recommendation — pick the most actionable signal.
  let recommendation: string | null = null;
  if (severeSideEffects.length > 0) {
    recommendation =
      'Flag those severe side effects in Aimee chat so we can map them to specific dose timing.';
  } else if (proteinHitDays < 4) {
    recommendation = `Bump protein on the days you missed — the protein-focal log in Nutrition makes it ${Math.round(meals.targets.proteinGrams * 0.9)}g daily floor.`;
  } else if (workoutsThisWeek.length < 2) {
    recommendation =
      'Get one more session in this week — strength trends start to flatten below 2 workouts/week.';
  } else if (dosesByPeptide.size === 0) {
    recommendation =
      'Add your active protocol to Doses → Calculator so the Tracker reflects it next week.';
  } else {
    recommendation =
      'You hit the basics. Try an InBody scan or lab pull this week to lock in measurable progress.';
  }

  // LLM rewrite is wired in `useAimeeReportsStore.rewriteReportBody`
  // which the reports screen + boot scheduler call after this returns.
  // The structured data here is the contract; the rewrite is a pure
  // transform on top.

  return {
    id: uid('weekly'),
    kind: 'weekly',
    generatedAt: new Date().toISOString(),
    periodStart: start,
    periodEnd: end,
    body: paragraphs.join('\n\n'),
    headline: `Week of ${start}`,
    charts: [
      {
        kind: 'protein_trend',
        values: proteinSeries,
        labels: days,
        target: meals.targets.proteinGrams,
      },
    ],
    recommendation,
  };
}

// ─── Cycle Report ────────────────────────────────────────────────────────────

export function generateCycleReport(
  protocolId: string,
): Report | null {
  const doses = useDoseLogStore.getState();
  const proto = doses.protocols.find((p) => p.id === protocolId);
  if (!proto) return null;

  const start = proto.startDate;
  const end = proto.endDate ?? toDateKey(new Date());
  const peptide = getPeptideById(proto.peptideId);
  const name = peptide?.name ?? proto.peptideId;

  const cycleDoses = doses.doses.filter(
    (d) => d.peptideId === proto.peptideId && d.date >= start && d.date <= end,
  );

  const sideEffects = useSideEffectStore
    .getState()
    .entries.filter(
      (e) =>
        e.peptideId === proto.peptideId &&
        e.loggedAt.slice(0, 10) >= start &&
        e.loggedAt.slice(0, 10) <= end,
    );

  const biometrics = useBiometricsStore.getState();
  const weightStart = biometrics
    .getReadingsForDate(start, 'weight')
    .find((r) => true);
  const weightEnd = biometrics
    .getReadingsForDate(end, 'weight')
    .find((r) => true);
  const weightDelta =
    weightStart && weightEnd ? weightEnd.value - weightStart.value : null;

  const totalDays = Math.max(
    1,
    Math.floor(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400_000,
    ) + 1,
  );

  const paragraphs: string[] = [];
  paragraphs.push(
    `Your ${name} cycle ran ${totalDays} day${totalDays === 1 ? '' : 's'} from ${start} to ${end}, with ${cycleDoses.length} dose${cycleDoses.length === 1 ? '' : 's'} logged.`,
  );

  if (weightDelta != null) {
    const dir = weightDelta < 0 ? 'down' : 'up';
    paragraphs.push(
      `Weight ${dir} ${Math.abs(weightDelta).toFixed(1)} lb across the cycle.`,
    );
  }

  if (sideEffects.length > 0) {
    const severe = sideEffects.filter((e) => e.severity >= 4);
    paragraphs.push(
      `${sideEffects.length} side-effect entr${sideEffects.length === 1 ? 'y' : 'ies'} tied to this peptide${severe.length > 0 ? ` (${severe.length} severity 4+)` : ''}.`,
    );
  } else {
    paragraphs.push('No side effects logged for this peptide during the cycle.');
  }

  const recommendation =
    sideEffects.filter((e) => e.severity >= 4).length > 0
      ? `Before starting the next ${name} cycle, walk through the severe side effects with a clinician.`
      : cycleDoses.length < totalDays * 0.7
        ? `Adherence was ${Math.round((cycleDoses.length / totalDays) * 100)}% — set dose reminders next cycle.`
        : `Solid adherence. Consider stacking ${name} with a complementary peptide next cycle.`;

  return {
    id: uid('cycle'),
    kind: 'cycle',
    generatedAt: new Date().toISOString(),
    periodStart: start,
    periodEnd: end,
    body: paragraphs.join('\n\n'),
    headline: `${name} cycle summary`,
    charts: [],
    recommendation,
  };
}

// ─── Insights Feed ───────────────────────────────────────────────────────────

export function generateInsights(): Insight[] {
  const out: Insight[] = [];
  const now = new Date().toISOString();
  // 2026-05-17 timezone fix: compare date-only strings (YYYY-MM-DD) via
  // string comparison instead of Date objects. `new Date('2026-05-04') >= someLocalDate`
  // was off-by-one in Western TZs because the ISO date parses as UTC
  // midnight. String comparison is lexicographic and TZ-stable. The
  // `loggedAt` field below is a full ISO timestamp so Date math is
  // unambiguous; only date-only fields like `w.date` need the swap.
  const fourteenDaysAgoMs = Date.now() - 14 * 86400_000;
  const fourteenDaysAgo = new Date(fourteenDaysAgoMs);
  const fourteenDaysAgoKey = toDateKey(fourteenDaysAgo);

  const meals = useMealStore.getState();
  const workouts = useWorkoutStore.getState();
  const doses = useDoseLogStore.getState();
  const sideEffects = useSideEffectStore.getState();

  // Insight 1 — protein vs workout PR correlation (very simple heuristic
  // version of the §9.4 "PRs cluster on days you hit protein" line).
  const recentWorkouts = workouts.logs.filter(
    (w) => (w.date ?? '') >= fourteenDaysAgoKey,
  );
  if (recentWorkouts.length >= 4) {
    const proteinHitWorkouts = recentWorkouts.filter((w) => {
      const totals = meals.getDailyTotals(w.date);
      return totals.proteinGrams >= meals.targets.proteinGrams * 0.9;
    });
    if (proteinHitWorkouts.length / recentWorkouts.length >= 0.75) {
      out.push({
        id: uid('insight'),
        generatedAt: now,
        category: 'nutrition',
        body: `${proteinHitWorkouts.length} of your last ${recentWorkouts.length} workouts hit protein target. That correlation is the kind of signal we look for.`,
      });
    } else if (proteinHitWorkouts.length / recentWorkouts.length <= 0.3) {
      out.push({
        id: uid('insight'),
        generatedAt: now,
        category: 'nutrition',
        body: `Most of your recent training days came in below protein target. Bumping protein on workout days is the cleanest lever.`,
      });
    }
  }

  // Insight 2 — side-effect pattern by peptide.
  const recentSE = sideEffects.entries.filter(
    (e) => new Date(e.loggedAt) >= fourteenDaysAgo,
  );
  const byPeptide = new Map<string, number>();
  for (const e of recentSE) {
    if (!e.peptideId) continue;
    byPeptide.set(e.peptideId, (byPeptide.get(e.peptideId) ?? 0) + 1);
  }
  const topSE = Array.from(byPeptide.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topSE && topSE[1] >= 3) {
    const name = getPeptideById(topSE[0])?.name ?? topSE[0];
    out.push({
      id: uid('insight'),
      generatedAt: now,
      category: 'side_effects',
      body: `${topSE[1]} side-effect entries tied to ${name} in the last two weeks. Worth a closer look.`,
      delta: { label: 'entries', value: String(topSE[1]) },
    });
  }

  // Insight 3 — dose adherence streak.
  const lastSevenDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return toDateKey(d);
  });
  const daysWithDose = lastSevenDays.filter((dk) =>
    doses.doses.some((d) => d.date === dk),
  ).length;
  if (daysWithDose === 7) {
    out.push({
      id: uid('insight'),
      generatedAt: now,
      category: 'doses',
      body: `Seven days, seven doses. Adherence streak intact.`,
      delta: { label: 'streak', value: '7d' },
    });
  } else if (daysWithDose === 0 && doses.protocols.some((p) => p.isActive)) {
    out.push({
      id: uid('insight'),
      generatedAt: now,
      category: 'doses',
      body: `No doses logged in the last 7 days despite an active protocol. Catch up in Tracker.`,
    });
  }

  return out;
}
