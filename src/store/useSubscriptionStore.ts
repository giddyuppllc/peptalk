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
import { PRODUCT_TO_TIER } from './../services/iapService';
import { trackUpgradeSucceeded, trackUpgradeFailed } from '../services/analyticsEvents';
import { maybeAskForReview } from '../services/reviewPrompt';

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

/**
 * Lifecycle status for the current subscription. UI uses this to decide
 * whether to show win-back banners, renewal prompts, or paywalls.
 *
 * - `none`       — free tier, never subscribed (or subscription was cleared)
 * - `active`     — paid and comfortably valid (>7 days remaining, or no expiry)
 * - `expiring`   — paid but within 7 days of expiry — good time for a renewal prompt
 * - `expired`    — was paid, past the expiry date — candidate for a win-back flow
 * - `cancelled`  — user canceled but still within the paid window (reserved; requires
 *                  receipt-level data from validate-purchase to populate reliably)
 * - `trial`      — in intro/free trial window (reserved; same data requirement)
 */
export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'cancelled'
  | 'trial';

const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

function deriveStatus(input: {
  tier: SubscriptionTier;
  expiresAt: string | null;
  productId: string | null;
}): SubscriptionStatus {
  if (input.tier === 'free') return 'none';
  // Beta grants are treated as active indefinitely.
  if (input.productId === 'beta_tester_grant') return 'active';
  // Paid tier without an expiry (lifetime / legacy records) — treat as active.
  if (!input.expiresAt) return 'active';
  const exp = new Date(input.expiresAt).getTime();
  if (Number.isNaN(exp)) return 'active';
  const now = Date.now();
  if (exp <= now) return 'expired';
  if (exp - now <= EXPIRING_SOON_MS) return 'expiring';
  return 'active';
}

interface SubscriptionState {
  tier: SubscriptionTier;
  productId: string | null;
  expiresAt: string | null;
  isActive: boolean;
  /**
   * Supabase user ids we've seen match a beta-tester email. Once a user id
   * lands here, they keep Pro access even if they later change their email,
   * so testers can reshuffle work / personal addresses without losing access.
   */
  betaUserIds: string[];
  /**
   * Purchase the store reported as pending (Android parental consent,
   * iOS "Ask to Buy", SCA challenges). Entitlement is NOT granted while
   * this is set — the UI shows a "waiting for approval" state.
   */
  pendingPurchase: { productId: string; sinceMs: number } | null;
  /** ms epoch of the last successful server sync. Used to flag stale state. */
  lastSyncedAt: number;
}

/** How old a syncFromServer result can be before we treat it as stale. */
const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

/** Seconds to wait between sync retries. Exponential-ish: 1.5s, 4s. */
const SYNC_RETRY_DELAYS_MS = [1500, 4000];

