/**
 * Achievement refresh — the call that was never made.
 *
 * useAchievementStore ships fifteen badges, an XP/level curve, a
 * `pendingCelebrations` queue and a CelebrationModal mounted in _layout
 * waiting on that queue. `earnBadge` is the only thing that fills the queue,
 * and `checkAndAward` is the only caller of `earnBadge` — and NOTHING in the
 * app ever called `checkAndAward`.
 *
 * So no badge could ever be earned, no XP awarded, and the celebration modal
 * could never fire. An entire gamification layer sat wired to itself.
 *
 * This gathers the stats it expects from the stores that already hold them and
 * hands them over. Deliberately a pure read of live state rather than an
 * incremental counter, so it is safe to call as often as we like and cannot
 * drift from reality — call it after anything that could plausibly move a
 * number.
 */

import { useAchievementStore } from '../store/useAchievementStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useMealStore } from '../store/useMealStore';
import { useStackStore } from '../store/useStackStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { todayLocalISO } from '../utils/dateUtil';

/** Ounces of water in a day that counts as hitting the goal (the water-100 badge). */
const WATER_GOAL_OZ = 100;

export function refreshAchievements(): void {
  try {
    const checkins = useCheckinStore.getState();
    const workouts = useWorkoutStore.getState();
    const meals = useMealStore.getState();
    const stacks = useStackStore.getState();
    const profile = useHealthProfileStore.getState().profile;

    // Curated stacks are seeded into savedStacks, so counting the raw array
    // would hand every new user the "first stack" badge before they had made
    // one. Count only what the user actually saved.
    const userStackCount = (stacks.savedStacks ?? []).filter((s) => !s.isCurated).length;

    // A profile counts as complete once the fields the rest of the app relies
    // on are present — the same ones onboarding collects.
    const profileComplete = Boolean(
      profile?.biologicalSex &&
        profile?.bodyMetrics?.weightLbs &&
        profile?.bodyMetrics?.heightInches &&
        (profile?.primaryGoals?.length ?? 0) > 0,
    );

    useAchievementStore.getState().checkAndAward({
      checkinCount: checkins.entries?.length ?? 0,
      streak: checkins.getStreak?.() ?? 0,
      // Only finished sessions count — a scheduled-but-unperformed workout is
      // not an achievement.
      workoutCount: (workouts.logs ?? []).filter((l) => !!l.completedAt).length,
      mealCount: meals.meals?.length ?? 0,
      stackCount: userStackCount,
      waterGoalHit: (meals.getWater?.(todayLocalISO()) ?? 0) >= WATER_GOAL_OZ,
      profileComplete,
      // Program completion is tracked by the workout store's monthly plan;
      // treated as false until that surfaces a finished flag, rather than
      // guessing and handing out a badge nobody earned.
      programComplete: false,
    });
  } catch {
    // Never let a badge check break the action the user actually took.
  }
}
