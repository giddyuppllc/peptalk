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
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
