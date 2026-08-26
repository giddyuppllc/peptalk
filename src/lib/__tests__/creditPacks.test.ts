/**
 * AI credit packs — money-path guards.
 *
 * Credit packs are sold on three rails with two hand-maintained copies of the
 * catalog (client + edge). Everything here protects one of four things that
 * would each cost real money or real trust:
 *
 *  1. The two catalogs agreeing. A drifted table is how a $4.99 pack starts
 *     granting a different amount on one platform than another.
 *  2. Credits being usable. A pack the cost gate never consults is money taken
 *     for something that never takes effect — the single most repeated failure
 *     shape in this codebase.
 *  3. Consumables being consumed. `finishTransaction({isConsumable:false})` on
 *     Android ACKNOWLEDGES rather than consumes, leaving the SKU "already
 *     owned" so the user can never buy that pack again.
 *  4. Native never being sent to the web payment rail, which is a store
 *     guideline violation and a rejection risk.
 *
 * The ref-shape tests are behavioural: they run the real parsers rather than
 * asserting on source text, because the property that matters is that a credit
 * ref can never be read as a subscription grant.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  CREDIT_PACKS as CLIENT_PACKS,
  ALL_CREDIT_PACK_IDS,
  isCreditPack as clientIsCreditPack,
  packForProduct as clientPackFor,
  formatCents,
} from '../creditPacks';
import {
  CREDIT_PACKS as SERVER_PACKS,
  packForProduct as serverPackFor,
  creditsForProduct,
  buildCreditRef,
  parseCreditRef,
  isWebOnlyRail,
  MC_PER_CENT,
} from '../../../supabase/functions/_shared/credits';
import { parseRef } from '../../../supabase/functions/_shared/square';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('the client and edge catalogs cannot drift', () => {
  it('lists the same SKUs', () => {
    expect(Object.keys(CLIENT_PACKS).sort()).toEqual(Object.keys(SERVER_PACKS).sort());
  });

  it.each(Object.keys(SERVER_PACKS))('%s has identical price and credit value', (id) => {
    const client = clientPackFor(id);
    const server = serverPackFor(id);
    expect(client).toBeDefined();
    expect(server).toBeDefined();
    expect(client!.priceCents).toBe(server!.priceCents);
    expect(client!.creditCents).toBe(server!.creditCents);
  });

  it('every SKU in the display list actually exists', () => {
    for (const id of ALL_CREDIT_PACK_IDS) {
      expect(serverPackFor(id)).toBeDefined();
    }
  });

  it('never sells a pack worth nothing', () => {
    for (const id of Object.keys(SERVER_PACKS)) {
      expect(SERVER_PACKS[id].creditCents).toBeGreaterThan(0);
      expect(SERVER_PACKS[id].priceCents).toBeGreaterThan(0);
    }
  });
});

describe('an unknown SKU is a refusal, never a zero grant', () => {
  it('resolves to undefined on both sides', () => {
    expect(serverPackFor('peptalk_credits_free_lol')).toBeUndefined();
    expect(clientPackFor('peptalk_credits_free_lol')).toBeUndefined();
    expect(clientIsCreditPack('peptalk_pro_monthly')).toBe(false);
  });

  it('grants zero microcents for an unknown SKU', () => {
    expect(creditsForProduct('nope')).toBe(0);
  });

  it('converts credit value to microcents exactly', () => {
    const pack = SERVER_PACKS.peptalk_credits;
    expect(creditsForProduct(pack.productId)).toBe(pack.creditCents * MC_PER_CENT);
  });
});

describe('a credit ref can never be read as a subscription grant', () => {
  const userId = '11111111-2222-3333-4444-555555555555';

  it('round-trips through its own parser', () => {
    const ref = buildCreditRef(userId, 'peptalk_credits');
    const parsed = parseCreditRef(ref);
    expect(parsed).not.toBeNull();
    expect(parsed!.userId).toBe(userId);
    expect(parsed!.productId).toBe('peptalk_credits');
    expect(parsed!.microcents).toBe(
      SERVER_PACKS.peptalk_credits.creditCents * MC_PER_CENT,
    );
  });

  it('is REJECTED by the subscription parser', () => {
    // The whole reason the two ref shapes differ: a paid credit pack must not
    // be able to fall through and grant a subscription tier.
    expect(parseRef(buildCreditRef(userId, 'peptalk_credits'))).toBeNull();
  });

  it('does not accept a subscription ref', () => {
    expect(parseCreditRef(userId + ':pro:peptalk_pro_monthly')).toBeNull();
  });

  it('rejects an unknown SKU rather than granting zero', () => {
    expect(parseCreditRef(userId + ':credits:peptalk_credits_enormous')).toBeNull();
  });

  it('rejects malformed and empty refs', () => {
    expect(parseCreditRef(undefined)).toBeNull();
    expect(parseCreditRef('')).toBeNull();
    expect(parseCreditRef(':credits:peptalk_credits_small')).toBeNull();
    expect(parseCreditRef('user:credits')).toBeNull();
  });
});

describe('platform rules', () => {
  it('marks square as the web-only rail', () => {
    expect(isWebOnlyRail('square')).toBe(true);
    expect(isWebOnlyRail('apple')).toBe(false);
    expect(isWebOnlyRail('google')).toBe(false);
  });

  it('the purchase service sends native to IAP, never to Square', () => {
    const src = read('src/services/creditPurchase.ts');
    expect(src).toContain("if (Platform.OS === 'web')");
    expect(src).toContain('await purchaseCreditPack(productId)');
    // The Square call must sit INSIDE the web branch, not before it.
    const buyFn = src.slice(src.indexOf('export async function buyCreditPack'));
    expect(buyFn.indexOf("Platform.OS === 'web'")).toBeLessThan(
      buyFn.indexOf('square-checkout'),
    );
  });
});

describe('consumables are consumed, not merely acknowledged', () => {
  const src = read('src/services/iapService.ts');

  it('derives isConsumable from the SKU instead of hardcoding false', () => {
    expect(src).toContain('isConsumable: consumable');
    expect(src).not.toContain('isConsumable: false');
  });

  it('fetches credit packs as one-time products, not subscriptions', () => {
    const fn = src.slice(src.indexOf('export async function getCreditPackProducts'));
    expect(fn).toContain("type: 'inapp'");
  });

  it('does not send subscription offer tokens for a one-time product', () => {
    const fn = src.slice(
      src.indexOf('export async function purchaseCreditPack'),
      src.indexOf('// Purchase flow'),
    );
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).not.toContain('subscriptionOffers');
    expect(fn).toContain("type: 'inapp'");
  });
});

describe('purchased credits are actually spendable', () => {
  const cost = read('supabase/functions/aimee-chat-stream/_cost.ts');

  it('the cost gate consults the credit balance before refusing', () => {
    // Without this, a bought pack changes nothing and the user is still
    // blocked — money taken for a feature that never takes effect.
    expect(cost).toContain('readCreditBalance');
    expect(cost).toContain('usingCredits: true');
  });

  it('an unreadable balance fails closed rather than denying a payer', () => {
    expect(cost).toContain('creditBalance === null');
  });

  it('spend beyond the allowance draws credits down', () => {
    // A balance that only ever goes up is free AI after the first pack.
    expect(cost).toContain("rpc('consume_ai_credits'");
    expect(cost).toContain('overAfter - overBefore');
  });

  it('the chat function passes the allowance state needed to do that', () => {
    const chat = read('supabase/functions/aimee-chat-stream/index.ts');
    expect(chat).toContain('allowanceMC: costCheck.allowanceMC');
    expect(chat).toContain('priorSpendMC: costCheck.userSpendMC');
  });
});

describe('grants are idempotent at every rail', () => {
  const sql = read('supabase/migrations/20260826100000_ai_credit_packs.sql');

  it('the migration keys grants on (source, external_id)', () => {
    expect(sql).toContain('UNIQUE (source, external_id)');
    expect(sql).toContain('ON CONFLICT (source, external_id) DO NOTHING');
    // Balance must only move when the grant row was actually inserted.
    expect(sql).toContain('IF v_rows > 0 THEN');
  });

  it('consumption cannot go negative', () => {
    expect(sql).toContain('CHECK (balance_microcents >= 0)');
    expect(sql).toContain('LEAST(v_bal, p_microcents)');
    expect(sql).toContain('FOR UPDATE');
  });

  it('clients cannot write to the credit tables', () => {
    // Read-own policies only; every mutation goes through SECURITY DEFINER
    // functions granted to service_role.
    expect(sql).toContain('Read own credit grants');
    expect(sql).toContain('Read own credit balance');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.grant_ai_credits');
    expect(sql).not.toContain('FOR INSERT WITH CHECK (auth.uid() = user_id)');
  });

  it('validate-purchase routes packs before the subscription tier lookup', () => {
    const src = read('supabase/functions/validate-purchase/index.ts');
    const branch = src.indexOf('if (isCreditPack(body.productId))');
    const tierLookup = src.indexOf('const tier = PRODUCT_TO_TIER[body.productId]');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(tierLookup);
  });

  it('validate-purchase refuses a transaction already bound to another user', () => {
    const src = read('supabase/functions/validate-purchase/index.ts');
    expect(src).toContain('already linked to another account');
  });

  it('validate-purchase keys Apple on transactionId, not originalTransactionId', () => {
    // originalTransactionId is shared across repeat purchases of the same SKU,
    // so keying on it would silently drop every repeat purchase as a duplicate.
    const src = read('supabase/functions/validate-purchase/index.ts');
    const fn = src.slice(
      src.indexOf('async function verifyAppleConsumable'),
      src.indexOf('async function verifyGoogleConsumable'),
    );
    expect(fn).toContain('tx?.transactionId');
    expect(fn).not.toContain('tx?.originalTransactionId');
  });

  it('validate-purchase uses the PRODUCTS endpoint for Google consumables', () => {
    const src = read('supabase/functions/validate-purchase/index.ts');
    const fn = src.slice(
      src.indexOf('async function verifyGoogleConsumable'),
      src.indexOf('async function acknowledgeGoogleProduct'),
    );
    expect(fn).toContain('purchases/products/');
    expect(fn).not.toContain('purchases/subscriptions/');
    // Pending payments must not grant.
    expect(fn).toContain('data.purchaseState !== 0');
  });

  it('the webhook grants credits before attempting a subscription parse', () => {
    const src = read('supabase/functions/square-webhook/index.ts');
    const creditParse = src.indexOf('parseCreditRef(referenceId)');
    const subParse = src.indexOf('const ref = parseRef(referenceId)');
    expect(creditParse).toBeGreaterThan(-1);
    expect(creditParse).toBeLessThan(subParse);
  });

  it('the webhook only grants on a captured payment', () => {
    const src = read('supabase/functions/square-webhook/index.ts');
    // `if (!paid) return ok()` must already have run above the credit block.
    expect(src.indexOf('if (!paid) return ok();')).toBeLessThan(
      src.indexOf('const creditRef = parseCreditRef'),
    );
    const creditBlock = src.slice(src.indexOf('const creditRef = parseCreditRef'));
    expect(creditBlock).toContain("p_source: 'square'");
  });
});

describe('display helpers', () => {
  it('formats cents as dollars', () => {
    expect(formatCents(499)).toBe('$4.99');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(1500)).toBe('$15.00');
  });
});
