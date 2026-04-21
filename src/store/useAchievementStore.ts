/**
 * Achievement / gamification store.
 *
 * Tracks XP, level, badges, and streaks with celebration triggers.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

// ---------------------------------------------------------------------------
// Badge Definitions
// ---------------------------------------------------------------------------

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string; // Ionicons name
  xpReward: number;
  /** Condition check — returns true if earned */
  condition: string; // Serializable condition key
}

export const BADGES: Badge[] = [
  { id: 'first-checkin', name: 'First Steps', description: 'Complete your first check-in', icon: 'footsteps', xpReward: 50, condition: 'checkin_count_1' },
  { id: 'streak-3', name: 'On a Roll', description: '3-day check-in streak', icon: 'flame', xpReward: 100, condition: 'streak_3' },
  { id: 'streak-7', name: 'Week Warrior', description: '7-day check-in streak', icon: 'flame', xpReward: 250, condition: 'streak_7' },
  { id: 'streak-14', name: 'Consistent', description: '14-day check-in streak', icon: 'flame', xpReward: 500, condition: 'streak_14' },
  { id: 'streak-30', name: 'Unstoppable', description: '30-day check-in streak', icon: 'flame', xpReward: 1000, condition: 'streak_30' },
  { id: 'first-workout', name: 'Gym Rat', description: 'Complete your first workout', icon: 'barbell', xpReward: 75, condition: 'workout_count_1' },
  { id: 'workouts-10', name: 'Dedicated', description: 'Complete 10 workouts', icon: 'barbell', xpReward: 300, condition: 'workout_count_10' },
  { id: 'first-meal', name: 'Fuel Up', description: 'Log your first meal', icon: 'restaurant', xpReward: 50, condition: 'meal_count_1' },
  { id: 'meals-50', name: 'Meal Prep Pro', description: 'Log 50 meals', icon: 'restaurant', xpReward: 500, condition: 'meal_count_50' },
  { id: 'first-stack', name: 'Stacker', description: 'Save your first stack', icon: 'layers', xpReward: 75, condition: 'stack_count_1' },
  { id: 'water-100', name: 'Hydrated', description: 'Hit your water goal', icon: 'water', xpReward: 50, condition: 'water_goal_hit' },
  { id: 'profile-complete', name: 'All Set', description: 'Complete your health profile', icon: 'shield-checkmark', xpReward: 200, condition: 'profile_complete' },
  { id: 'explorer', name: 'Explorer', description: 'View 10 different peptides', icon: 'search', xpReward: 100, condition: 'peptides_viewed_10' },
  { id: 'scholar', name: 'Scholar', description: 'Read 5 educational articles', icon: 'book', xpReward: 150, condition: 'articles_read_5' },
  { id: 'program-finish', name: 'Program Graduate', description: 'Finish a full workout program', icon: 'trophy', xpReward: 1000, condition: 'program_complete' },
];

// ---------------------------------------------------------------------------
// Level Thresholds
// ---------------------------------------------------------------------------

export const LEVELS = [
  { level: 1, xpRequired: 0, title: 'Beginner' },
  { level: 2, xpRequired: 100, title: 'Getting Started' },
  { level: 3, xpRequired: 300, title: 'Explorer' },
  { level: 4, xpRequired: 600, title: 'Committed' },
  { level: 5, xpRequired: 1000, title: 'Dedicated' },
  { level: 6, xpRequired: 1500, title: 'Advanced' },
  { level: 7, xpRequired: 2200, title: 'Expert' },
  { level: 8, xpRequired: 3000, title: 'Master' },
  { level: 9, xpRequired: 4000, title: 'Elite' },
  { level: 10, xpRequired: 5500, title: 'Legend' },
];

export function getLevelForXP(xp: number) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.xpRequired) current = lvl;
    else break;
  }
  const nextIdx = LEVELS.findIndex((l) => l.level === current.level) + 1;
  const next = nextIdx < LEVELS.length ? LEVELS[nextIdx] : null;
  const progressToNext = next
    ? Math.round(((xp - current.xpRequired) / (next.xpRequired - current.xpRequired)) * 100)
    : 100;
  return { ...current, next, progressToNext, currentXP: xp };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AchievementState {
  xp: number;
  earnedBadgeIds: string[];
  /** Badge IDs that were earned but not yet shown to user */
  pendingCelebrations: string[];
  /** Peptide IDs the user has viewed */
  viewedPeptides: string[];
  articlesRead: number;
}

