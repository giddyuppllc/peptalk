/**
 * useFeatureLimit — count-capped feature gating for free tier.
 *
 * Example: free users can save 1 stack. Plus gets unlimited.
 *   const { isOverLimit, remaining } = useFeatureLimit('unlimited_stacks', stacks.length, 1);
 *   if (isOverLimit) showPaywall();
 */

import { useFeatureGate } from './useFeatureGate';

interface FeatureLimitResult {
  /** True if the free user has hit the cap */
  isOverLimit: boolean;
  /** How many slots remain (Infinity if unlimited) */
  remaining: number;
  /** Whether the user has the unlimited version */
  hasUnlimited: boolean;
}

export function useFeatureLimit(
  unlimitedFeature: string,
  currentCount: number,
  freeLimit: number,
): FeatureLimitResult {
  const hasUnlimited = useFeatureGate(unlimitedFeature);
  const isOverLimit = !hasUnlimited && currentCount >= freeLimit;
  const remaining = hasUnlimited ? Infinity : Math.max(0, freeLimit - currentCount);
  return { isOverLimit, remaining, hasUnlimited };
}

export default useFeatureLimit;
