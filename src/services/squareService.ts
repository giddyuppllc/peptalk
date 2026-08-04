/**
 * Square web checkout (PWA ONLY).
 *
 * Native iOS/Android purchases go through IAP (iapService.ts) — this module is
 * only invoked on Platform.OS === 'web', where react-native-iap is unavailable.
 * It asks the `square-checkout` edge function (server-side, holds the Square
 * access token) for a Square-hosted checkout URL, then redirects the browser.
 *
 * Entitlement is granted asynchronously: after payment, Square calls the
 * `square-webhook` edge function, which writes a `platform:'web'` row into
 * `subscriptions`. useSubscriptionStore reads that row source-agnostically, so
 * the tier reflects on the next sync — same path as an IAP sub.
 */
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * RECURRING path: start a Square auto-renew subscription with a tokenized card
 * (the card token comes from the Web Payments SDK in SquareCardForm.web.tsx).
 * The edge function creates the Square Customer + card-on-file + Subscription and
 * grants the tier; square-webhook keeps it renewed. Returns the tier on success.
 */
export async function subscribeWithCardToken(opts: {
  productId: string;
  cardToken: string;
}): Promise<{ tier: string }> {
  if (Platform.OS !== 'web') throw new Error('Square subscribe is web-only; native uses IAP.');
  const { data, error } = await supabase.functions.invoke('square-subscribe', {
    body: { productId: opts.productId, cardToken: opts.cardToken },
  });
  if (error) throw new Error(error.message ?? 'Subscription could not be started.');
  const res = data as { ok?: boolean; tier?: string; error?: string } | null;
  if (!res?.ok) throw new Error(res?.error ?? 'Subscription failed.');
  return { tier: res.tier ?? '' };
}

/**
 * One-time / hosted-checkout fallback (kept for reference; the recurring path
 * above is now the default web flow).
 */
export async function startSquareCheckout(opts: {
  productId: string;
  tier: string;
}): Promise<void> {
  if (Platform.OS !== 'web') {
    // Guard: never reachable on native (the caller gates on Platform.OS), but
    // makes the web-only contract explicit.
    throw new Error('Square checkout is web-only; native uses IAP.');
  }

  // The edge function reads the authenticated user from the JWT (like
  // validate-purchase), so we only send the product being purchased.
  const { data, error } = await supabase.functions.invoke('square-checkout', {
    body: { productId: opts.productId },
  });
  if (error) throw new Error(error.message ?? 'Could not start checkout.');

  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('Square did not return a checkout URL.');

  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
}
