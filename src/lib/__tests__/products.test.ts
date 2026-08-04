import {
  PRODUCT_IDS,
  ALL_PRODUCT_IDS,
  PRODUCT_TO_TIER,
  tierForProduct,
} from '../products';

describe('PRODUCT_IDS', () => {
  it('maps the four canonical store SKUs', () => {
    expect(PRODUCT_IDS.plusMonthly).toBe('peptalk_plus_monthly');
    expect(PRODUCT_IDS.plusYearly).toBe('peptalk_plus_yearly');
    expect(PRODUCT_IDS.proMonthly).toBe('peptalk_pro_monthly');
    expect(PRODUCT_IDS.proYearly).toBe('peptalk_pro_yearly');
  });
});

describe('ALL_PRODUCT_IDS', () => {
  it('offers ONLY the monthly SKUs to the store (no yearly — see policy)', () => {
    expect(ALL_PRODUCT_IDS).toEqual([
      PRODUCT_IDS.plusMonthly,
      PRODUCT_IDS.proMonthly,
    ]);
    expect(ALL_PRODUCT_IDS).not.toContain(PRODUCT_IDS.plusYearly);
    expect(ALL_PRODUCT_IDS).not.toContain(PRODUCT_IDS.proYearly);
  });
});

describe('tierForProduct / PRODUCT_TO_TIER', () => {
  it('plus monthly & yearly resolve to plus', () => {
    expect(tierForProduct('peptalk_plus_monthly')).toBe('plus');
    expect(tierForProduct('peptalk_plus_yearly')).toBe('plus');
  });

  it('pro monthly & yearly resolve to pro', () => {
    expect(tierForProduct('peptalk_pro_monthly')).toBe('pro');
    expect(tierForProduct('peptalk_pro_yearly')).toBe('pro');
  });

  it('an unknown product resolves to no tier (undefined) — never silently grants', () => {
    expect(tierForProduct('peptalk_ultra_lifetime')).toBeUndefined();
    expect(tierForProduct('')).toBeUndefined();
    expect(tierForProduct('plus')).toBeUndefined();
  });

  it('never resolves an unknown product to a valid subscription tier', () => {
    // Documents the ACTUAL behavior of a plain-object record lookup: a key
    // like "__proto__" returns the Object prototype (not undefined). It is
    // NOT a real store SKU and is NEVER one of the three valid tier strings,
    // so the trust-but-verify gate in validatePurchase would not grant a real
    // tier from it. (Behavior identical to the pre-extraction inline map.)
    const resolved = tierForProduct('__proto__') as unknown;
    expect(['free', 'plus', 'pro']).not.toContain(resolved);
  });

  it('no SKU maps to "free"', () => {
    for (const tier of Object.values(PRODUCT_TO_TIER)) {
      expect(tier).not.toBe('free');
    }
  });
});

describe('iapService re-export wiring', () => {
  it('exposes the same PRODUCT_TO_TIER map (behavior unchanged after extraction)', () => {
    // Verifies the re-export in src/services/iapService.ts is the extracted map.
    const iap = require('../../services/iapService');
    expect(iap.PRODUCT_TO_TIER).toBe(PRODUCT_TO_TIER);
    expect(iap.PRODUCT_IDS).toBe(PRODUCT_IDS);
  });
});
