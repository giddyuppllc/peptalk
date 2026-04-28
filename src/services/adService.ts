/**
 * AdMob Integration Service for PepTalk
 *
 * Manages Google Mobile Ads SDK initialization and ad unit configuration.
 *
 * HEALTH APP COMPLIANCE NOTES:
 * ----------------------------
 * - Health data MUST NOT be used for ad targeting (HIPAA / Apple Health policy).
 * - Block health-sensitive ad categories in your AdMob dashboard.
 * - Non-personalized ads are requested by default to stay compliant.
 * - Never pass user health metrics to the ads SDK.
 *
 * NOTE: Uses dynamic require() so the app works safely in Expo Go where the
 * native module is not available. Ads only render in a development/production
 * build made via EAS Build.
 */

// ---------------------------------------------------------------------------
// Dynamic module loading — safe for Expo Go
// ---------------------------------------------------------------------------

const mobileAdsModule: any = null;
const TestIdsRef: any = {};
const MaxAdContentRatingRef: any = {};

// NOTE: react-native-google-mobile-ads is NOT installed yet.
// Metro resolves require() at bundle time even inside try/catch.
// Install the package and uncomment below when ready for ads.
//
// try {
//   const mod = require('react-native-google-mobile-ads');
//   mobileAdsModule = mod.default ?? mod;
//   TestIdsRef = mod.TestIds ?? {};
//   MaxAdContentRatingRef = mod.MaxAdContentRating ?? {};
// } catch {}

// ---------------------------------------------------------------------------
// Ad Unit IDs
// ---------------------------------------------------------------------------
//
// LAUNCH FLAG: ads are disabled in production until real AdMob unit IDs
// are issued. Until then we hard-disable to avoid serving placeholder IDs
// that 404 + risk getting flagged for invalid traffic. Flip ADS_ENABLED
// to true and replace the XXXX placeholders once real units exist.

export const ADS_ENABLED: boolean = __DEV__; // dev-only until real units exist

export const BANNER_AD_UNIT: string = __DEV__
  ? (TestIdsRef.BANNER ?? 'ca-app-pub-test/banner')
  : 'ca-app-pub-XXXX/YYYY';

export const INTERSTITIAL_AD_UNIT: string = __DEV__
  ? (TestIdsRef.INTERSTITIAL ?? 'ca-app-pub-test/interstitial')
  : 'ca-app-pub-XXXX/ZZZZ';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let adsInitialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the native ads module was loaded successfully.
 */
export function isAdModuleAvailable(): boolean {
  return mobileAdsModule != null;
}

/**
 * Initialize the Mobile Ads SDK.
 * No-ops gracefully if the native module isn't available (Expo Go).
 */
export async function initializeAds(): Promise<void> {
  if (!ADS_ENABLED) return; // hard-disabled in production until real units exist
  if (adsInitialized || !mobileAdsModule) return;

  try {
    await mobileAdsModule().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRatingRef.T,
      tagForUnderAgeOfConsent: false,
      tagForChildDirectedTreatment: false,
    });

    await mobileAdsModule().initialize();

    adsInitialized = true;
    console.log('[AdService] Mobile Ads SDK initialized successfully');
  } catch (error) {
    console.warn('[AdService] Failed to initialize Mobile Ads SDK:', error);
  }
}

/**
 * Check whether the ads SDK has been initialized.
 */
export function isAdReady(): boolean {
  return adsInitialized;
}
