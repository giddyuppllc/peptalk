/**
 * creditPacks — PURE client-side catalog of AI credit packs.
 *
 * MIRRORS supabase/functions/_shared/credits.ts. The server is authoritative:
 * it decides what a SKU is worth and it is the only thing that can grant. This
 * copy exists so the app can render the shelf and know which purchase rail a
 * SKU belongs to, without a network round-trip.
 *
 * The two files are pinned together by src/lib/__tests__/creditPacks.test.ts.
 * Two hand-maintained copies of a money table is exactly how a $5 pack starts
 * granting $50 on one platform, so the test reads BOTH files rather than
 * trusting that whoever edits one remembers the other.
 *
 * Prices here are placeholders pending Edward; see the server file.
 */

/** A consumable purchase that tops up AI spend. */
export interface CreditPack {
  productId: string;
  /** Retail price in cents (USD) — fallback only; stores report the real,
   *  localized price and that is what gets displayed when available. */
  priceCents: number;
  /** AI spend granted, in cents. */
  creditCents: number;
  name: string;
}

export const CREDIT_PACK_IDS = {
  small: 'peptalk_credits_small',
  medium: 'peptalk_credits_medium',
  large: 'peptalk_credits_large',
} as const;

export type CreditPackId = (typeof CREDIT_PACK_IDS)[keyof typeof CREDIT_PACK_IDS];

export const CREDIT_PACKS: Record<string, CreditPack> = {
  peptalk_credits_small: {
    productId: 'peptalk_credits_small',
    priceCents: 499,
    creditCents: 300,
    name: 'AI Credits — Small',
  },
  peptalk_credits_medium: {
    productId: 'peptalk_credits_medium',
    priceCents: 999,
    creditCents: 700,
    name: 'AI Credits — Medium',
  },
  peptalk_credits_large: {
    productId: 'peptalk_credits_large',
    priceCents: 1999,
    creditCents: 1500,
    name: 'AI Credits — Large',
  },
};

/** Every credit-pack SKU, in display order (cheapest first). */
export const ALL_CREDIT_PACK_IDS: string[] = [
  CREDIT_PACK_IDS.small,
  CREDIT_PACK_IDS.medium,
  CREDIT_PACK_IDS.large,
];

/** Unknown → undefined. Never treat an unrecognised SKU as a zero-value pack. */
export function packForProduct(productId: string): CreditPack | undefined {
  return CREDIT_PACKS[productId];
}

/**
 * True if this SKU is a consumable credit pack.
 *
 * Used at the point that matters most: `finishTransaction` must be called with
 * `isConsumable: true` for these. On Android that is the difference between
 * CONSUMING the purchase and merely acknowledging it — an acknowledged
 * consumable stays "already owned" and the user can never buy that pack again.
 */
export function isCreditPack(productId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CREDIT_PACKS, productId);
}

/** "$4.99" from cents — fallback when the store has not given a real price. */
export function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}
