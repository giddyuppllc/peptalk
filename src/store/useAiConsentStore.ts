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
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ consented: state.consented }),
      onRehydrateStorage: () => () => {
        useAiConsentStore.setState({ hasHydrated: true });
      },
    },
  ),
);

export default useAiConsentStore;
