/**
 * creditPurchase — buying AI credit packs, on whichever rail this build uses.
 *
 * THREE RAILS, ONE ENTRY POINT
 *   web      → Square hosted checkout (square-checkout edge function)
 *   ios      → StoreKit consumable, validated by validate-purchase
 *   android  → Play one-time product, validated by validate-purchase
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * Apple and Google both require digital goods consumed inside the app to be
 * purchased through their own flow. Sending a native user to the Square link
 * is a guideline violation and a rejection risk, so the platform check happens
 * HERE, once, rather than being re-remembered at every call site.
 *
 * AVAILABILITY IS NOT ASSUMED
 * `listAvailablePacks()` reports what can actually be bought right now. On
 * native that means the store returned the SKU; until the products exist in
 * App Store Connect and Play Console it returns [] and the UI shows nothing.
 * A shelf of buy buttons that cannot complete a purchase is worse than an
 * absent shelf — it reads as a broken app rather than an unreleased feature.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { captureException } from './telemetry';
import {
  ALL_CREDIT_PACK_IDS,
  CREDIT_PACKS,
  formatCents,
  packForProduct,
  type CreditPack,
} from '../lib/creditPacks';
import { getCreditPackProducts, purchaseCreditPack } from './iapService';

/** A pack the user can actually buy, with the price to show for it. */
export interface PurchasablePack extends CreditPack {
  /** Store-localized price when available, else the catalog fallback. */
  displayPrice: string;
}

/**
 * Packs that can be bought on this platform right now.
 *
 * WEB: the catalog, because the Square link is created server-side on demand
 * and the edge function refuses cleanly (503) if Square is not configured.
 *
 * NATIVE: only SKUs the store actually returned. This is the honest check —
 * the store is the authority on what exists, and asking it is the difference
 * between "no packs yet" and "buy button that dead-ends".
 */
export async function listAvailablePacks(): Promise<PurchasablePack[]> {
  if (Platform.OS === 'web') {
    return ALL_CREDIT_PACK_IDS.map((id) => {
      const pack = CREDIT_PACKS[id];
      return { ...pack, displayPrice: formatCents(pack.priceCents) };
    });
  }

  try {
    const storeProducts = await getCreditPackProducts();
    const out: PurchasablePack[] = [];
    for (const id of ALL_CREDIT_PACK_IDS) {
      const pack = CREDIT_PACKS[id];
      const store = storeProducts.find((p) => p.productId === id);
      // Absent from the store => not purchasable => not shown.
      if (!store) continue;
      out.push({
        ...pack,
        // Prefer the store's price: it is localized, reflects the actual
        // charge, and is what the store requires be displayed.
        displayPrice: store.localizedPrice || store.price || formatCents(pack.priceCents),
      });
    }
    return out;
  } catch (err) {
    captureException(err, { source: 'creditPurchase.list' });
    return [];
  }
}

/**
 * Start a purchase for one pack.
 *
 * On web this navigates away to Square and never resolves meaningfully. On
 * native it hands off to StoreKit / Play Billing; the credits are granted by
 * `validate-purchase` when the purchase listener fires, NOT here. Callers must
 * therefore refresh the balance from the server rather than assuming a local
 * increment — the server is the only thing that knows a purchase completed.
 */
export async function buyCreditPack(productId: string): Promise<void> {
  const pack = packForProduct(productId);
  if (!pack) throw new Error(`Unknown credit pack: ${productId}`);

  if (Platform.OS === 'web') {
    const { data, error } = await supabase.functions.invoke('square-checkout', {
      body: { productId },
    });
    if (error) throw new Error(error.message ?? 'Could not start checkout.');
    const url = (data as { url?: string } | null)?.url;
    if (!url) throw new Error('Square did not return a checkout URL.');
    if (typeof window !== 'undefined') window.location.assign(url);
    return;
  }

  // Native: the platform's own purchase flow, never the web link.
  await purchaseCreditPack(productId);
}
