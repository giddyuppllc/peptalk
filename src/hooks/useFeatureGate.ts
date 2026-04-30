/**
 * Feature gating hook and PaywallGate component.
 *
 * Checks subscription tier for feature access; shows PaywallModal when blocked.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { PaywallModal } from '../components/PaywallModal';
import { trackFeatureGated } from '../services/analyticsEvents';
import { TIER_FEATURES } from '../types/fitness';

/**
 * Returns true if the current user has access to the given feature.
 */
export function useFeatureGate(feature: string): boolean {
  return useSubscriptionStore((s) => s.hasFeature(feature));
}

/**
 * Returns the current subscription tier.
 */
export function useTier() {
  return useSubscriptionStore((s) => s.tier);
}

/**
 * Returns all features available to the current tier. Subscribes only to
 * `tier` and resolves the feature list via the constant table — calling
 * s.getFeatures() in the selector returned a fresh `[]` if tier was ever
 * missing, which Zustand treated as a state change and re-rendered every
 * frame.
 */
export function useAvailableFeatures(): string[] {
  const tier = useSubscriptionStore((s) => s.tier);
  return TIER_FEATURES[tier] ?? EMPTY_FEATURES;
}

const EMPTY_FEATURES: string[] = [];

/**
 * PaywallGate — renders children if the user has the required feature,
 * otherwise renders a PaywallModal prompting upgrade.
 */
export const PaywallGate: React.FC<{ feature: string; children: React.ReactNode }> = ({
  feature,
  children,
}) => {
  const hasAccess = useFeatureGate(feature);
  const currentTier = useSubscriptionStore((s) => s.tier);
  const [dismissed, setDismissed] = useState(false);

  // Emit a feature_gated event the first time this gate blocks the user so
  // we can see which features drive the most paywall exposure.
  useEffect(() => {
    if (!hasAccess) {
      trackFeatureGated(feature, currentTier);
    }
  }, [hasAccess, feature, currentTier]);

  // When the paywall is dismissed (Maybe Later), pop back to the previous
  // screen synchronously so there's no blank-render frame. Defer with
  // requestAnimationFrame so the modal close animation can finish, then
  // navigate. If we can't pop (deep link landed here), fall back to home.
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    requestAnimationFrame(() => {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)');
        }
      } catch {
        // Last-resort hard-route to home — never leave the user stranded.
        try { router.replace('/(tabs)'); } catch {}
      }
    });
  }, []);

  if (hasAccess) {
    return React.createElement(React.Fragment, null, children);
  }

  // While the dismiss navigation animates, fall back to a parent-shaped
  // wrapper rather than a blank null. If for any reason navigation fails,
  // user sees a tap-anywhere recovery prompt instead of a frozen screen.
  if (dismissed) {
    return React.createElement(
      View,
      {
        style: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        accessibilityRole: 'button',
        onTouchEnd: () => {
          try { router.replace('/(tabs)'); } catch {}
        },
      },
      React.createElement(Text, { style: { color: '#9ca3af', fontSize: 13 } }, 'Returning…'),
    );
  }

  return React.createElement(PaywallModal, {
    visible: true,
    feature,
    onDismiss: handleDismiss,
  });
};
