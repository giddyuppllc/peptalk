/**
 * Remembering a credit purchase across the Square redirect.
 *
 * THE PROBLEM
 * Buying a credit pack on the web leaves the app entirely: the buyer goes to a
 * Square-hosted page, pays, and is redirected back. Two things are true when
 * they land:
 *
 *   1. The page has fully reloaded, so any in-memory state is gone.
 *   2. The credits may not have arrived yet. Square redirects the browser as
 *      soon as the payment completes, while the webhook that actually grants
 *      the credit is a separate call that lands a moment later.
 *
 * So a buyer can very reasonably arrive back at the app, look at their
 * balance, and see the number they had before they paid. Without something
 * here that is indistinguishable from "my money vanished" — which is a support
 * ticket, and a fair one.
 *
 * WHAT THIS DOES
 * Records the balance as it stood immediately BEFORE leaving for Square, so
 * that on return the app can wait for it to actually move rather than
 * guessing. Waiting for a known-before value is the only honest test: without
 * it "the balance is 300" cannot be told apart from "the balance was already
 * 300".
 *
 * sessionStorage rather than localStorage: this is meaningful for exactly one
 * round trip, and it should not outlive the tab. Every access is wrapped —
 * private-mode browsers throw on access rather than returning null.
 */

const KEY = 'peptalk.pendingCreditPurchase';

/** How long a pending record stays meaningful. */
const STALE_MS = 30 * 60 * 1000;

export interface PendingCreditPurchase {
  productId: string;
  /**
   * Balance in cents immediately before redirecting, or null if it could not
   * be read. Null means "cannot prove an increase" and callers must not claim
   * one — they can only report the balance as it now stands.
   */
  balanceBeforeCents: number | null;
  startedAt: number;
}

export function rememberCreditPurchase(
  productId: string,
  balanceBeforeCents: number | null,
  now: number = Date.now(),
): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ productId, balanceBeforeCents, startedAt: now }),
    );
  } catch {
    // Storage unavailable. The purchase still works; the buyer just gets the
    // ordinary view instead of the confirming state.
  }
}

export function readPendingCreditPurchase(
  now: number = Date.now(),
): PendingCreditPurchase | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingCreditPurchase>;
    if (typeof parsed?.productId !== 'string' || typeof parsed?.startedAt !== 'number') {
      return null;
    }
    // A record from an abandoned attempt half an hour ago should not put the
    // screen into a confirming state today.
    if (now - parsed.startedAt > STALE_MS) {
      clearPendingCreditPurchase();
      return null;
    }
    return {
      productId: parsed.productId,
      balanceBeforeCents:
        typeof parsed.balanceBeforeCents === 'number' ? parsed.balanceBeforeCents : null,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingCreditPurchase(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True when the current URL is a post-checkout return from Square. */
export function isCheckoutReturn(): boolean {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    return new URLSearchParams(window.location.search).get('checkout') === 'success';
  } catch {
    return false;
  }
}

/**
 * Has the balance actually moved?
 *
 * Returns false when the previous balance is unknown — an unprovable increase
 * must never be reported as a confirmed one.
 */
export function balanceIncreased(
  pending: PendingCreditPurchase,
  currentCents: number | null,
): boolean {
  if (currentCents === null) return false;
  if (pending.balanceBeforeCents === null) return false;
  return currentCents > pending.balanceBeforeCents;
}
