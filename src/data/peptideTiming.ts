/**
 * Peptide-specific timing rules.
 *
 * Some peptides have mandatory timing that dramatically affects efficacy
 * (fasting windows, pre-sleep dosing, weekly-same-day adherence). This
 * table captures those rules structurally so the app can:
 *   - Show an inline card when the user logs or schedules a dose
 *   - Offer to schedule a fasting-window reminder
 *   - Flag "wrong time" when a user logs a dose during a should-fast window
 *
 * Kept conservative — only peptides with well-documented timing
 * sensitivity are captured here. Peptides not in this table have no
 * special timing rules.
 */

export type TimingRuleKind =
  | 'fast_before_and_after'   // Tesamorelin, Sermorelin — fast window surrounding dose
  | 'empty_stomach'           // Ipamorelin, CJC-1295 — no food for 2h pre, 30min post
  | 'weekly_same_day'         // GLP-1 family — pick a day and stick to it
  | 'morning_empty'           // MOTS-c — morning dose
  | 'pre_sleep'               // Sermorelin, ipamorelin — aligned with GH pulse
  | 'with_food'               // rare — pair with meal
  | 'post_workout';           // IGF-1 LR3 — window around training

export interface PeptideTimingRule {
  peptideId: string;
  kind: TimingRuleKind;
  /** User-facing headline. Keep under 60 chars. */
  title: string;
  /** User-facing 1–2 sentence explanation. */
  body: string;
  /** Minutes of required fasting BEFORE the dose (if any). */
  fastBeforeMin?: number;
  /** Minutes of required fasting AFTER the dose (if any). */
  fastAfterMin?: number;
  /** Recommended time of day as "HH:MM" — null if flexible. */
  suggestedTime?: string;
  /** True if violating this rule materially reduces efficacy. */
  highSensitivity?: boolean;
}

const r = (entry: PeptideTimingRule): [string, PeptideTimingRule] => [
  entry.peptideId.toLowerCase(),
  entry,
];

export const PEPTIDE_TIMING: Record<string, PeptideTimingRule> = Object.fromEntries([
  r({
    peptideId: 'tesamorelin',
    kind: 'fast_before_and_after',
    title: 'Fast 2 hours before, 30 min after',
    body: 'Tesamorelin works best on an empty stomach — carbs blunt the GHRH response. Avoid food for 2 hours before and 30 minutes after your dose. Typically dosed at bedtime.',
    fastBeforeMin: 120,
    fastAfterMin: 30,
    suggestedTime: '22:00',
    highSensitivity: true,
  }),
  r({
    peptideId: 'sermorelin',
    kind: 'pre_sleep',
    title: 'Empty stomach, pre-sleep',
    body: 'Sermorelin has a short half-life and aligns with the natural nighttime GH pulse. Take on an empty stomach (no food for 2h before) right before bed.',
    fastBeforeMin: 120,
    suggestedTime: '22:30',
    highSensitivity: true,
  }),
  r({
    peptideId: 'ipamorelin',
    kind: 'empty_stomach',
    title: 'Empty stomach (no food for 2h before)',
    body: 'Ipamorelin stimulates a GH pulse that is blunted by insulin. Wait 2 hours after your last meal to dose, and wait ~30 minutes after dosing before eating. Best taken at bedtime for sleep-aligned pulse.',
    fastBeforeMin: 120,
    fastAfterMin: 30,
    suggestedTime: '22:00',
    highSensitivity: true,
  }),
  r({
    peptideId: 'cjc-1295',
    kind: 'empty_stomach',
    title: 'Empty stomach (often paired with ipamorelin)',
    body: 'CJC-1295 (no DAC) follows the same empty-stomach rule as ipamorelin. Wait 2h after food to dose, 30min post-dose before eating. Bedtime dosing is common.',
    fastBeforeMin: 120,
    fastAfterMin: 30,
    suggestedTime: '22:00',
    highSensitivity: true,
  }),
  r({
    peptideId: 'mots-c',
    kind: 'morning_empty',
    title: 'Morning dose, empty stomach',
    body: 'MOTS-c upregulates mitochondrial energy pathways — dosing in the morning aligns with your metabolic rhythm. Taking on an empty stomach is preferred but not strictly required.',
    fastBeforeMin: 60,
    suggestedTime: '07:30',
  }),
  r({
    peptideId: 'semaglutide',
    kind: 'weekly_same_day',
    title: 'Same day of the week, every week',
    body: 'Semaglutide is a once-weekly injection. Pick a consistent day (e.g. Sunday evening) and stick to it — irregular timing affects steady-state levels and side-effect profile.',
    highSensitivity: true,
  }),
  r({
    peptideId: 'tirzepatide',
    kind: 'weekly_same_day',
    title: 'Same day of the week, every week',
    body: 'Tirzepatide is a once-weekly injection. Consistency matters — pick your day and keep it within a 24-hour window each week.',
    highSensitivity: true,
  }),
  r({
    peptideId: 'retatrutide',
    kind: 'weekly_same_day',
    title: 'Same day of the week, every week',
    body: 'Retatrutide is a once-weekly injection (still investigational). Keep your dose day consistent.',
    highSensitivity: true,
  }),
  r({
    peptideId: 'igf-1-lr3',
    kind: 'post_workout',
    title: 'Post-workout dose with carbs + protein',
    body: 'IGF-1 LR3 partitions nutrients toward muscle — time the dose in the post-workout window when you can immediately eat protein + carbs. Watch blood sugar; can cause hypoglycemia if dosed fasted.',
    suggestedTime: undefined,
    highSensitivity: true,
  }),
  r({
    peptideId: 'aod-9604',
    kind: 'empty_stomach',
    title: 'Empty stomach, morning preferred',
    body: 'AOD-9604 (GH fragment) works best on an empty stomach. Morning dosing before breakfast is ideal.',
    fastBeforeMin: 60,
    suggestedTime: '07:00',
  }),
]);

export function getPeptideTiming(peptideId: string): PeptideTimingRule | undefined {
  return PEPTIDE_TIMING[peptideId.toLowerCase()];
}

/**
 * Given a dose logged at `doseTime`, returns a user-facing warning if
 * the timing rule was likely violated. Returns null if rule doesn't apply
 * or the timing looks fine.
 *
 * Simple heuristic — we check:
 *   - fast_before_and_after / empty_stomach: dose logged within 2h of a
 *     meal entry in the meal store is flagged
 *   - morning_empty: dose after noon is flagged
 *   - pre_sleep: dose before 8pm is flagged
 */
export function checkTimingRuleViolation(
  rule: PeptideTimingRule,
  doseTime: Date,
  recentMealTimes: Date[] = [],
): string | null {
  const hour = doseTime.getHours();

  if (rule.kind === 'morning_empty' && hour >= 12) {
    return 'This peptide works best as a morning dose. A late-day dose may blunt the effect.';
  }

  if (rule.kind === 'pre_sleep' && hour < 20) {
    return 'This peptide aligns with the pre-sleep GH pulse. Dosing earlier in the evening may reduce the benefit.';
  }

  if (
    (rule.kind === 'fast_before_and_after' || rule.kind === 'empty_stomach') &&
    rule.fastBeforeMin
  ) {
    const windowMs = rule.fastBeforeMin * 60 * 1000;
    const ateRecently = recentMealTimes.some(
      (mt) => doseTime.getTime() - mt.getTime() < windowMs && doseTime.getTime() - mt.getTime() >= 0,
    );
    if (ateRecently) {
      return `This peptide needs a ${rule.fastBeforeMin}-minute fast window before dosing. You logged a meal recently — the dose response may be reduced.`;
    }
  }

  return null;
}
