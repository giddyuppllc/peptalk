/**
 * Single source of truth for subscription tier names + display prices.
 *
 * These values are UI copy only — the authoritative prices come from the
 * App Store Connect / Play Console listings (fetched via IAP.getProducts
 * when available). Keep these in sync with what's configured in the stores
 * so the paywall doesn't advertise a different price than what Apple/Google
 * actually charge.
 */

import type { SubscriptionTier } from '../types/fitness';

export const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'PepTalk+',
  pro: 'PepTalk Pro',
};

export interface TierPrice {
  monthly: string;
}

/**
 * Display prices per tier. Shown in PaywallModal + subscription screen.
 *
 * IMPORTANT: these strings must match the products you configured in
 * App Store Connect (Apple) and Play Console (Google). On a price change,
 * update both stores AND this file in the same release — otherwise the
 * paywall will advertise a price that doesn't match what the user is
 * actually charged at checkout.
 *
 * Yearly plans are not yet launched — keep monthly-only across all paywall
 * surfaces until the annual SKU is configured in both stores.
 */
export const TIER_PRICE: Record<SubscriptionTier, TierPrice> = {
  free: { monthly: '$0' },
  plus: { monthly: '$9.99/mo' },
  pro: { monthly: '$49.99/mo' },
};

/** Short summary used in small contexts (paywall badges, upgrade nudges). */
export function tierPriceShort(tier: SubscriptionTier): string {
  return TIER_PRICE[tier].monthly;
}
