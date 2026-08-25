/**
 * refreshAchievements — the call nobody made.
 *
 * useAchievementStore ships 15 badges, an XP/level curve, a
 * `pendingCelebrations` queue and a CelebrationModal mounted in _layout
 * waiting on it. `earnBadge` is the only writer of that queue, `checkAndAward`
 * its only caller — and NOTHING in the app called `checkAndAward`. So no badge
 * could ever be earned and the modal could never fire.
 *
 * These tests pin the two judgement calls in the stat gathering, because both
 * would hand out badges nobody earned:
 *   - curated stacks are seeded into savedStacks, so a raw count awards
 *     "first stack" on install;
 *   - a scheduled-but-unperformed workout is not a completed one.
 */

import { refreshAchievements } from '../achievements';

const mockCheckAndAward = jest.fn();

jest.mock('../../store/useAchievementStore', () => ({
  useAchievementStore: { getState: () => ({ checkAndAward: mockCheckAndAward }) },
}));
jest.mock('../../store/useCheckinStore', () => ({
  useCheckinStore: {
    getState: () => ({ entries: [{ id: 'c1' }, { id: 'c2' }], getStreak: () => 4 }),
  },
}));
jest.mock('../../store/useWorkoutStore', () => ({
  useWorkoutStore: {
    getState: () => ({
      logs: [
        { id: 'w1', completedAt: '2026-08-24T10:00:00Z' },
        { id: 'w2', completedAt: '2026-08-25T10:00:00Z' },
        { id: 'w3' }, // planned, never performed
      ],
    }),
  },
}));
jest.mock('../../store/useMealStore', () => ({
  useMealStore: {
    getState: () => ({ meals: [{ id: 'm1' }], getWater: () => 120 }),
  },
}));
jest.mock('../../store/useStackStore', () => ({
  useStackStore: {
    getState: () => ({
      savedStacks: [
        { id: 's1', isCurated: true },
        { id: 's2', isCurated: true },
        { id: 's3' }, // the only one the user actually made
      ],
    }),
  },
}));
jest.mock('../../store/useHealthProfileStore', () => ({
  useHealthProfileStore: {
    getState: () => ({
      profile: {
        biologicalSex: 'male',
        bodyMetrics: { weightLbs: 180, heightInches: 70 },
        primaryGoals: ['muscle_gain'],
      },
    }),
  },
}));

const statsFromLastCall = () => mockCheckAndAward.mock.calls[0][0];

beforeEach(() => jest.clearAllMocks());

describe('refreshAchievements', () => {
  it('actually calls checkAndAward — the missing link', () => {
    refreshAchievements();
    expect(mockCheckAndAward).toHaveBeenCalledTimes(1);
  });

  it('counts only workouts that were completed', () => {
    refreshAchievements();
    // 3 logs, one of which has no completedAt.
    expect(statsFromLastCall().workoutCount).toBe(2);
  });

  it('excludes curated stacks, so install does not award "first stack"', () => {
    refreshAchievements();
    expect(statsFromLastCall().stackCount).toBe(1);
  });

  it('passes through the streak and check-in count', () => {
    refreshAchievements();
    expect(statsFromLastCall()).toMatchObject({ checkinCount: 2, streak: 4 });
  });

  it('reports the water goal from today\'s intake', () => {
    refreshAchievements();
    expect(statsFromLastCall().waterGoalHit).toBe(true);
  });

  it('marks the profile complete only when the required fields are present', () => {
    refreshAchievements();
    expect(statsFromLastCall().profileComplete).toBe(true);
  });

  it('never throws — a badge check must not break the user action', () => {
    mockCheckAndAward.mockImplementationOnce(() => {
      throw new Error('store exploded');
    });
    expect(() => refreshAchievements()).not.toThrow();
  });
});
