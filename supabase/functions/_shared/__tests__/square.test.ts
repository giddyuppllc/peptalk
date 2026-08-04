import {
  timingSafeEqual,
  parseRef,
  planForProduct,
  SQUARE_PLANS,
} from '../square';

describe('timingSafeEqual', () => {
  it('true for identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('true for two empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('false for same-length but different strings', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('Xbcdef', 'abcdef')).toBe(false); // differ at first char
    expect(timingSafeEqual('abcdeX', 'abcdef')).toBe(false); // differ at last char
  });

  it('false for different-length strings (length mismatch short-circuit)', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('abcd', 'abc')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});

describe('parseRef', () => {
  it('parses a full "<userId>:<tier>:<productId>" reference', () => {
    expect(parseRef('user-123:plus:peptalk_plus_monthly')).toEqual({
      userId: 'user-123',
      tier: 'plus',
      productId: 'peptalk_plus_monthly',
    });
    expect(parseRef('user-123:pro:peptalk_pro_monthly')).toEqual({
      userId: 'user-123',
      tier: 'pro',
      productId: 'peptalk_pro_monthly',
    });
  });

  it('defaults productId to peptalk_<tier>_monthly when the segment is missing', () => {
    expect(parseRef('user-123:plus')).toEqual({
      userId: 'user-123',
      tier: 'plus',
      productId: 'peptalk_plus_monthly',
    });
    expect(parseRef('user-123:pro')).toEqual({
      userId: 'user-123',
      tier: 'pro',
      productId: 'peptalk_pro_monthly',
    });
  });

  it('returns null for missing / empty ref', () => {
    expect(parseRef(undefined)).toBeNull();
    expect(parseRef(null)).toBeNull();
    expect(parseRef('')).toBeNull();
  });

  it('returns null for an empty userId', () => {
    expect(parseRef(':plus:peptalk_plus_monthly')).toBeNull();
  });

  it('returns null for a tampered / invalid tier', () => {
    expect(parseRef('user-123:gold:peptalk_gold_monthly')).toBeNull();
    expect(parseRef('user-123:free:x')).toBeNull();
    expect(parseRef('user-123:PLUS:x')).toBeNull(); // case-sensitive
    expect(parseRef('user-123')).toBeNull(); // no tier segment
  });
});

describe('planForProduct / SQUARE_PLANS', () => {
  it('plus monthly → plus @ $9.99 (999 cents)', () => {
    const plan = planForProduct('peptalk_plus_monthly');
    expect(plan?.tier).toBe('plus');
    expect(plan?.amountCents).toBe(999);
    expect(plan?.name).toBe('PepTalk+ (Monthly)');
    expect(plan?.planEnv).toBe('SQUARE_PLAN_PLUS_MONTHLY');
  });

  it('pro monthly → pro @ $49.99 (4999 cents)', () => {
    const plan = planForProduct('peptalk_pro_monthly');
    expect(plan?.tier).toBe('pro');
    expect(plan?.amountCents).toBe(4999);
    expect(plan?.name).toBe('PepTalk Pro (Monthly)');
    expect(plan?.planEnv).toBe('SQUARE_PLAN_PRO_MONTHLY');
  });

  it('unknown product → undefined (never charge/grant for an unknown SKU)', () => {
    expect(planForProduct('peptalk_ultra')).toBeUndefined();
    expect(planForProduct('')).toBeUndefined();
    expect(planForProduct('peptalk_plus_yearly')).toBeUndefined(); // web is monthly-only
  });

  it('every plan tier is a paid tier (plus/pro), never free', () => {
    for (const plan of Object.values(SQUARE_PLANS)) {
      expect(['plus', 'pro']).toContain(plan.tier);
    }
  });
});
