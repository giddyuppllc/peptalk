/**
 * Pure helpers for the health-plan screen.
 *
 * usePlanStore already owns the plan CRUD and the completion maths. What lives
 * here is only what the SCREEN needs — ordering, labelling and a progress
 * summary — extracted so it can be tested in plain Node, same as doseUnits,
 * alertDispatch, workoutWeight and mealDiary.
 *
 * Worth stating why the screen exists at all: the store had twelve actions and
 * nine of them had no caller, `generateHealthPlan` in llmService had none
 * either, and the store's only consumer was the logout handler clearing it.
 * There was no route and no screen — while Aimee told users "I can create a
 * plan combining: weekly workout schedule · meal plan framework · peptide
 * protocol timing · daily check-in reminders".
 */
import type { HealthPlanItem } from '../types';

/** 0 = Sunday, matching HealthPlanItem.dayOfWeek and Date.getDay(). */
export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const ITEM_TYPE_META: Record<
  HealthPlanItem['type'],
  { label: string; icon: string }
> = {
  workout: { label: 'Workout', icon: 'barbell-outline' },
  meal: { label: 'Meal', icon: 'restaurant-outline' },
  protocol: { label: 'Protocol', icon: 'medical-outline' },
  checkin: { label: 'Check-in', icon: 'clipboard-outline' },
  custom: { label: 'Task', icon: 'ellipse-outline' },
};

/** Today's day-of-week in the user's LOCAL calendar, not UTC. */
export function todayDayOfWeek(now: Date = new Date()): number {
  return now.getDay();
}

/**
 * Sort a day's items by clock time.
 *
 * String comparison is correct here ONLY because the type documents `time` as
 * "HH:mm" — zero-padded 24-hour. A single-digit hour ("7:00") would sort after
 * "18:00" and silently reorder someone's day, so anything not matching HH:mm is
 * pushed to the end rather than interleaved on a bad comparison.
 */
export function sortItemsByTime(items: readonly HealthPlanItem[]): HealthPlanItem[] {
  const wellFormed = /^\d{2}:\d{2}$/;
  return [...items].sort((a, b) => {
    const aOk = wellFormed.test(a.time);
    const bOk = wellFormed.test(b.time);
    if (aOk && bOk) return a.time.localeCompare(b.time);
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  });
}

export interface PlanSummary {
  total: number;
  completed: number;
  /** 0-100, integer. */
  percent: number;
}

/**
 * Completion across the whole plan.
 *
 * Mirrors usePlanStore.getWeeklyProgress rather than re-deriving it
 * differently — a screen showing "8 of 12 done" beside a bar drawn from
 * another calculation is a bug nobody can explain. An empty plan is 0%, never
 * NaN from dividing by zero.
 */
export function planSummary(schedule: readonly HealthPlanItem[]): PlanSummary {
  const total = schedule.length;
  const completed = schedule.filter((i) => i.completed).length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
