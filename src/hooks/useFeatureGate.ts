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

  // When the paywall is dismissed (Maybe Later), navigate AWAY
  // immediately. The modal close animation plays on top of the new
  // screen. Earlier code deferred navigation inside
  // requestAnimationFrame which produced a "blank page → force quit"
  // bug in TestFlight (recipe-generator → Maybe Later → stuck on the
  // gate's fallback render until the user killed the app).
  //
  // We still keep `dismissed` as a fallback state in case navigation
  // is slow or fails — the user sees a tappable "Tap to continue"
  // surface, not a frozen blank.
  const handleDismiss = useCallback(() => {
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch {
      try { router.replace('/(tabs)'); } catch {}
    }
    setDismissed(true);
  }, []);

  if (hasAccess) {
    return React.createElement(React.Fragment, null, children);
  }

  // After dismiss the navigation should already be in flight — but if
  // anything went sideways the user sees a tappable "Tap to continue"
  // surface instead of a frozen screen. Tapping forces home.
  if (dismissed) {
    return React.createElement(
      View,
      {
        style: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
        accessibilityRole: 'button',
        accessibilityLabel: 'Tap to return home',
        onTouchEnd: () => {
          try { router.replace('/(tabs)'); } catch {}
        },
      },
      React.createElement(
        Text,
        { style: { color: '#6B7280', fontSize: 14, textAlign: 'center' } },
        'Tap anywhere to return',
      ),
    );
  }

  return React.createElement(PaywallModal, {
    visible: true,
    feature,
    onDismiss: handleDismiss,
  });
};
