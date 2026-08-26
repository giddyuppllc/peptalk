/**
 * credits (shared) — the AI credit-pack catalog, PURE and dependency-free.
 *
 * WHAT A CREDIT IS
 * One unit of AI spend, denominated in microcents (1 cent = 1,000,000 mc),
 * the same unit `aimee-chat-stream/_cost.ts` already records spend in. A pack
 * therefore tops up the exact quantity the cost gate measures — there is no
 * second currency and no conversion to drift.
 *
 * WHY THE CATALOG IS SHARED
 * The same pack is sold on three rails: Apple consumable IAP, Google one-time
 * product, and a Square payment link on the web. Each rail has its own
 * verification path, but all three must agree on what a given SKU is worth. A
 * per-rail copy of that table is how a $5 pack ends up granting $50 on one
 * platform, so there is exactly one table and every rail reads it.
 *
 * ONE PACK, $4.99.
 * Edward's call, 2026-08-26: a single pack is all this needs, rather than a
 * small/medium/large ladder nobody asked for.
 *
 * `creditCents` (300 = $3.00 of AI spend) is the remaining number he has not
 * pinned. At roughly $0.0008 a turn that is about 3,750 turns, and it matches
 * the AI allowance included in a month of Plus — so a top-up buys about the
 * same amount of Aimee that the subscription itself does. Change the one line
 * below if that ratio is wrong; a test fails if the two catalogs disagree.
 *
 * PLATFORM RULE (not stylistic — a review-rejection risk)
 * On iOS and Android, credits MUST be sold through the platform's own purchase
 * flow. The Square path is web-only and the native app must never link out to
 * it. `isWebOnlyRail()` states that invariant in code.
 */

export interface CreditPack {
  /** SKU. Identical string in App Store Connect, Play Console and our refs. */
  productId: string;
  /** Retail price in cents (USD). ⚠️ placeholder — Edward sets this. */
  priceCents: number;
  /** AI spend granted, in cents. ⚠️ placeholder — Edward sets this. */
  creditCents: number;
  /** Shown on the Square checkout and in the app. */
  name: string;
}

/** 1 cent = 1,000,000 microcents. Mirrors MC_PER_CENT in _cost.ts. */
export const MC_PER_CENT = 1_000_000;

export const CREDIT_PACKS: Record<string, CreditPack> = {
  peptalk_credits: {
    productId: 'peptalk_credits',
    priceCents: 499,
    creditCents: 300,
    name: 'AI Credits',
  },
};

/**
 * Resolve a SKU to its pack, or undefined.
 *
 * Unknown → undefined is the security contract, exactly as `planForProduct`
 * has it: never grant for a SKU we do not recognise. Every caller must treat
 * undefined as a refusal, not as a zero-value grant.
 */
export function packForProduct(productId: string): CreditPack | undefined {
  return CREDIT_PACKS[productId];
}

/** True if this SKU is a credit pack rather than a subscription. */
export function isCreditPack(productId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CREDIT_PACKS, productId);
}

/** Microcents a pack grants. 0 for an unrecognised SKU. */
export function creditsForProduct(productId: string): number {
  const pack = packForProduct(productId);
  return pack ? pack.creditCents * MC_PER_CENT : 0;
}

/**
 * Square sells credit packs on the WEB ONLY.
 *
 * Apple and Google both require digital goods consumed in the app to be bought
 * through their own purchase flow. Routing a native user to a Square link is a
 * guideline violation, and it is the kind that gets found — so the rule lives
 * here as a function rather than as a comment somewhere in the UI.
 */
export function isWebOnlyRail(rail: string): boolean {
  return rail === 'square';
}

/**
 * Reference string for a Square credit-pack payment link.
 *
 * Deliberately a DIFFERENT shape from the subscription ref
 * ("<userId>:<tier>:<productId>"), whose parser requires segment 2 to be
 * exactly 'plus' or 'pro'. Sharing that shape would mean one malformed parse
 * away from a credit purchase granting a subscription tier.
 */
export function buildCreditRef(userId: string, productId: string): string {
  return `${userId}:credits:${productId}`;
}

export interface ParsedCreditRef {
  userId: string;
  productId: string;
  microcents: number;
}

/**
 * Parse a credit-pack reference. Returns null unless the ref is well-formed
 * AND names a SKU in the catalog — an unknown SKU is a refusal, never a
 * zero-credit grant that silently swallows a real payment.
 */
export function parseCreditRef(
  ref: string | undefined | null,
): ParsedCreditRef | null {
  if (!ref) return null;
  const parts = ref.split(':');
  if (parts.length < 3) return null;
  const [userId, marker, productId] = parts;
  if (!userId || marker !== 'credits') return null;
  const pack = packForProduct(productId);
  if (!pack) return null;
  return {
    userId,
    productId,
    microcents: pack.creditCents * MC_PER_CENT,
  };
}
