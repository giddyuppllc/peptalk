/**
 * Feature waitlist store — opt-in flag per coming-soon feature.
 *
 * Right now there's no email-pipeline server-side; this just persists
 * which features the user has tapped "Get early access" on so we can
 * surface that state across screens (and at launch time we can sync
 * the flags to a `feature_waitlist` table on Supabase to drive the
 * notification rollout).
 *
 * Synced via syncService alongside other Zustand stores when the user
 * is signed in and online.
 */

import { create } from 'zustand';
import { makeSafeMerge } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

interface FeatureWaitlistState {
  /** Map keyed by feature id ("max_your_stack") → ISO timestamp of join. */
  signups: Record<string, string>;
  join: (featureId: string) => void;
  leave: (featureId: string) => void;
  clearAll: () => void;
}

export const useFeatureWaitlistStore = create<FeatureWaitlistState>()(
  persist(
    (set, get) => ({
      signups: {},
      join: (featureId) => {
        if (get().signups[featureId]) return;
        set((s) => ({
          signups: { ...s.signups, [featureId]: new Date().toISOString() },
        }));
      },
      leave: (featureId) => {
        const next = { ...get().signups };
        delete next[featureId];
        set({ signups: next });
      },
      clearAll: () => set({ signups: {} }),
    }),
    {
      name: 'peptalk-feature-waitlist',
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
      merge: makeSafeMerge('peptalk-feature-waitlist', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
