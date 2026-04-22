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
  yearly: string;
  /** Savings label shown next to the yearly price. */
  yearlySavings?: string;
}

/** Display prices per tier. Shown in PaywallModal + subscription screen. */
export const TIER_PRICE: Record<SubscriptionTier, TierPrice> = {
  free: { monthly: '$0', yearly: '$0' },
  plus: { monthly: '$9.99/mo', yearly: '$89.99/yr', yearlySavings: 'Save 25%' },
  pro: { monthly: '$49.99/mo', yearly: '$399.99/yr', yearlySavings: 'Save 33%' },
};

/** Short summary used in small contexts (paywall badges, upgrade nudges). */
export function tierPriceShort(tier: SubscriptionTier, preferYearly = true): string {
  const p = TIER_PRICE[tier];
  return preferYearly ? p.yearly : p.monthly;
}
