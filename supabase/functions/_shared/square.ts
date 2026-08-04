/**
 * square (shared) — PURE, dependency-free helpers for the Square web-payment
 * edge functions (square-webhook / square-checkout / square-subscribe).
 *
 * SECURITY-CRITICAL. These functions decide (a) whether a webhook signature is
 * authentic (constant-time compare — a data-dependent early return would leak
 * the expected signature via response timing) and (b) which tier/amount a paid
 * order grants. They are extracted here — with NO Deno / network imports — so
 * they can be unit-tested from the jest suite. The edge functions import these
 * exact implementations; behaviour is identical to the inline versions they
 * replaced.
 */

/** Product catalog for Square WEB subscriptions. Must mirror
 *  src/lib/products.ts PRODUCT_TO_TIER + the displayed prices. */
export interface SquarePlan {
  tier: 'plus' | 'pro';
  /** Charge amount in cents (USD). */
  amountCents: number;
  /** Human-readable name shown on the Square checkout. */
  name: string;
  /** Name of the Supabase env var holding the Catalog plan-variation id. */
  planEnv: string;
}

export const SQUARE_PLANS: Record<string, SquarePlan> = {
  peptalk_plus_monthly: {
    tier: 'plus',
    amountCents: 999,
    name: 'PepTalk+ (Monthly)',
    planEnv: 'SQUARE_PLAN_PLUS_MONTHLY',
  },
  peptalk_pro_monthly: {
    tier: 'pro',
    amountCents: 4999,
    name: 'PepTalk Pro (Monthly)',
    planEnv: 'SQUARE_PLAN_PRO_MONTHLY',
  },
};

/** Resolve a product id to its Square plan, or `undefined` if unknown. Unknown
 *  → undefined is the security contract: never charge/grant for an unknown SKU. */
export function planForProduct(productId: string): SquarePlan | undefined {
  return SQUARE_PLANS[productId];
}

/**
 * Constant-time string compare — avoids leaking the signature via response
 * timing. Returns false immediately on a length mismatch (length is not
 * secret); otherwise XOR-accumulates every char so the loop runs in time
 * proportional to length regardless of where the first difference is.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface ParsedRef {
  userId: string;
  tier: string;
  productId: string;
}

/**
 * Parse the reference_id we set in square-checkout: "<userId>:<tier>:<productId>".
 * Returns null for a missing ref, an empty userId, or a tier that isn't
 * exactly 'plus' or 'pro' (rejects tampered / malformed refs). A missing
 * productId segment defaults to `peptalk_<tier>_monthly`.
 */
export function parseRef(ref: string | undefined | null): ParsedRef | null {
  if (!ref) return null;
  const [userId, tier, productId] = ref.split(':');
  if (!userId || (tier !== 'plus' && tier !== 'pro')) return null;
  return { userId, tier, productId: productId ?? `peptalk_${tier}_monthly` };
}
