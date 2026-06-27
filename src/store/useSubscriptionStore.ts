/**
 * Subscription / paywall store.
 *
 * Manages the user's tier and feature gating. Real StoreKit purchases run through
 * src/services/iapService.ts (react-native-iap): purchaseProduct() opens the native
 * sheet, the purchaseUpdatedListener (registered in app/_layout.tsx) validates the
 * receipt server-side, and this store reflects the resulting tier/entitlement.
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
 * Beta-tester access — TWO triggers:
 *
 *   1. EXPO_PUBLIC_ENV !== 'production'  (preview / development builds)
 *      Every signed-in user is auto-granted Pro on TestFlight builds, no
 *      email allowlist required. Production builds keep the normal IAP
 *      flow.
 *
 *   2. Server-side BETA_TESTER_EMAILS Supabase secret
 *      Mirror used by the AI / food-scan / lab-scan edge functions to
 *      authorize the actual server calls. Set with:
 *         supabase secrets set BETA_TESTER_EMAILS="email1,email2,..."
 *
 * Hardcoded client-side allowlist removed deliberately — it was a
 * deploy-required maintenance burden and the preview-build bypass
 * already covers TestFlight. Production builds need a real subscription.
 */

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
  /**
   * True once the persisted state has been read back from secureStorage.
   * Splash / paywall gating must wait on this — without it, cold-install
   * Pro users briefly see the paywall on first frame while the store
   * rehydrates from default `tier: 'free'`.
   */
  hasHydrated: boolean;
}

/** How old a syncFromServer result can be before we treat it as stale. */
const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

/** Seconds to wait between sync retries. Exponential-ish: 1.5s, 4s. */
const SYNC_RETRY_DELAYS_MS = [1500, 4000];