interface AchievementActions {
  addXP: (amount: number, source?: string) => void;
  earnBadge: (badgeId: string) => void;
  dismissCelebration: (badgeId: string) => void;
  hasBadge: (badgeId: string) => boolean;
  getLevel: () => ReturnType<typeof getLevelForXP>;
  trackPeptideView: (peptideId: string) => void;
  trackArticleRead: () => void;
  /** Check all conditions and award any newly-earned badges */
  checkAndAward: (stats: {
    checkinCount: number;
    streak: number;
    workoutCount: number;
    mealCount: number;
    stackCount: number;
    waterGoalHit: boolean;
    profileComplete: boolean;
    programComplete: boolean;
  }) => void;
  /** Wipe all XP / badges. Called on logout. */
  clearAll: () => void;
}

export const useAchievementStore = create<AchievementState & AchievementActions>()(
  persist(
    (set, get) => ({
      xp: 0,
      earnedBadgeIds: [],
      pendingCelebrations: [],
      viewedPeptides: [],
      articlesRead: 0,

      addXP: (amount) => set({ xp: get().xp + amount }),

      earnBadge: (badgeId) => {
        if (get().earnedBadgeIds.includes(badgeId)) return;
        const badge = BADGES.find((b) => b.id === badgeId);
        if (!badge) return;
        set({
          earnedBadgeIds: [...get().earnedBadgeIds, badgeId],
          pendingCelebrations: [...get().pendingCelebrations, badgeId],
          xp: get().xp + badge.xpReward,
        });
      },

      dismissCelebration: (badgeId) =>
        set({
          pendingCelebrations: get().pendingCelebrations.filter(
            (id) => id !== badgeId,
          ),
        }),

      hasBadge: (badgeId) => get().earnedBadgeIds.includes(badgeId),

      getLevel: () => getLevelForXP(get().xp),

      trackPeptideView: (peptideId) => {
        const viewed = get().viewedPeptides;
        if (!viewed.includes(peptideId)) {
          set({ viewedPeptides: [...viewed, peptideId] });
        }
      },

      trackArticleRead: () =>
        set({ articlesRead: get().articlesRead + 1 }),

      checkAndAward: (stats) => {
        const { earnBadge } = get();
        const earn = (id: string) => {
          if (!get().earnedBadgeIds.includes(id)) earnBadge(id);
        };

        // Check-in milestones
        if (stats.checkinCount >= 1) earn('first-checkin');

        // Streak milestones
        if (stats.streak >= 3) earn('streak-3');
        if (stats.streak >= 7) earn('streak-7');
        if (stats.streak >= 14) earn('streak-14');
        if (stats.streak >= 30) earn('streak-30');

        // Workout milestones
        if (stats.workoutCount >= 1) earn('first-workout');
        if (stats.workoutCount >= 10) earn('workouts-10');

        // Meal milestones
        if (stats.mealCount >= 1) earn('first-meal');
        if (stats.mealCount >= 50) earn('meals-50');

        // Stack milestones
        if (stats.stackCount >= 1) earn('first-stack');

        // Water
        if (stats.waterGoalHit) earn('water-100');

        // Profile
        if (stats.profileComplete) earn('profile-complete');

        // Peptide views
        if (get().viewedPeptides.length >= 10) earn('explorer');

        // Articles
        if (get().articlesRead >= 5) earn('scholar');

        // Program complete
        if (stats.programComplete) earn('program-finish');
      },

      clearAll: () =>
        set({
          xp: 0,
          earnedBadgeIds: [],
          pendingCelebrations: [],
          viewedPeptides: [],
          articlesRead: 0,
        }),
    }),
    {
      name: 'peptalk-achievements',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        xp: state.xp,
        earnedBadgeIds: state.earnedBadgeIds,
        pendingCelebrations: state.pendingCelebrations,
        viewedPeptides: state.viewedPeptides,
        articlesRead: state.articlesRead,
      }),
    },
  ),
);

export default useAchievementStore;
