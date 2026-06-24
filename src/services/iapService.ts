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
import { captureException } from './telemetry';

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
let idleResolvers: (() => void)[] = [];

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

// Module-scope holder so non-listener entry points (e.g. restorePurchases)
// can call the same validator. Set inside initIAP() when the host wires up
// the listener. Never read before initIAP runs; guarded by isAvailable +
// initialized everywhere it matters.
let callbacks: InitIAPCallbacks | null = null;

export async function initIAP(
  onPurchaseOrCallbacks:
    | InitIAPCallbacks['onPurchase']
    | InitIAPCallbacks,
): Promise<void> {
  if (!isAvailable() || initialized) return;
  callbacks =
    typeof onPurchaseOrCallbacks === 'function'
      ? { onPurchase: onPurchaseOrCallbacks }
      : onPurchaseOrCallbacks;

  try {
    await IAP.initConnection();
    initialized = true;

    // Listen for successful purchases (including pending + restored)
    purchaseListener = IAP.purchaseUpdatedListener(async (purchase: any) => {
      // Capture into a local so TS narrows across awaits below.
      const cb = callbacks;
      if (!cb) return;
      // Android pending state — parental consent, SCA, slow wallet.
      // Don't finish or validate yet; a follow-up update fires once it
      // clears. If we acknowledged now we'd lose the receipt forever.
      if (
        Platform.OS === 'android' &&
        purchase?.purchaseStateAndroid === ANDROID_PENDING
      ) {
        cb.onPending?.({ productId: purchase.productId });
        return;
      }

      // v15 delivers a unified token: iOS JWS / Android purchaseToken.
      const receipt = purchase.purchaseToken;
      if (!receipt) return;

      const key = purchaseKey(purchase);
      trackValidationStart(key);
      let validated = false;
      try {
        await cb.onPurchase({
          productId: purchase.productId,
          transactionReceipt: receipt,
        });
        validated = true;
      } catch (err) {
        if (__DEV__) console.warn('[iapService] Purchase validation failed:', err);
        // Money path — ops needs visibility on these. The user has
        // paid Apple/Google but our validate-purchase didn't grant
        // entitlement, which generates a refund-request support ticket.
        captureException(err, {
          source: 'iap.validate',
          productId: purchase.productId,
        });
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
      // 2026-05-17 P1 fix: previously dropped silently. User-cancelled
      // is normal flow — skip those. Everything else is a money-path
      // failure worth surfacing to Sentry so support can correlate
      // "I bought Pro but the app didn't unlock" reports with the
      // underlying storekit failure mode.
      const code = error?.code ?? error?.errorCode;
      const isUserCancel =
        code === 'E_USER_CANCELLED' ||
        code === 'E_USER_CANCELED' ||
        /cancel/i.test(error?.message ?? '');
      if (!isUserCancel) {
        captureException(error, {
          source: 'iap.purchase_error',
          code: code ?? 'unknown',
        });
      }
    });
  } catch (err) {
    if (__DEV__) console.warn('[iapService] initConnection failed:', err);
    captureException(err, { source: 'iap.init' });
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
    // v15: fetchProducts replaces getSubscriptions. type 'subs' = the
    // auto-renewing subscriptions PepTalk sells. Product id/price field
    // names changed: productId -> id, localizedPrice -> displayPrice.
    const products = await IAP.fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' });
    return (products ?? []).map((p: any) => ({
      productId: p.id ?? p.productId,
      title: p.title ?? p.displayName ?? p.id,
      description: p.description ?? '',
      price: p.displayPrice ?? `${p.currency ?? ''} ${p.price ?? ''}`.trim(),
      localizedPrice: p.displayPrice ?? '',
      currency: p.currency ?? 'USD',
      subscriptionPeriod: undefined,
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
    // v15: requestSubscription -> requestPurchase({ request:{ ios:{...} }, type:'subs' }).
    // NOTE: the old `withOffer` path passed empty signature fields, so the
    // promotional offer-code discount was never actually applied by StoreKit.
    // Offer codes need a server-signed offer (keyId/nonce/signature) — tracked
    // separately; appleOfferCode is accepted but intentionally not applied here
    // rather than sending a malformed offer that StoreKit would reject.
    void appleOfferCode;
    await IAP.requestPurchase({
      request: {
        ios: {
          sku: productId,
          ...(appAccountToken ? { appAccountToken } : {}),
        },
      },
      type: 'subs',
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
    const products = await IAP.fetchProducts({ skus: [productId], type: 'subs' });
    const android = products?.[0];
    offerToken =
      android?.subscriptionOfferDetailsAndroid?.[0]?.offerToken ??
      android?.subscriptionOfferDetails?.[0]?.offerToken ??
      '';
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
  await IAP.requestPurchase({
    request: {
      android: {
        skus: [productId],
        subscriptionOffers: [{ sku: productId, offerToken }],
        ...(appAccountToken ? { obfuscatedAccountIdAndroid: appAccountToken } : {}),
      },
    },
    type: 'subs',
  } as any);
}

/**
 * Restores any previous purchases (for users switching devices or
 * reinstalling).
 *
 * react-native-iap's getAvailablePurchases() returns past entitlements
 * but does NOT reliably re-fire purchaseUpdatedListener on iOS — so we
 * cannot rely on the listener path alone to re-validate receipts on
 * restore. A paying user reinstalling on a fresh Supabase account
 * (e.g. their old account was deleted, or they signed up with a new
 * email) would otherwise land on Free tier with their original
 * purchase orphaned. P0 fix from Wave 76.7 audit.
 *
 * Now: iterate every returned purchase and explicitly call
 * callbacks.onPurchase (which hits the validate-purchase edge fn,
 * which is idempotent on originalTransactionId). Returns the count of
 * SUCCESSFULLY validated receipts so the UI can say "Restored N
 * purchases" honestly.
 */
export async function restorePurchases(): Promise<number> {
  if (!isAvailable() || !initialized || !callbacks) return 0;
  // Capture into a local so TS narrows the nullability across the await
  // boundary inside the loop.
  const cb = callbacks;
  try {
    const purchases: any[] = await IAP.getAvailablePurchases();
    if (!Array.isArray(purchases) || purchases.length === 0) return 0;

    let validated = 0;
    for (const purchase of purchases) {
      const receipt = purchase.purchaseToken; // v15 unified token (iOS JWS / Android)
      if (!receipt || !purchase.productId) continue;

      const key = purchaseKey(purchase);
      trackValidationStart(key);
      try {
        await cb.onPurchase({
          productId: purchase.productId,
          transactionReceipt: receipt,
        });
        validated += 1;
      } catch (err) {
        if (__DEV__) {
          console.warn(
            '[iapService] restorePurchases: validation failed for',
            purchase.productId,
            err,
          );
        }
        // Don't finishTransaction on validation failure — same
        // contract as the live listener. The store can replay later.
      } finally {
        trackValidationEnd(key);
      }
    }
    return validated;
  } catch (err) {
    if (__DEV__) console.warn('[iapService] restorePurchases failed:', err);
    captureException(err, { source: 'iap.restore' });
    return 0;
  }
}
