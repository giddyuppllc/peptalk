/**
 * Leaderboard store — the fetched boards, shout-outs, and the opt-in switch.
 *
 * WHAT IS PERSISTED, AND WHY SO LITTLE
 * Only `pendingOptIn` and the address it was made for: a choice made in
 * onboarding that could not be written yet (no session — e.g. the
 * email-confirmation path). It is flushed on the next authenticated boot and
 * then cleared. Everything else lives in memory only: the server is the source
 * of truth for who is on the board, and a persisted copy of other people's
 * rows is exactly the stale cache an opt-out must not survive.
 *
 * A HELD CHOICE IS BOUND TO AN ACCOUNT
 * It used to be a bare boolean, resolved to whoever was signed in when the
 * flush ran. A signs up on the email-confirmation path, never confirms, and B
 * signs in on the same install — B was silently put on the public leaderboard
 * having never been asked. The address the choice was made for is persisted
 * with it and the flush requires a match, mirroring the `resume.userId ===
 * currentUserId` guard in app/onboarding.tsx. A choice that cannot be
 * attributed to an account is not held at all.
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
import { makeSafeMerge } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
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
  fetchCurrentAccountEmail,
  fetchLeaderboard,
  fetchLeaderboardOptIn,
  fetchMyMetrics,
  fetchShoutouts,
  normalizeAccountEmail,
  saveLeaderboardOptIn,
} from '../services/leaderboardService';
import { useCommunityStore } from './useCommunityStore';
import { buildReportBody } from '../lib/reportTargets';
import type { CommunityReportReason } from '../types/community';

const EMPTY_LIST = { rows: [], status: 'idle' as LoadStatus };

/**
 * Monotonic token for the opt-in read. A fetch that started before the user
 * touched the switch must not land on top of the choice they just made.
 */
let optInReadToken = 0;

interface LeaderboardState {
  /** Server value. null = not loaded / signed out. */
  optIn: boolean | null;
  savingOptIn: boolean;
  /** Onboarding choice not yet written to the server. Persisted. */
  pendingOptIn: boolean | null;
  /** The account `pendingOptIn` was made for. Persisted with it. */
  pendingOptInEmail: string | null;
  boards: Record<LeaderboardMetric, ListState<LeaderboardRow>>;
  shoutouts: ListState<ShoutoutRow>;
  myMetrics: MyMetrics | null;
}

interface LeaderboardActions {
  loadOptIn: () => Promise<void>;
  /** Returns true only when the server accepted the change. */
  setOptIn: (optIn: boolean) => Promise<boolean>;
  /**
   * Called from onboarding. Default-off needs no write. `forEmail` is the
   * account the answer was given for — the signup address, or the signed-in
   * one — so a choice that cannot be written yet stays attached to it.
   */
  recordOnboardingChoice: (optIn: boolean, forEmail?: string | null) => Promise<void>;
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
      pendingOptInEmail: null,
      boards: initialBoards(),
      shoutouts: { ...EMPTY_LIST },
      myMetrics: null,

      loadOptIn: async () => {
        const token = ++optInReadToken;
        const v = await fetchLeaderboardOptIn();
        // A late mount fetch used to overwrite a toggle the user had just
        // flipped, showing the switch OFF while they were publicly ranked.
        // The server's answer is only news if nothing newer happened while it
        // was out.
        if (token !== optInReadToken || get().savingOptIn) return;
        set({ optIn: v });
      },

      setOptIn: async (optIn) => {
        // Invalidates any opt-in read already in flight: the user's own action
        // is newer than whatever that read is about to come back with.
        optInReadToken++;
        set({ savingOptIn: true });
        const ok = await saveLeaderboardOptIn(optIn);
        if (!ok) {
          set({ savingOptIn: false });
          return false;
        }
        // An explicit choice supersedes anything left over from onboarding.
        set({ optIn, savingOptIn: false, pendingOptIn: null, pendingOptInEmail: null });
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

      recordOnboardingChoice: async (optIn, forEmail) => {
        if (optIn !== true) {
          set({ pendingOptIn: null, pendingOptInEmail: null });
          return;
        }
        // Written now when there is a session: the answer belongs to whoever
        // is signed in at the moment it is given, with no ambiguity to store.
        if (await saveLeaderboardOptIn(true)) {
          set({ optIn: true, pendingOptIn: null, pendingOptInEmail: null });
          return;
        }
        // No session yet (the email-confirmation signup path), or the write
        // failed. Hold it — but only against the account it was meant for. A
        // choice with no address cannot be attributed to anyone on the next
        // boot, and handing it to whoever signs in next is the bug.
        const email = normalizeAccountEmail(forEmail);
        set(
          email
            ? { pendingOptIn: true, pendingOptInEmail: email }
            : { pendingOptIn: null, pendingOptInEmail: null },
        );
      },

      flushPendingOptIn: async () => {
        const { pendingOptIn: pending, pendingOptInEmail } = get();
        if (pending == null) return;
        // Persisted by a build that did not record the account (or by a path
        // that could not name one). Unattributable, so it is dropped rather
        // than applied to whoever happens to be here.
        if (!pendingOptInEmail) {
          set({ pendingOptIn: null, pendingOptInEmail: null });
          return;
        }
        const signedInAs = await fetchCurrentAccountEmail();
        // No session yet — the account it was made for may still confirm.
        if (!signedInAs) return;
        if (signedInAs !== pendingOptInEmail) {
          // Somebody else is using this install. Their leaderboard visibility
          // is not for the previous signup to decide.
          set({ pendingOptIn: null, pendingOptInEmail: null });
          return;
        }
        const ok = await saveLeaderboardOptIn(pending);
        if (ok) set({ pendingOptIn: null, pendingOptInEmail: null, optIn: pending });
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

      clearAll: () => {
        // An opt-in read still in flight must not repopulate a cleared store.
        optInReadToken++;
        set({
          optIn: null,
          savingOptIn: false,
          pendingOptIn: null,
          pendingOptInEmail: null,
          boards: initialBoards(),
          shoutouts: { ...EMPTY_LIST },
          myMetrics: null,
        });
      },
    }),
    {
      name: 'peptalk-leaderboard-v1',
      // Explicit so the number is visible, and deliberately still 0.
      //
      // In zustand 5.0.14 a bump with no `migrate` DISCARDS the persisted
      // state and hydrates defaults — verified against middleware.js:392-420
      // and by running it. That is the useful meaning of a bump, so nothing
      // here overrides it: a store that needs to carry old data forward
      // supplies its own migrate, and the three that do already have one.
      version: 0,
      // Storage is untrusted input: on web it is localStorage, which the
      // user can edit, and a killed app leaves partial writes. See
      // src/lib/persistSafety.ts.
      merge: makeSafeMerge('peptalk-leaderboard-v1', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
      // Only the unsent onboarding choice, and the account it was made for.
      // Never other people's rows.
      partialize: (s) => ({ pendingOptIn: s.pendingOptIn, pendingOptInEmail: s.pendingOptInEmail }),
    },
  ),
);