interface SubscriptionActions {
  hasFeature: (feature: string) => boolean;
  activate: (tier: SubscriptionTier, productId: string, expiresAt: string) => void;
  deactivate: () => void;
  isExpired: () => boolean;
  /** Current lifecycle status (`active`, `expiring`, `expired`, etc.). */
  getStatus: () => SubscriptionStatus;
  /** ms until expiresAt; negative if already expired; null for non-expiring grants. */
  getTimeUntilExpiry: () => number | null;
  getFeatures: () => string[];
  setTier: (tier: SubscriptionTier) => void;
  /** Validate a fresh IAP receipt with the backend and update the tier. */
  validatePurchase: (platform: 'ios' | 'android', productId: string, receipt: string) => Promise<boolean>;
  /**
   * Pull the authoritative tier from the subscriptions table on app boot.
   * Retries transient failures; sets `lastSyncedAt` on success.
   */
  syncFromServer: () => Promise<void>;
  /** Mark a purchase as pending approval (parental consent, SCA, etc.). */
  setPendingPurchase: (info: { productId: string } | null) => void;
  /**
   * True if `lastSyncedAt` is older than `STALE_SYNC_MS`. Call this before
   * gating a feature if the user appears to have no subscription — their
   * cached state might be out of date.
   */
  isStale: () => boolean;
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
      betaUserIds: [],
      pendingPurchase: null,
      lastSyncedAt: 0,

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
        const { tier, expiresAt, productId } = get();
        return deriveStatus({ tier, expiresAt, productId }) === 'expired';
      },

      getStatus: () => {
        const { tier, expiresAt, productId } = get();
        return deriveStatus({ tier, expiresAt, productId });
      },

      getTimeUntilExpiry: () => {
        const { expiresAt, productId } = get();
        if (productId === 'beta_tester_grant') return null;
        if (!expiresAt) return null;
        const exp = new Date(expiresAt).getTime();
        if (Number.isNaN(exp)) return null;
        return exp - Date.now();
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
            trackUpgradeFailed(productId, error?.message ?? 'validation_failed');
            return false;
          }
          // Trust-but-verify: the server shouldn't hand us a tier that
          // disagrees with the productId it received, but if it does (bug,
          // MITM, stale edge function deploy) don't silently upgrade the
          // user. Pin the tier to whatever the product catalog says.
          const expectedTier = PRODUCT_TO_TIER[productId];
          if (expectedTier && data.tier && data.tier !== expectedTier) {
            if (__DEV__) {
              console.warn(
                '[useSubscriptionStore] tier/product mismatch — server said',
                data.tier,
                'but',
                productId,
                'maps to',
                expectedTier,
                '— using expected tier',
              );
            }
          }
          const resolvedTier = expectedTier ?? data.tier;
          set({
            tier: resolvedTier,
            productId,
            expiresAt: data.expiresAt ?? null,
            isActive: true,
            pendingPurchase: null,
            lastSyncedAt: Date.now(),
          });
          // Fire the success funnel event at the point entitlement is
          // actually granted — NOT where the purchase sheet resolved,
          // since that's pre-validation and would over-report conversion.
          trackUpgradeSucceeded(productId, resolvedTier);
          // A successful paid upgrade is a high-delight moment — good time
          // to ask for a review. The helper enforces its own cooldown.
          maybeAskForReview('upgrade_succeeded').catch(() => {});
          return true;
        } catch (err) {
          if (__DEV__) console.warn('[useSubscriptionStore] validatePurchase threw:', err);
          trackUpgradeFailed(productId, err instanceof Error ? err.message : 'unknown');
          return false;
        }
      },

      setPendingPurchase: (info) => {
        set({
          pendingPurchase: info ? { productId: info.productId, sinceMs: Date.now() } : null,
        });
      },

      isStale: () => {
        const { lastSyncedAt } = get();
        if (!lastSyncedAt) return true;
        return Date.now() - lastSyncedAt > STALE_SYNC_MS;
      },

      syncFromServer: async () => {
        // Retry transient failures so a flaky network during boot doesn't
        // leave users locked to the last-persisted tier for the session.
        const attempts = SYNC_RETRY_DELAYS_MS.length + 1;
        let lastErr: unknown = null;
        for (let i = 0; i < attempts; i++) {
          try {
            const { supabase } = await import('../services/supabase');
            const { data: { user } } = await (supabase as any).auth.getUser();
            if (!user) {
              // Not signed in — don't mark success or failure; just bail.
              return;
            }

            // Beta-tester bypass: grant Pro locally without hitting the
            // subscriptions table. Match on EITHER the email allowlist OR a
            // previously-recorded user id — once a tester has been recognized
            // on this device, their user id is pinned so email changes don't
            // silently revoke access.
            const email = (user.email ?? '').toLowerCase();
            const userId: string | undefined = user.id;
            const { betaUserIds } = get();
            const emailMatch = !!email && BETA_TESTER_EMAILS.has(email);
            const idMatch = !!userId && betaUserIds.includes(userId);
            if (emailMatch || idMatch) {
              if (emailMatch && userId && !betaUserIds.includes(userId)) {
                set({ betaUserIds: [...betaUserIds, userId] });
              }
              set({
                tier: 'pro',
                productId: 'beta_tester_grant',
                expiresAt: null,
                isActive: true,
                lastSyncedAt: Date.now(),
              });
              return;
            }

            // Grab the most recent subscription row for this user. We no
            // longer filter on `is_active=true` here because expiry is the
            // authoritative signal and bad DB state (stale is_active=false)
            // can mask a currently-valid subscription.
            const { data, error } = await (supabase as any)
              .from('subscriptions')
              .select('tier, product_id, expires_at, is_active')
              .eq('user_id', user.id)
              .order('last_validated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (error) throw error;
            if (!data) {
              // No subscription row. Two cases:
              //   (a) brand-new user (current tier is 'free' anyway) → fine to set
              //   (b) previously-paid user whose row is missing because of a sync
              //       race, RLS issue, or captive-wifi giving us an empty
              //       response without an error → DO NOT silently downgrade.
              //
              // The legitimate downgrade signal comes from apple-notifications /
              // google-rtdn webhooks writing is_active=false. If we never see
              // that signal, prefer to keep the cached paid state and rely on
              // a future sync to converge.
              const prevTier = get().tier;
              if (prevTier === 'free') {
                set({
                  tier: 'free',
                  productId: null,
                  expiresAt: null,
                  isActive: false,
                  lastSyncedAt: Date.now(),
                });
              } else if (__DEV__) {
                console.warn(
                  `[useSubscriptionStore] empty subscription row but cached tier=${prevTier} — keeping cached state, awaiting webhook signal`,
                );
              }
              return;
            }
            const stillValid =
              (data.is_active ?? true) &&
              (!data.expires_at || new Date(data.expires_at) > new Date());
            set({
              tier: stillValid ? data.tier : 'free',
              productId: data.product_id,
              expiresAt: data.expires_at,
              isActive: stillValid,
              lastSyncedAt: Date.now(),
            });
            return;
          } catch (err) {
            lastErr = err;
            if (__DEV__) {
              console.warn(
                `[useSubscriptionStore] syncFromServer attempt ${i + 1}/${attempts} failed:`,
                err,
              );
            }
            if (i < SYNC_RETRY_DELAYS_MS.length) {
              await new Promise((r) => setTimeout(r, SYNC_RETRY_DELAYS_MS[i]));
            }
          }
        }
        if (__DEV__) {
          console.warn('[useSubscriptionStore] syncFromServer gave up:', lastErr);
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
        betaUserIds: state.betaUserIds,
        lastSyncedAt: state.lastSyncedAt,
        // pendingPurchase is intentionally NOT persisted — a stale "waiting
        // for approval" across app restarts would be worse than losing it.
      }),
    },
  ),
);

export default useSubscriptionStore;
