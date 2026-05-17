/**
 * Reactions store — Master Refactor Plan v3.1 §12.1.
 *
 * Local store of reaction counts keyed by milestone id. Each kind of
 * reaction (clap / muscle / target) has its own counter so the UI can
 * surface "👏 12 · 💪 7" without conflating intent.
 *
 * The user can react to their own milestones today (self-encouragement
 * is a real adherence lever). When the server-side fan-out lands,
 * peers' reactions merge into the same store keyed by the same
 * milestone id — no schema change required.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

export type ReactionKind = 'clap' | 'muscle' | 'target';

export const REACTION_LABELS: Record<ReactionKind, { emoji: string; label: string }> = {
  clap: { emoji: '👏', label: 'Clap' },
  muscle: { emoji: '💪', label: 'Strong' },
  target: { emoji: '🎯', label: 'On target' },
};

interface MilestoneReactions {
  clap: number;
  muscle: number;
  target: number;
}

interface ReactionsState {
  /** Map of milestoneId → per-kind counts. */
  byMilestone: Record<string, MilestoneReactions>;
  /** Per-milestone-per-kind flag so a single user can't fan out 1000
   *  reactions of the same kind. Server fan-out replaces this with a
   *  proper member set. */
  reactedKinds: Record<string, ReactionKind[]>;
}

interface ReactionsActions {
  /** Toggle a reaction kind on a milestone. Returns the new total
   *  for that kind so the UI can animate. */
  toggleReaction: (milestoneId: string, kind: ReactionKind) => number;
  /** All counts for a milestone, with zeros for missing kinds. */
  counts: (milestoneId: string) => MilestoneReactions;
  /** Has the local user reacted with this kind to this milestone? */
  hasReacted: (milestoneId: string, kind: ReactionKind) => boolean;
  clearAll: () => void;
}

const emptyCounts: MilestoneReactions = { clap: 0, muscle: 0, target: 0 };

export const useReactionsStore = create<ReactionsState & ReactionsActions>()(
  persist(
    (set, get) => ({
      byMilestone: {},
      reactedKinds: {},

      toggleReaction: (milestoneId, kind) => {
        const current = get().byMilestone[milestoneId] ?? { ...emptyCounts };
        const reactedHere = get().reactedKinds[milestoneId] ?? [];
        const alreadyReacted = reactedHere.includes(kind);
        const nextCount = Math.max(
          0,
          current[kind] + (alreadyReacted ? -1 : 1),
        );
        set({
          byMilestone: {
            ...get().byMilestone,
            [milestoneId]: { ...current, [kind]: nextCount },
          },
          reactedKinds: {
            ...get().reactedKinds,
            [milestoneId]: alreadyReacted
              ? reactedHere.filter((k) => k !== kind)
              : [...reactedHere, kind],
          },
        });
        return nextCount;
      },

      counts: (milestoneId) =>
        get().byMilestone[milestoneId] ?? { ...emptyCounts },

      hasReacted: (milestoneId, kind) =>
        (get().reactedKinds[milestoneId] ?? []).includes(kind),

      clearAll: () => set({ byMilestone: {}, reactedKinds: {} }),
    }),
    {
      name: 'peptalk-reactions-v1',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
