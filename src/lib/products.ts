/**
 * products — PURE IAP product catalog + product→tier resolution, extracted
 * from iapService so it can be unit-tested without importing react-native.
 *
 * SECURITY-CRITICAL: this map is what pins a purchased product to the tier the
 * user is entitled to (see useSubscriptionStore.validatePurchase's trust-but-
 * verify step). An unknown product MUST resolve to no tier so a bogus/tampered
 * productId can never silently unlock a paid tier. Behaviour is identical to the
 * constants that previously lived inline in iapService.ts.
 */

import type { SubscriptionTier } from '../types/fitness';

// Product IDs — must match App Store Connect / Play Console exactly.
//
// **Pricing policy:** monthly subscriptions only. Yearly ids remain in the
// PRODUCT_TO_TIER map purely as defensive resolution for any legacy sandbox /
// TestFlight yearly receipt; they are omitted from ALL_PRODUCT_IDS so
// getProducts() never asks the store about a SKU that doesn't exist.
export const PRODUCT_IDS = {
  plusMonthly: 'peptalk_plus_monthly',
  plusYearly: 'peptalk_plus_yearly',
  proMonthly: 'peptalk_pro_monthly',
  proYearly: 'peptalk_pro_yearly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export const ALL_PRODUCT_IDS: string[] = [
  PRODUCT_IDS.plusMonthly,
  PRODUCT_IDS.proMonthly,
  // Monthly-only for v1.9.x — see header comment.
];

// Map product ID → tier so the store knows which features to unlock.
// Keep yearly ids mapped so receipt validation still works the day we add
// yearly back, without a migration.
export const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [PRODUCT_IDS.plusMonthly]: 'plus',
  [PRODUCT_IDS.plusYearly]: 'plus',
  [PRODUCT_IDS.proMonthly]: 'pro',
  [PRODUCT_IDS.proYearly]: 'pro',
};

/**
 * Resolve a product id to its tier, or `undefined` if the product is unknown.
 * Unknown → undefined is the security-relevant contract: callers must NOT
 * grant a tier for a product not in the catalog.
 */
export function tierForProduct(productId: string): SubscriptionTier | undefined {
  return PRODUCT_TO_TIER[productId];
}