/** Single-flight guard for syncFromServer — see comment at the call site. */
let syncInFlight = false;

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
  /**
   * Apply a tier from the `profiles.subscription_tier` MIRROR (e.g. from
   * useAuthStore on login/restore). The subscriptions table is the source
   * of truth; this method exists so the auth path can populate tier
   * optimistically while syncFromServer is still in-flight, WITHOUT
   * clobbering a more-recent authoritative sync. Skips if syncFromServer
   * has run within the staleness window — that ran from the source-of-
   * truth subscriptions row and is authoritative.
   */
  setTierFromProfileMirror: (tier: SubscriptionTier) => void;
  /** Hard reset for logout — wipes tier, productId, expiresAt,
   *  isActive, and lastSyncedAt so the next signed-in user starts
   *  clean instead of inheriting the previous user's subscription
   *  metadata. P0 from Wave 76.11 logout audit. */
  clearSubscription: () => void;
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
      hasHydrated: false,

      hasFeature: (feature) => {
        // Preview / development builds: every signed-in user gets full
        // feature access. Means TestFlight + dev builds don't gate AI
        // or paid features behind paywalls regardless of tester email.
        // Production builds (EXPO_PUBLIC_ENV='production') skip this
        // bypass and gate by tier as normal.
        try {
          const appEnv = (process.env.EXPO_PUBLIC_ENV ?? 'production').toLowerCase();
          if (appEnv !== 'production') {
            const { useAuthStore } = require('./useAuthStore');
            if (useAuthStore.getState().isAuthenticated) return true;
          }
        } catch {
          // Auth store not ready or env missing — fall through to tier check.
        }
        const { tier, isActive, expiresAt } = get();
        // 2026-05-17 expiry leak fix: tier alone wasn't enough. If a
        // user's Plus/Pro subscription expired and the apple-notifications
        // webhook hadn't landed yet (network drop, foregrounded refresh
        // not run), `tier` stayed 'pro' and they kept getting paid
        // features for free. The server-side fns gate by their own
        // `profiles.subscription_tier` query so the *cost door* is closed,
        // but client-side UI was happily unlocking features. Now require
        // active flag + non-expired window for paid features. Free-tier
        // features (`tier === 'free'` lookup) are unaffected.
        if (tier !== 'free') {
          if (isActive === false) {
            const features = TIER_FEATURES.free ?? [];
            return features.includes(feature);
          }
          if (expiresAt) {
            const expiresMs = new Date(expiresAt).getTime();
            if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
              const features = TIER_FEATURES.free ?? [];
              return features.includes(feature);
            }
          }
        }
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

      setTier: (tier) =>
        // 2026-05-17 fix: previously only mutated `tier`+`isActive`,
        // leaving `expiresAt`/`productId` stale from a previous
        // subscription cycle. After a downgrade-then-reupgrade, the
        // old expiresAt would cause getStatus/getTimeUntilExpiry to
        // lie and the win-back banner to fire incorrectly. When the
        // caller pushes a tier without a receipt context, also clear
        // the receipt-bound fields so they re-populate on the next
        // validatePurchase / syncFromServer.
        set((prev) => ({
          tier,
          isActive: true,
          ...(tier === 'free'
            ? { expiresAt: null, productId: null }
            : prev.tier !== tier
              ? { expiresAt: null, productId: null }
              : {}),
        })),

      setTierFromProfileMirror: (tier) => {
        const { lastSyncedAt } = get();
        // If syncFromServer ran recently, it already wrote tier from the
        // authoritative `subscriptions` row. The `profile.subscription_tier`
        // mirror can lag (apple-notifications updates `subscriptions` first
        // then `profiles`), so honouring it would silently downgrade a
        // user during the lag window. 5-minute freshness window matches
        // typical webhook latency.
        const recentSyncMs = 5 * 60 * 1000;
        if (lastSyncedAt > 0 && Date.now() - lastSyncedAt < recentSyncMs) {
          return;
        }
        // Reuse setTier's receipt-clearing logic.
        set((prev) => ({
          tier,
          isActive: true,
          ...(tier === 'free'
            ? { expiresAt: null, productId: null }
            : prev.tier !== tier
              ? { expiresAt: null, productId: null }
              : {}),
        }));
      },

      clearSubscription: () => set({
        tier: 'free',
        productId: null,
        expiresAt: null,
        isActive: false,
        lastSyncedAt: 0,
        pendingPurchase: null,
      }),

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
        // 2026-05-18 in-flight dedup: boot + reconnect-handler +
        // foreground-sync + post-auth-flip can all kick syncFromServer
        // in the same 1-2 seconds. The earlier sync's response can
        // arrive AFTER validatePurchase() updated tier locally,
        // overwriting the just-confirmed Pro tier back to whatever
        // the DB held when sync started. Single-flight via a module
        // ref outside the store state so it survives re-runs.
        if (syncInFlight) return;
        syncInFlight = true;
        try {
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

            // Preview / development build bypass: any signed-in user is
            // auto-granted Pro on TestFlight + dev builds. Production
            // builds skip this and run the normal subscription flow.
            const appEnv = (process.env.EXPO_PUBLIC_ENV ?? 'production').toLowerCase();
            const isNonProductionBuild = appEnv !== 'production';
            if (isNonProductionBuild) {
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
            // 2026-05-17 dual-platform conflict fix: previously this took
            // the most-recently-validated row, which silently picked an
            // expired Android sub over a still-valid iOS sub if Android
            // webhook fired last. Now we pull recent rows and pick the
            // best one client-side using a priority that mirrors the
            // user's intent: a currently-valid row always beats an
            // expired one, regardless of which validated last.
            const { data: rows, error } = await (supabase as any)
              .from('subscriptions')
              .select('tier, product_id, expires_at, is_active, last_validated_at')
              .eq('user_id', user.id)
              .order('last_validated_at', { ascending: false })
              .limit(5);
            if (error) throw error;
            const candidates: Array<{
              tier: SubscriptionTier;
              product_id: string;
              expires_at: string | null;
              is_active: boolean | null;
              last_validated_at: string | null;
            }> = Array.isArray(rows) ? rows : [];
            const nowMs = Date.now();
            const tierRank: Record<SubscriptionTier, number> = {
              free: 0, plus: 1, pro: 2,
            };
            // Score each row. Higher = better. Compose:
            //   100k base if (is_active && not-expired)
            //   10k base if (is_active even if expired) — paid but stale
            //   then tier rank (pro > plus > free) at *1000
            //   then last_validated_at recency in seconds (small additive)
            const score = (r: typeof candidates[number]): number => {
              const valid = (r.is_active ?? false) &&
                (!r.expires_at || new Date(r.expires_at).getTime() > nowMs);
              const base = valid ? 100_000 : (r.is_active ? 10_000 : 0);
              const tierBoost = (tierRank[r.tier] ?? 0) * 1000;
              const recencyMs = r.last_validated_at
                ? new Date(r.last_validated_at).getTime()
                : 0;
              // Newer wins as a small tiebreaker; convert to seconds to
              // keep within safe integer range.
              const recencyBoost = Math.floor(recencyMs / 1000) - 1_700_000_000;
              return base + tierBoost + Math.max(0, recencyBoost);
            };
            const best = candidates.length > 0
              ? candidates.slice().sort((a, b) => score(b) - score(a))[0]
              : null;
            // Adapt to the existing single-row downstream code shape.
            const data = best
              ? {
                  tier: best.tier,
                  product_id: best.product_id,
                  expires_at: best.expires_at,
                  is_active: best.is_active,
                }
              : null;
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
                // Even when the cached tier reads 'free', the local store
                // can be lying during a boot race: hydration from
                // secureStorage may not have restored a genuinely-paid
                // tier yet (or it was just cleared on a transient logout
                // flap). Before committing the downgrade, consult the
                // `profiles.subscription_tier` mirror — a cheaper, eventually-
                // consistent copy of the subscriptions truth. If the profile
                // says the user is paid (plus/pro), DON'T write 'free':
                // keep the paid tier and let a future sync (once the
                // subscriptions row reappears) reconcile authoritatively.
                let mirrorTier: SubscriptionTier | null = null;
                try {
                  const { data: profile } = await (supabase as any)
                    .from('profiles')
                    .select('subscription_tier')
                    .eq('id', user.id)
                    .single();
                  const raw = profile?.subscription_tier;
                  if (raw === 'plus' || raw === 'pro' || raw === 'free') {
                    mirrorTier = raw;
                  }
                } catch (mirrorErr) {
                  // Mirror lookup failed (network / RLS) — treat as unknown
                  // and fall through to the conservative behaviour below.
                  if (__DEV__) {
                    console.warn(
                      '[useSubscriptionStore] profile mirror lookup failed during empty-row sync:',
                      mirrorErr,
                    );
                  }
                }
                if (mirrorTier === 'plus' || mirrorTier === 'pro') {
                  // Profile mirror says paid — the subscriptions row is
                  // momentarily missing/transient. Promote to the mirror
                  // tier and await reconciliation instead of downgrading.
                  // NOTE: deliberately do NOT set lastSyncedAt — this is an
                  // optimistic mirror read, not an authoritative subscriptions
                  // sync, so a real sync should still run / not be suppressed.
                  set({
                    tier: mirrorTier,
                    isActive: true,
                  });
                  if (__DEV__) {
                    console.warn(
                      `[useSubscriptionStore] empty subscription row but profile mirror=${mirrorTier} — keeping paid, awaiting reconciliation`,
                    );
                  }
                } else {
                  // Mirror also free (or unknown) — genuine free user.
                  set({
                    tier: 'free',
                    productId: null,
                    expiresAt: null,
                    isActive: false,
                    lastSyncedAt: Date.now(),
                  });
                }
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
        // 2026-05-17 P1 fix: prod was silent on exhausted retries.
        // Support needs to be able to correlate "I paid for Pro but
        // it shows free" reports with the underlying sync failure.
        try {

          const { captureMessage } = require('../services/telemetry');
          captureMessage?.(
            'subscription syncFromServer exhausted retries',
            'warning',
            { lastErr: lastErr instanceof Error ? lastErr.message : String(lastErr) },
          );
        } catch {}
        } finally {
          syncInFlight = false;
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
      onRehydrateStorage: () => () => {
        // Flag the store as hydrated so the splash gate (and any paywall
        // checks that run on first frame) can wait until the persisted
        // tier has been read back from secureStorage. Otherwise cold-
        // install Pro users see a flash of the paywall on boot.
        useSubscriptionStore.setState({ hasHydrated: true });
      },
    },
  ),
);

export default useSubscriptionStore;
