/**
 * IAP Service — native In-App Purchase integration for iOS and Android.
 *
 * Uses react-native-iap for the store transaction, then hands the receipt
 * to the `validate-purchase` Supabase edge function which verifies with
 * Apple/Google and updates the user's subscription tier in the DB.
 *
 * Flow:
 *   1. initIAP() at app boot
 *   2. getProducts() to fetch App Store Connect prices
 *   3. purchaseProduct(productId) when user taps Upgrade
 *   4. validateReceipt() is triggered automatically by purchaseUpdatedListener
 *   5. restorePurchases() on demand
 */

import { Platform } from 'react-native';
import type { SubscriptionTier } from '../types/fitness';

// Product IDs — must match App Store Connect / Play Console exactly
export const PRODUCT_IDS = {
  plusMonthly: 'peptalk_plus_monthly',
  plusYearly: 'peptalk_plus_yearly',
  proMonthly: 'peptalk_pro_monthly',
  proYearly: 'peptalk_pro_yearly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

// Map product ID → tier so the store knows which features to unlock
export const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [PRODUCT_IDS.plusMonthly]: 'plus',
  [PRODUCT_IDS.plusYearly]: 'plus',
  [PRODUCT_IDS.proMonthly]: 'pro',
  [PRODUCT_IDS.proYearly]: 'pro',
};

// ---------------------------------------------------------------------------
// Dynamic module loading — works in Expo Go (where react-native-iap is unavailable)
// ---------------------------------------------------------------------------

let IAP: any = null;
try {
  IAP = require('react-native-iap');
} catch {
  // Expo Go / web: IAP unavailable, all calls no-op
}

function isAvailable(): boolean {
  return IAP != null;
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

let initialized = false;
let purchaseListener: any = null;
let errorListener: any = null;

export async function initIAP(
  onPurchase: (receipt: { productId: string; transactionReceipt: string }) => Promise<void>,
): Promise<void> {
  if (!isAvailable() || initialized) return;
  try {
    await IAP.initConnection();
    initialized = true;

    // Listen for successful purchases (including pending + restored)
    purchaseListener = IAP.purchaseUpdatedListener(async (purchase: any) => {
      const receipt = Platform.OS === 'ios'
        ? purchase.transactionReceipt
        : purchase.purchaseToken;
      if (!receipt) return;

      try {
        await onPurchase({
          productId: purchase.productId,
          transactionReceipt: receipt,
        });
        // Finalize the transaction once backend has validated
        await IAP.finishTransaction({ purchase, isConsumable: false });
      } catch (err) {
        if (__DEV__) console.warn('[iapService] Purchase validation failed:', err);
      }
    });

    errorListener = IAP.purchaseErrorListener((error: any) => {
      if (__DEV__) console.warn('[iapService] Purchase error:', error);
    });
  } catch (err) {
    if (__DEV__) console.warn('[iapService] initConnection failed:', err);
  }
}

export async function endIAP(): Promise<void> {
  if (!isAvailable()) return;
  try {
    purchaseListener?.remove();
    errorListener?.remove();
    await IAP.endConnection();
    initialized = false;
  } catch {}
}

// ---------------------------------------------------------------------------
// Product fetching
// ---------------------------------------------------------------------------

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;              // e.g. "$9.99"
  localizedPrice: string;
  currency: string;
  subscriptionPeriod?: string; // e.g. "P1M", "P1Y"
}

export async function getProducts(): Promise<IAPProduct[]> {
  if (!isAvailable()) return [];
  try {
    // getSubscriptions is for recurring products (what PepTalk uses)
    const products = await IAP.getSubscriptions({ skus: ALL_PRODUCT_IDS });
    return products.map((p: any) => ({
      productId: p.productId,
      title: p.title ?? p.productId,
      description: p.description ?? '',
      price: p.localizedPrice ?? `${p.currency} ${p.price}`,
      localizedPrice: p.localizedPrice ?? '',
      currency: p.currency ?? 'USD',
      subscriptionPeriod: p.subscriptionPeriodAndroid ?? p.subscriptionPeriodUnitIOS,
    }));
  } catch (err) {
    if (__DEV__) console.warn('[iapService] getProducts failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Purchase flow
// ---------------------------------------------------------------------------

/**
 * Triggers the native purchase sheet. Successful purchases land in
 * the purchaseUpdatedListener registered via initIAP().
 */
export async function purchaseProduct(productId: ProductId): Promise<void> {
  if (!isAvailable()) {
    throw new Error('In-App Purchases not available on this platform.');
  }
  if (!initialized) {
    throw new Error('IAP not initialized. Call initIAP() first.');
  }

  if (Platform.OS === 'ios') {
    await IAP.requestSubscription({ sku: productId });
  } else {
    await IAP.requestSubscription({
      subscriptionOffers: [{ sku: productId, offerToken: '' }],
    });
  }
}

/**
 * Restores any previous purchases (for users switching devices or
 * reinstalling). Triggers purchaseUpdatedListener for each.
 */
export async function restorePurchases(): Promise<number> {
  if (!isAvailable() || !initialized) return 0;
  try {
    const purchases = await IAP.getAvailablePurchases();
    return purchases.length;
  } catch (err) {
    if (__DEV__) console.warn('[iapService] restorePurchases failed:', err);
    return 0;
  }
}
