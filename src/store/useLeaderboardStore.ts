/**
 * Leaderboard store — the fetched boards, shout-outs, and the opt-in switch.
 *
 * WHAT IS PERSISTED, AND WHY SO LITTLE
 * Only `pendingOptIn`: a choice made in onboarding that could not be written
 * yet (no session — e.g. the email-confirmation path). It is flushed on the next
 * authenticated boot and then cleared. Everything else lives in memory only: the
 * server is the source of truth for who is on the board, and a persisted copy of
 * other people's rows is exactly the stale cache an opt-out must not survive.
 *
 * OPT-OUT IS IMMEDIATE
 * When the write succeeds, the viewer's own rows are removed from every board
 * and the shout-out list in the same `set`, before the refetch returns. The
 * server stops returning them on its very next call (no materialized table).
 *
 * HIDE
 * "Hide this person" is the existing community block (symmetric), so the
 * leaderboard, the feed and comments all agree. The row is dropped locally at
 * once; the server also excludes blocked pairs.
 *
 * REPORT
 * Hiding is a private action; reporting is the one that reaches a human. The
 * board publishes another member's display name, avatar and progress metrics
 * to every signed-in user, so under App Review 1.2 it needs both, from a
 * visible control. `reportUser` goes through the same community-report
 * function the feed uses — see src/lib/reportTargets.ts for the payload
 * allowlist. It does NOT hide the person: reporting and blocking are separate
 * choices in the feed too, and silently blocking someone a user only wanted to
 * flag would be a decision the app made for them.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import type { LeaderboardMetric } from '../lib/leaderboardMetrics';
import {
  purgeSelf,
  purgeUser,
  type LeaderboardRow,
  type MyMetrics,
  type ShoutoutRow,
  type ListState,
  type LoadStatus,
} from '../lib/leaderboardPayload';
import {
  fetchLeaderboard,
  fetchLeaderboardOptIn,
  fetchMyMetrics,
  fetchShoutouts,
  saveLeaderboardOptIn,
} from '../services/leaderboardService';
import { useCommunityStore } from './useCommunityStore';
import { buildReportBody } from '../lib/reportTargets';
import type { CommunityReportReason } from '../types/community';

const EMPTY_LIST = { rows: [], status: 'idle' as LoadStatus };

interface LeaderboardState {
  /** Server value. null = not loaded / signed out. */
  optIn: boolean | null;
  savingOptIn: boolean;
  /** Onboarding choice not yet written to the server. Persisted. */
  pendingOptIn: boolean | null;
  boards: Record<LeaderboardMetric, ListState<LeaderboardRow>>;
  shoutouts: ListState<ShoutoutRow>;
  myMetrics: MyMetrics | null;
}

interface LeaderboardActions {
  loadOptIn: () => Promise<void>;
  /** Returns true only when the server accepted the change. */
  setOptIn: (optIn: boolean) => Promise<boolean>;
  /** Called from onboarding. Default-off needs no write. */
  recordOnboardingChoice: (optIn: boolean) => Promise<void>;
  flushPendingOptIn: () => Promise<void>;
  loadBoard: (metric: LeaderboardMetric) => Promise<void>;
  loadShoutouts: () => Promise<void>;
  loadMyMetrics: () => Promise<void>;
  hideUser: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Flag a member shown on the board or in a shout-out. Does not hide them. */
  reportUser: (userId: string, reason: CommunityReportReason) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  clearAll: () => void;
}

const initialBoards = (): LeaderboardState['boards'] => ({
  checkin_streak: { ...EMPTY_LIST },
  dose_adherence_30d: { ...EMPTY_LIST },
  workouts_30d: { ...EMPTY_LIST },
});

export const useLeaderboardStore = create<LeaderboardState & LeaderboardActions>()(
  persist(
    (set, get) => ({
      optIn: null,
      savingOptIn: false,
      pendingOptIn: null,
      boards: initialBoards(),
      shoutouts: { ...EMPTY_LIST },
      myMetrics: null,

      loadOptIn: async () => {
        const v = await fetchLeaderboardOptIn();
        set({ optIn: v });
      },

      setOptIn: async (optIn) => {
        set({ savingOptIn: true });
        const ok = await saveLeaderboardOptIn(optIn);
        if (!ok) {
          set({ savingOptIn: false });
          return false;
        }
        // An explicit choice supersedes anything left over from onboarding.
        set({ optIn, savingOptIn: false, pendingOptIn: null });
        if (!optIn) {
          const { boards, shoutouts } = get();
          set(purgeSelf(boards, shoutouts));
        }
        // Refresh whatever has been loaded so the board reflects the change.
        const { boards } = get();
        for (const k of Object.keys(boards) as LeaderboardMetric[]) {
          if (boards[k].status !== 'idle') void get().loadBoard(k);
        }
        if (get().shoutouts.status !== 'idle') void get().loadShoutouts();
        return true;
      },

      recordOnboardingChoice: async (optIn) => {
        if (optIn !== true) {
          set({ pendingOptIn: null });
          return;
        }
        set({ pendingOptIn: true });
        await get().flushPendingOptIn();
      },

      flushPendingOptIn: async () => {
        const pending = get().pendingOptIn;
        if (pending == null) return;
        const ok = await saveLeaderboardOptIn(pending);
        if (ok) set({ pendingOptIn: null, optIn: pending });
      },

      loadBoard: async (metric) => {
        set({ boards: { ...get().boards, [metric]: { ...get().boards[metric], status: 'loading' } } });
        const res = await fetchLeaderboard(metric);
        const blocked = new Set(useCommunityStore.getState().blockedUserIds);
        set({
          boards: {
            ...get().boards,
            [metric]: res.ok
              ? { rows: res.rows.filter((r) => !blocked.has(r.userId)), status: 'ready' }
              : { rows: get().boards[metric].rows, status: 'error' },
          },
        });
      },

      loadShoutouts: async () => {
        set({ shoutouts: { ...get().shoutouts, status: 'loading' } });
        const res = await fetchShoutouts();
        const blocked = new Set(useCommunityStore.getState().blockedUserIds);
        set({
          shoutouts: res.ok
            ? { rows: res.rows.filter((r) => !blocked.has(r.userId)), status: 'ready' }
            : { rows: get().shoutouts.rows, status: 'error' },
        });
      },

      loadMyMetrics: async () => {
        const m = await fetchMyMetrics();
        if (m) set({ myMetrics: m });
      },

      hideUser: async (userId) => {
        const res = await useCommunityStore.getState().blockUser(userId);
        if (res.ok) {
          const { boards, shoutouts } = get();
          set(purgeUser(boards, shoutouts, userId));
        }
        return res;
      },

      reportUser: async (userId, reason) => {
        // Built here rather than inline so the payload goes through the same
        // allowlist as every other report and cannot pick up board data.
        const built = buildReportBody({ kind: 'user', userId }, reason);
        if (!built.ok) return { ok: false, error: built.error };
        return useCommunityStore.getState().reportContent(built.body);
      },

      clearAll: () =>
        set({
          optIn: null,
          savingOptIn: false,
          pendingOptIn: null,
          boards: initialBoards(),
          shoutouts: { ...EMPTY_LIST },
          myMetrics: null,
        }),
    }),
    {
      name: 'peptalk-leaderboard-v1',
      storage: createJSONStorage(() => secureStorage),
      // Only the unsent onboarding choice. Never other people's rows.
      partialize: (s) => ({ pendingOptIn: s.pendingOptIn }),
    },
  ),
);
