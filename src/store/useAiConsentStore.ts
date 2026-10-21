/**
 * AI-consent store — records the user's explicit, one-time consent to send
 * their inputs (chat text, voice, photos) to PepTalk's third-party AI
 * providers (OpenAI Whisper for transcription, xAI/Grok for Aimee, vision
 * for food/lab scans).
 *
 * App Store Guideline 5.1.2 requires explicit consent BEFORE sharing
 * personal data with third parties, including third-party AI services.
 * The root <AiConsentModal> captures this up front; ensureAiConsent() is
 * the imperative belt-and-suspenders guard on the highest-data surfaces.
 */

import { create } from 'zustand';
import { makeSafeMerge } from '../lib/persistSafety';
import { reportPersistProblem } from '../lib/persistReporting';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';

interface AiConsentState {
  /** Whether persist has finished rehydrating. Gate UI on this so the
   *  in-memory default (consented=false) doesn't flash the modal to a
   *  user who already consented before storage loads. */
  hasHydrated: boolean;
  /** True once the user has explicitly agreed to AI data processing. */
  consented: boolean;
  /** Record explicit consent. */
  grantConsent: () => void;
  /** Clear consent (e.g. account reset / testing). */
  resetConsent: () => void;
}

export const useAiConsentStore = create<AiConsentState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      consented: false,
      grantConsent: () => set({ consented: true }),
      resetConsent: () => set({ consented: false }),
    }),
    {
      name: 'peptalk-ai-consent',
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
      merge: makeSafeMerge('peptalk-ai-consent', reportPersistProblem),
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ consented: state.consented }),
      onRehydrateStorage: () => () => {
        useAiConsentStore.setState({ hasHydrated: true });
      },
    },
  ),
);

export default useAiConsentStore;
