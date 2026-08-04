/**
 * entitlement — PURE subscription-entitlement logic, extracted from
 * useSubscriptionStore so it can be unit-tested without pulling in
 * zustand / secureStorage / React-Native.
 *
 * SECURITY-CRITICAL: a silent bug here means a user gets the wrong tier
 * (paid features for free, or a paying user locked out). Every function
 * is deterministic and side-effect-free; time is injected via `now` so
 * expiry math is testable. Behaviour is intentionally identical to the
 * inline logic it replaced in useSubscriptionStore.ts.
 */

import type { SubscriptionTier } from '../types/fitness';
import { TIER_FEATURES } from '../types/fitness';

/**
 * Lifecycle status for the current subscription.
 * - `none`      — free tier, never subscribed (or cleared)
 * - `active`    — paid and comfortably valid (>7 days remaining, or no expiry)
 * - `expiring`  — paid but within 7 days of expiry
 * - `expired`   — was paid, past the expiry date
 * - `cancelled` — canceled but still within the paid window (reserved)
 * - `trial`     — in intro/free-trial window (reserved)
 */
export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'cancelled'
  | 'trial';

export const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** Beta grants are treated as active indefinitely and carry this productId. */
export const BETA_PRODUCT_ID = 'beta_tester_grant';

/** Ranking of tiers, low → high. free(0) < plus(1) < pro(2). */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

/** Numeric rank of a tier; unknown tiers rank as 0 (free). */
export function tierRank(tier: string | null | undefined): number {
  if (!tier) return 0;
  return TIER_RANK[tier as SubscriptionTier] ?? 0;
}

/** True if `tier` is at least as privileged as `min` (pro >= plus >= free). */
export function isTierAtLeast(tier: string | null | undefined, min: SubscriptionTier): boolean {
  return tierRank(tier) >= tierRank(min);
}

/**
 * Derive the lifecycle status from tier + expiry + productId.
 *
 * `now` is injectable for testing; defaults to Date.now().
 */
export function deriveStatus(
  input: {
    tier: SubscriptionTier;
    expiresAt: string | null;
    productId: string | null;
  },
  now: number = Date.now(),
): SubscriptionStatus {
  if (input.tier === 'free') return 'none';
  // Beta grants are treated as active indefinitely.
  if (input.productId === BETA_PRODUCT_ID) return 'active';
  // Paid tier without an expiry (lifetime / legacy records) — treat as active.
  if (!input.expiresAt) return 'active';
  const exp = new Date(input.expiresAt).getTime();
  if (Number.isNaN(exp)) return 'active';
  if (exp <= now) return 'expired';
  if (exp - now <= EXPIRING_SOON_MS) return 'expiring';
  return 'active';
}

/**
 * ms until expiry; negative if already expired; null for non-expiring grants
 * (beta grants, or a paid row with no expiry) and unparseable dates.
 *
 * `now` is injectable for testing; defaults to Date.now().
 */
export function timeUntilExpiry(
  input: { expiresAt: string | null; productId: string | null },
  now: number = Date.now(),
): number | null {
  if (input.productId === BETA_PRODUCT_ID) return null;
  if (!input.expiresAt) return null;
  const exp = new Date(input.expiresAt).getTime();
  if (Number.isNaN(exp)) return null;
  return exp - now;
}

/**
 * PURE core of useSubscriptionStore.hasFeature — the tier/expiry gating that
 * runs AFTER the preview-build bypass. Returns whether `feature` is unlocked
 * for a user with the given tier / active flag / expiry.
 *
 * The expiry-leak fix (2026-05-17): a paid tier that is inactive OR past its
 * expiry window falls back to FREE-tier features, never the paid set. Free-tier
 * features stay available regardless. `now` is injectable for testing.
 */
export function computeFeatureAccess(
  input: {
    tier: SubscriptionTier;
    isActive: boolean;
    expiresAt: string | null;
    feature: string;
  },
  now: number = Date.now(),
): boolean {
  const { tier, isActive, expiresAt, feature } = input;
  if (tier !== 'free') {
    if (isActive === false) {
      const features = TIER_FEATURES.free ?? [];
      return features.includes(feature);
    }
    if (expiresAt) {
      const expiresMs = new Date(expiresAt).getTime();
      if (Number.isFinite(expiresMs) && now > expiresMs) {
        const features = TIER_FEATURES.free ?? [];
        return features.includes(feature);
      }
    }
  }
  const features = TIER_FEATURES[tier] ?? [];
  return features.includes(feature);
}
