/**
 * AdBanner — Reusable banner ad component for PepTalk.
 *
 * Renders a Google Mobile Ads banner that blends with the dark glass UI.
 * Gracefully renders nothing when the native module isn't available (Expo Go)
 * or when an ad fails to load.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { BANNER_AD_UNIT, isAdModuleAvailable } from '../services/adService';
import { Colors } from '../constants/theme';
import { useSubscriptionStore } from '../store/useSubscriptionStore';

// ---------------------------------------------------------------------------
// Dynamic module loading — safe for Expo Go
// ---------------------------------------------------------------------------

const BannerAd: any = null;
const BannerAdSize: any = {};

// NOTE: react-native-google-mobile-ads is NOT installed yet.
// Metro resolves require() at bundle time even inside try/catch.
// Install the package and uncomment below when ready for ads.
//
// try {
//   const mod = require('react-native-google-mobile-ads');
//   BannerAd = mod.BannerAd;
//   BannerAdSize = mod.BannerAdSize ?? {};
// } catch {}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdBannerProps {
  /** Optional style overrides for the outer container View. */
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdBanner({ style }: AdBannerProps) {
  const tier = useSubscriptionStore((s) => s.tier);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);

  // No ads for paid users
  if (tier !== 'free') {
    return null;
  }

  // Don't render if native module unavailable, on web, or ad failed
  if (!isAdModuleAvailable() || !BannerAd || Platform.OS === 'web' || adFailed) {
    return null;
  }

  return (
    <View style={[styles.container, !adLoaded && styles.hidden, style]}>
      <BannerAd
        unitId={BANNER_AD_UNIT}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER ?? 'BANNER'}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setAdLoaded(true);
          setAdFailed(false);
        }}
        onAdFailedToLoad={(error: any) => {
          if (__DEV__) console.warn('[AdBanner] Ad failed to load:', error?.message);
          setAdFailed(true);
          setAdLoaded(false);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.darkBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.darkCardBorder,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  hidden: {
    opacity: 0,
    height: 0,
    overflow: 'hidden',
  },
});
