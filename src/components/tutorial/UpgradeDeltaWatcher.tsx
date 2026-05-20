/**
 * UpgradeDeltaWatcher — headless component that watches subscription tier
 * changes and fires the appropriate upgrade-delta tour.
 *
 *   free → plus  →  start 'free_to_plus' tour (if not already seen)
 *   free → pro   →  start 'plus_to_pro' tour (shows Pro-only features)
 *   plus → pro   →  start 'plus_to_pro' tour
 *
 * Tier downgrades are ignored.
 *
 * Renders nothing — pure effect.
 */

import { useEffect } from 'react';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';
import { useTutorialStore } from '../../store/useTutorialStore';

export function UpgradeDeltaWatcher() {
  const tier = useSubscriptionStore((s) => s.tier);
  const subscriptionHasHydrated = useSubscriptionStore((s) => s.hasHydrated);
  const lastKnownTier = useTutorialStore((s) => s.lastKnownTier);
  const setLastKnownTier = useTutorialStore((s) => s.setLastKnownTier);
  const startTour = useTutorialStore((s) => s.startTour);
  const hasSeenTour = useTutorialStore((s) => s.hasSeenTour);
  const seenDeltaTours = useTutorialStore((s) => s.seenDeltaTours);
  const tourActive = useTutorialStore((s) => s.tourActive);

  useEffect(() => {
    // Don't seed lastKnownTier (or fire a delta) until the subscription
    // store has actually rehydrated. Otherwise on first boot we record
    // tier='free' (the default), then the persisted tier='pro' lands
    // and we fire a spurious free→pro upgrade tour.
    if (!subscriptionHasHydrated) return;

    // On first run, just record the current tier so we don't fire a delta
    // for a tier that was set during onboarding.
    if (lastKnownTier === null) {
      setLastKnownTier(tier);
      return;
    }

    // No change
    if (lastKnownTier === tier) return;

    // Downgrade — just record new tier, no tour
    const tierRank = { free: 0, plus: 1, pro: 2 } as const;
    if (tierRank[tier] < tierRank[lastKnownTier]) {
      setLastKnownTier(tier);
      return;
    }

    // Upgrade — decide which delta tour to fire
    let variant: 'free_to_plus' | 'plus_to_pro' | null = null;
    if (lastKnownTier === 'free' && tier === 'plus') variant = 'free_to_plus';
    else if (lastKnownTier === 'plus' && tier === 'pro') variant = 'plus_to_pro';
    else if (lastKnownTier === 'free' && tier === 'pro') variant = 'plus_to_pro';

    setLastKnownTier(tier);

    if (!variant) return;
    if (seenDeltaTours[variant]) return;

    // Delay so the user sees the "you're now Plus/Pro" state first, then tour
    // starts after the subscription screen dismisses.
    // Return the cleanup so the timer cancels if the component
    // unmounts within the 1.2s window — earlier this fired
    // startTour() on a dead consumer (Wave 76.10 render audit).
    if (!tourActive && hasSeenTour) {
      const timer = setTimeout(() => {
        startTour(variant as any);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [tier, subscriptionHasHydrated, lastKnownTier, setLastKnownTier, startTour, hasSeenTour, seenDeltaTours, tourActive]);

  return null;
}

export default UpgradeDeltaWatcher;
