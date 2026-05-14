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

// Product IDs — must match App Store Connect / Play Console exactly.
//
// **Pricing policy:** monthly subscriptions only. Yearly plans are NOT
// part of the PepTalk product offering — decision made by Edward,
// 2026-05-09. No plans to ship yearly.
//
// The yearly ids remain in the PRODUCT_TO_TIER map purely as defensive
// resolution: if any legacy sandbox / TestFlight receipt for a yearly
// purchase ever surfaces (refunds, edge cases), it resolves to the
// right tier without crashing. They are omitted from ALL_PRODUCT_IDS
// so getProducts() never asks the store about a SKU that doesn't exist
// (iOS fails the whole batch if a single id is unknown, which would
// also break the working monthly SKUs).
export const PRODUCT_IDS = {
  plusMonthly: 'peptalk_plus_monthly',
  plusYearly: 'peptalk_plus_yearly',
  proMonthly: 'peptalk_pro_monthly',
  proYearly: 'peptalk_pro_yearly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

const ALL_PRODUCT_IDS: string[] = [
  PRODUCT_IDS.plusMonthly,
  PRODUCT_IDS.proMonthly,
  // Monthly-only for v1.9.x — see header comment.
];

// Map product ID → tier so the store knows which features to unlock.
// Keep yearly ids mapped so receipt validation still works the day
// we add yearly back, without a migration.
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

/** Google's PurchaseState enum value for pending (parental consent, SCA, slow
 *  wallet, etc.). iOS just queues these under the same transaction listener. */
const ANDROID_PENDING = 2;

/** Identity keys for purchases we're currently validating. Used so
 *  `restorePurchases` + `waitForPendingValidations` can cleanly block until
 *  background receipt validation has reconciled with the server. */
const pendingValidations = new Set<string>();
let idleResolvers: Array<() => void> = [];

function purchaseKey(purchase: any): string {
  return (
    purchase?.transactionId ??
    purchase?.purchaseToken ??
    purchase?.productId ??
    String(Date.now())
  );
}

function trackValidationStart(key: string) {
  pendingValidations.add(key);
}
function trackValidationEnd(key: string) {
  pendingValidations.delete(key);
  if (pendingValidations.size === 0 && idleResolvers.length > 0) {
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((r) => r());
  }
}

/** Resolves when all in-flight receipt validations have completed, or
 *  after `timeoutMs` regardless — callers should not block indefinitely. */
export function waitForPendingValidations(timeoutMs = 8_000): Promise<void> {
  if (pendingValidations.size === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    idleResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Retry finishTransaction with small exponential backoff. If we permanently
 *  can't finish, the receipt simply replays on next app launch — the user
 *  is already entitled (validation succeeded), we just want the store to
 *  clear the pending queue eventually. */
async function finishTransactionWithRetry(purchase: any, attempts = 3): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await IAP.finishTransaction({ purchase, isConsumable: false });
      return;
    } catch (err) {
      lastErr = err;
      if (__DEV__) {
        console.warn(`[iapService] finishTransaction attempt ${i + 1} failed:`, err);
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  if (__DEV__) {
    console.warn('[iapService] finishTransaction gave up after retries; receipt will replay on next boot:', lastErr);
  }
}

export interface InitIAPCallbacks {
  onPurchase: (receipt: { productId: string; transactionReceipt: string }) => Promise<void>;
  /** Fired when the store delivers a purchase that is still pending
   *  (Android parental consent / SCA, iOS "Ask to Buy"). Entitlement
   *  should NOT be granted yet — show a "Waiting for approval" UI. */
  onPending?: (info: { productId: string }) => void;
}

export async function initIAP(
  onPurchaseOrCallbacks:
    | InitIAPCallbacks['onPurchase']
    | InitIAPCallbacks,
): Promise<void> {
  if (!isAvailable() || initialized) return;
  const callbacks: InitIAPCallbacks =
    typeof onPurchaseOrCallbacks === 'function'
      ? { onPurchase: onPurchaseOrCallbacks }
      : onPurchaseOrCallbacks;

  try {
    await IAP.initConnection();
    initialized = true;

    // Listen for successful purchases (including pending + restored)
    purchaseListener = IAP.purchaseUpdatedListener(async (purchase: any) => {
      // Android pending state — parental consent, SCA, slow wallet.
      // Don't finish or validate yet; a follow-up update fires once it
      // clears. If we acknowledged now we'd lose the receipt forever.
      if (
        Platform.OS === 'android' &&
        purchase?.purchaseStateAndroid === ANDROID_PENDING
      ) {
        callbacks.onPending?.({ productId: purchase.productId });
        return;
      }

      const receipt = Platform.OS === 'ios'
        ? purchase.transactionReceipt
        : purchase.purchaseToken;
      if (!receipt) return;

      const key = purchaseKey(purchase);
      trackValidationStart(key);
      let validated = false;
      try {
        await callbacks.onPurchase({
          productId: purchase.productId,
          transactionReceipt: receipt,
        });
        validated = true;
      } catch (err) {
        if (__DEV__) console.warn('[iapService] Purchase validation failed:', err);
        // On validation failure, intentionally do NOT finish the
        // transaction. Leaving it un-acknowledged means the store will
        // replay the purchase on the next launch / restore so the user
        // can still get entitlement once the backend is healthy.
      } finally {
        trackValidationEnd(key);
      }

      if (validated) {
        // Separate retry loop so an intermittent finish failure doesn't
        // orphan the receipt and cause a duplicate charge flagged as
        // "already purchased" on the next restore.
        await finishTransactionWithRetry(purchase);
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
 *
 * `appAccountToken` is the user's Supabase id, passed to Apple so it
 * echoes back on every future Server Notification for this subscription.
 * That's the reliable way the apple-notifications webhook figures out
 * which user a renewal/refund event belongs to without having to match
 * giant opaque receipts. Android's lookup is token-based and doesn't
 * need this.
 *
 * Apple requires appAccountToken to be a UUID, which Supabase user ids
 * already are. If callers pass something non-UUID we silently drop it so
 * the purchase still goes through.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function purchaseProduct(
  productId: ProductId,
  options?: {
    appAccountToken?: string | null;
    /** Apple App Store Connect Offer Code identifier — when provided,
     *  StoreKit applies the discount Apple has linked to that code.
     *  Passed through from a redeemed referral_codes.apple_offer_code. */
    appleOfferCode?: string | null;
  },
): Promise<void> {
  if (!isAvailable()) {
    throw new Error('In-App Purchases not available on this platform.');
  }
  if (!initialized) {
    throw new Error('IAP not initialized. Call initIAP() first.');
  }

  const rawToken = options?.appAccountToken ?? null;
  const appAccountToken = rawToken && UUID_RE.test(rawToken) ? rawToken : undefined;
  const appleOfferCode = options?.appleOfferCode?.trim() || undefined;

  if (Platform.OS === 'ios') {
    await IAP.requestSubscription({
      sku: productId,
      ...(appAccountToken ? { appAccountToken } : {}),
      // The Apple offer code is applied via StoreKit's withOffer
      // identifier mechanism. react-native-iap exposes it as
      // `withOffer` (older) or via `discountIdentifier` (newer). We
      // pass both shapes so the call works across versions.
      ...(appleOfferCode
        ? {
            withOffer: { identifier: appleOfferCode, keyIdentifier: '', nonce: '', signature: '', timestamp: 0 },
            discountIdentifier: appleOfferCode,
          }
        : {}),
    } as any);
    return;
  }

  // Android: Play Billing Library v5+ requires a real offerToken taken from
  // `subscriptionOfferDetails`. Passing '' bypasses intro pricing and can
  // fail outright on newer devices, so fetch the offers and pick the first
  // (base plan). If fetch fails, fall back to '' which at least preserves
  // the prior behavior rather than breaking existing testers.
  let offerToken = '';
  try {
    const products = await IAP.getSubscriptions({ skus: [productId] });
    const android = products?.[0];
    offerToken = android?.subscriptionOfferDetails?.[0]?.offerToken ?? '';
    if (__DEV__ && !offerToken) {
      if (__DEV__) console.warn('[iapService] No subscriptionOfferDetails for', productId);
    }
  } catch (err) {
    if (__DEV__) console.warn('[iapService] Failed to fetch offers, falling back:', err);
  }
  // Android: `obfuscatedAccountIdAndroid` plays the same role Apple's
  // appAccountToken plays — it's echoed back on RTDN subscription
  // notifications so the webhook can map events to users without having
  // to index by purchaseToken.
  await IAP.requestSubscription({
    subscriptionOffers: [{ sku: productId, offerToken }],
    ...(appAccountToken ? { obfuscatedAccountIdAndroid: appAccountToken } : {}),
  });
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
