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

/**
 * Hardcoded beta testers auto-granted Pro tier on sign-in.
 * Add emails here (lowercase) so they get full access without going
 * through the App Store purchase flow. Survives reinstalls.
 */
const BETA_TESTER_EMAILS = new Set<string>([
  'sales@sbbpeptides.com',  // Jamie Esposito
  'edward@giddyupp.com',    // Edward
]);

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
  /** Validate a fresh IAP receipt with the backend and update the tier. */
  validatePurchase: (platform: 'ios' | 'android', productId: string, receipt: string) => Promise<boolean>;
  /** Pull the authoritative tier from the subscriptions table on app boot. */
  syncFromServer: () => Promise<void>;
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

      validatePurchase: async (platform, productId, receipt) => {
        try {
          const { supabase } = await import('../services/supabase');
          const { data: { session } } = await (supabase as any).auth.getSession();
          if (!session?.access_token) return false;

          const { data, error } = await (supabase as any).functions.invoke('validate-purchase', {
            body: { platform, productId, receipt },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (error || !data?.success) {
            if (__DEV__) console.warn('[useSubscriptionStore] validation failed:', error);
            return false;
          }
          set({
            tier: data.tier,
            productId,
            expiresAt: data.expiresAt ?? null,
            isActive: true,
          });
          return true;
        } catch (err) {
          if (__DEV__) console.warn('[useSubscriptionStore] validatePurchase threw:', err);
          return false;
        }
      },

      syncFromServer: async () => {
        try {
          const { supabase } = await import('../services/supabase');
          const { data: { user } } = await (supabase as any).auth.getUser();
          if (!user) return;

          // Beta-tester bypass: if this email is on the allowlist, grant Pro
          // locally without hitting the subscriptions table. This keeps the
          // App Store flow honest for real users while letting testers use
          // every feature.
          const email = (user.email ?? '').toLowerCase();
          if (email && BETA_TESTER_EMAILS.has(email)) {
            set({
              tier: 'pro',
              productId: 'beta_tester_grant',
              expiresAt: null,
              isActive: true,
            });
            return;
          }

          // Grab the most recent active subscription row for this user
          const { data, error } = await (supabase as any)
            .from('subscriptions')
            .select('tier, product_id, expires_at, is_active')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('last_validated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error || !data) {
            // No active subscription → free tier
            set({ tier: 'free', productId: null, expiresAt: null, isActive: false });
            return;
          }
          const stillValid = !data.expires_at || new Date(data.expires_at) > new Date();
          set({
            tier: stillValid ? data.tier : 'free',
            productId: data.product_id,
            expiresAt: data.expires_at,
            isActive: stillValid,
          });
        } catch (err) {
          if (__DEV__) console.warn('[useSubscriptionStore] syncFromServer failed:', err);
        }
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
