/**
 * Subscription / paywall store.
 *
 * Manages the user's tier and feature gating.
 * Ready for react-native-iap integration — currently uses local state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../services/secureStorage';
import type { SubscriptionTier } from '../types/fitness';
import { TIER_FEATURES } from '../types/fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionState {
  tier: SubscriptionTier;
  productId: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

interface SubscriptionActions {
  hasFeature: (feature: string) => boolean;
  activate: (tier: SubscriptionTier, productId: string, expiresAt: string) => void;
  deactivate: () => void;
  isExpired: () => boolean;
  getFeatures: () => string[];
  setTier: (tier: SubscriptionTier) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>()(
  persist(
    (set, get) => ({
      tier: 'free' as SubscriptionTier,
      productId: null,
      expiresAt: null,
      isActive: true,

      hasFeature: (feature) => {
        const { tier } = get();
        const features = TIER_FEATURES[tier] ?? [];
        return features.includes(feature);
      },

      activate: (tier, productId, expiresAt) =>
        set({ tier, productId, expiresAt, isActive: true }),

      deactivate: () =>
        set({ tier: 'free', productId: null, expiresAt: null, isActive: false }),

      isExpired: () => {
        const { expiresAt, tier } = get();
        if (tier === 'free') return false;
        if (!expiresAt) return true;
        return new Date(expiresAt) < new Date();
      },

      setTier: (tier) => set({ tier, isActive: true }),

      getFeatures: () => {
        const { tier } = get();
        return TIER_FEATURES[tier] ?? [];
      },
    }),
    {
      name: 'peptalk-subscription',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        tier: state.tier,
        productId: state.productId,
        expiresAt: state.expiresAt,
        isActive: state.isActive,
      }),
    },
  ),
);

export default useSubscriptionStore;
