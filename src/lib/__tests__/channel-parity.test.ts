/**
 * Cross-channel parity — Apple IAP · Google Play · PWA (Square).
 *
 * One product catalog serves all three channels. `peptalk_plus_monthly` and
 * `peptalk_pro_monthly` are simultaneously the StoreKit product id, the Play
 * SKU, and the key into the Square plan catalog. That shared identity is what
 * keeps the channels from conflicting — and it means a change on any one side
 * silently breaks the others.
 *
 * The existing suites cover each side in isolation: products.test.ts checks SKU
 * → tier, entitlement.test.ts checks the expiry maths, square.test.ts checks
 * HMAC and reference parsing. Nothing checked that the sides AGREE. These are
 * the failures that gap allows:
 *
 *   - a SKU offered on the paywall with no Square plan → the PWA takes a card
 *     token and the edge function 400s on an unknown product
 *   - a price in the paywall UI that differs from the amount Square charges →
 *     the user is billed something other than what they were shown
 *   - a Square plan whose tier is not a real entitlement tier → payment
 *     succeeds and grants nothing
 *   - Square reaching a native build → App Store guideline 3.1.1 rejection
 *
 * None of these throw at build time. All of them only surface to a paying user.
 */

import { PRODUCT_IDS, ALL_PRODUCT_IDS, PRODUCT_TO_TIER } from '../products';
import { SQUARE_PLANS, planForProduct } from '../../../supabase/functions/_shared/square';

/** Prices exactly as rendered on the paywall in app/subscription.tsx. */
const PAYWALL_PRICES: Record<string, string> = {
  [PRODUCT_IDS.plusMonthly]: '$9.99',
  [PRODUCT_IDS.proMonthly]: '$49.99',
};

const centsToPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

describe('catalog identity is shared across Apple, Google and the PWA', () => {
  it('every SKU offered to the stores can also be sold on the PWA', () => {
    // ALL_PRODUCT_IDS is what iOS/Android query StoreKit/Play for. If the PWA
    // cannot sell one of them, a web user sees a plan they can never buy.
    for (const productId of ALL_PRODUCT_IDS) {
      expect(SQUARE_PLANS[productId]).toBeDefined();
    }
  });

  it('every Square plan maps to a real entitlement tier', () => {
    // Otherwise Square charges the card, the webhook writes a tier nothing
    // recognises, and the user pays for no access.
    for (const [productId, plan] of Object.entries(SQUARE_PLANS)) {
      expect(PRODUCT_TO_TIER[productId]).toBe(plan.tier);
    }
  });

  it('Square charges exactly what the paywall displays', () => {
    // A mismatch here bills a real card an amount the user never agreed to.
    for (const [productId, shown] of Object.entries(PAYWALL_PRICES)) {
      const plan = SQUARE_PLANS[productId];
      expect(plan).toBeDefined();
      expect(centsToPrice(plan.amountCents)).toBe(shown);
    }
  });

  it('every Square plan names the env var holding its plan-variation id', () => {
    // square-subscribe reads Deno.env.get(plan.planEnv) to find the Square
    // Catalog variation. An empty or mistyped name fails only at purchase time.
    for (const plan of Object.values(SQUARE_PLANS)) {
      expect(plan.planEnv).toMatch(/^SQUARE_PLAN_[A-Z_]+$/);
    }
  });

  it('the Square catalog stays monthly-only, like the stores', () => {
    // Monthly-only is a standing product decision, already enforced for the
    // stores in products.test.ts. Enforce it on the web side too, so the PWA
    // can never become the channel that quietly introduces an annual plan.
    for (const productId of Object.keys(SQUARE_PLANS)) {
      expect(productId).toMatch(/_monthly$/);
      expect(productId).not.toMatch(/year/i);
    }
  });

  it('refuses to price an unknown SKU rather than defaulting', () => {
    // planForProduct returning undefined is the security contract: never
    // charge for, or grant, something not in the catalog.
    expect(planForProduct('peptalk_plus_yearly')).toBeUndefined();
    expect(planForProduct('not_a_real_sku')).toBeUndefined();
    expect(planForProduct('')).toBeUndefined();
  });
});

describe('payment channels stay walled off from each other', () => {
  it('the native SquareCardForm is a no-op that renders nothing', () => {
    // Metro resolves SquareCardForm.web.tsx on web and SquareCardForm.tsx on
    // native. Offering Square as an alternative payment method inside an iOS
    // build is an App Store 3.1.1 rejection, so the native file must stay a
    // stub even though app/subscription.tsx imports it unconditionally.
    //
    const { SquareCardForm } = require('../../components/SquareCardForm');
    expect(SquareCardForm({} as never)).toBeNull();
  });
});
