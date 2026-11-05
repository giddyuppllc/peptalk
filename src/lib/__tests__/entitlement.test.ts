import {
  deriveStatus,
  timeUntilExpiry,
  computeFeatureAccess,
  tierRank,
  isTierAtLeast,
  TIER_RANK,
  EXPIRING_SOON_MS,
  BETA_PRODUCT_ID,
} from '../entitlement';

// Fixed reference clock so expiry math is deterministic.
const NOW = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

describe('deriveStatus', () => {
  it('free tier is always "none" regardless of expiry/product', () => {
    expect(deriveStatus({ tier: 'free', expiresAt: null, productId: null }, NOW)).toBe('none');
    expect(
      deriveStatus({ tier: 'free', expiresAt: iso(NOW + 30 * DAY), productId: 'x' }, NOW),
    ).toBe('none');
  });

  it('beta grant is active indefinitely even with a past expiry', () => {
    expect(
      deriveStatus(
        { tier: 'pro', expiresAt: iso(NOW - 100 * DAY), productId: BETA_PRODUCT_ID },
        NOW,
      ),
    ).toBe('active');
  });

  it('recognizes the exact beta productId string "beta_tester_grant"', () => {
    // Pin to the literal string (not the exported constant) so a wrong
    // BETA_PRODUCT_ID value would surface: a past-expiry beta grant must
    // stay active only because the productId matches this exact string.
    expect(
      deriveStatus({ tier: 'pro', expiresAt: iso(NOW - 100 * DAY), productId: 'beta_tester_grant' }, NOW),
    ).toBe('active');
    expect(BETA_PRODUCT_ID).toBe('beta_tester_grant');
  });

  it('paid tier with no expiry is active (lifetime/legacy)', () => {
    expect(deriveStatus({ tier: 'pro', expiresAt: null, productId: 'p' }, NOW)).toBe('active');
  });

  it('paid tier with an unparseable expiry is active (fail-open)', () => {
    expect(deriveStatus({ tier: 'plus', expiresAt: 'not-a-date', productId: 'p' }, NOW)).toBe(
      'active',
    );
  });

  it('expired when expiry is in the past', () => {
    expect(deriveStatus({ tier: 'pro', expiresAt: iso(NOW - 1000), productId: 'p' }, NOW)).toBe(
      'expired',
    );
  });

  it('expired exactly at now (exp <= now boundary)', () => {
    expect(deriveStatus({ tier: 'pro', expiresAt: iso(NOW), productId: 'p' }, NOW)).toBe('expired');
  });

  it('expiring within the 7-day window', () => {
    expect(deriveStatus({ tier: 'plus', expiresAt: iso(NOW + 3 * DAY), productId: 'p' }, NOW)).toBe(
      'expiring',
    );
  });

  it('expiring exactly at the 7-day boundary (<= window)', () => {
    expect(
      deriveStatus({ tier: 'plus', expiresAt: iso(NOW + EXPIRING_SOON_MS), productId: 'p' }, NOW),
    ).toBe('expiring');
  });

  it('active when comfortably beyond the window (just over 7 days)', () => {
    expect(
      deriveStatus(
        { tier: 'pro', expiresAt: iso(NOW + EXPIRING_SOON_MS + 1000), productId: 'p' },
        NOW,
      ),
    ).toBe('active');
  });
});

describe('tierRank / isTierAtLeast', () => {
  it('ranks free < plus < pro', () => {
    expect(TIER_RANK.free).toBe(0);
    expect(TIER_RANK.plus).toBe(1);
    expect(TIER_RANK.pro).toBe(2);
    expect(tierRank('free')).toBeLessThan(tierRank('plus'));
    expect(tierRank('plus')).toBeLessThan(tierRank('pro'));
  });

  it('unknown / null / undefined tiers rank as 0 (free)', () => {
    expect(tierRank('gold')).toBe(0);
    expect(tierRank(null)).toBe(0);
    expect(tierRank(undefined)).toBe(0);
  });

  it('isTierAtLeast honors the ordering', () => {
    expect(isTierAtLeast('pro', 'plus')).toBe(true);
    expect(isTierAtLeast('pro', 'pro')).toBe(true);
    expect(isTierAtLeast('plus', 'plus')).toBe(true);
    expect(isTierAtLeast('plus', 'pro')).toBe(false);
    expect(isTierAtLeast('free', 'plus')).toBe(false);
    expect(isTierAtLeast('free', 'free')).toBe(true);
  });
});

describe('timeUntilExpiry', () => {
  it('returns null for a beta grant', () => {
    expect(timeUntilExpiry({ expiresAt: iso(NOW + DAY), productId: BETA_PRODUCT_ID }, NOW)).toBeNull();
  });

  it('returns null for the exact beta productId string "beta_tester_grant"', () => {
    expect(timeUntilExpiry({ expiresAt: iso(NOW + DAY), productId: 'beta_tester_grant' }, NOW)).toBeNull();
  });

  it('returns null when there is no expiry', () => {
    expect(timeUntilExpiry({ expiresAt: null, productId: 'p' }, NOW)).toBeNull();
  });

  it('returns null for an unparseable expiry', () => {
    expect(timeUntilExpiry({ expiresAt: 'nonsense', productId: 'p' }, NOW)).toBeNull();
  });

  it('returns positive ms for a future expiry', () => {
    expect(timeUntilExpiry({ expiresAt: iso(NOW + 5 * DAY), productId: 'p' }, NOW)).toBe(5 * DAY);
  });

  it('returns negative ms for a past expiry', () => {
    expect(timeUntilExpiry({ expiresAt: iso(NOW - 2 * DAY), productId: 'p' }, NOW)).toBe(-2 * DAY);
  });
});

describe('computeFeatureAccess', () => {
  // Feature keys taken from src/types/fitness.ts TIER_FEATURES.
  const FREE_FEATURE = 'dosing_calculator';
  const PLUS_FEATURE = 'meal_scan';
  const PRO_FEATURE = 'recipe_generator';

  it('free user gets free features', () => {
    expect(
      computeFeatureAccess(
        { tier: 'free', isActive: true, expiresAt: null, feature: FREE_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('free user does NOT get paid features', () => {
    expect(
      computeFeatureAccess(
        { tier: 'free', isActive: true, expiresAt: null, feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(false);
  });

  it('active pro user gets a pro feature', () => {
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: iso(NOW + 30 * DAY), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('active plus user gets a plus feature but NOT a pro feature', () => {
    expect(
      computeFeatureAccess(
        { tier: 'plus', isActive: true, expiresAt: iso(NOW + 30 * DAY), feature: PLUS_FEATURE },
        NOW,
      ),
    ).toBe(true);
    expect(
      computeFeatureAccess(
        { tier: 'plus', isActive: true, expiresAt: iso(NOW + 30 * DAY), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(false);
  });

  it('inactive paid user falls back to FREE features (expiry-leak fix)', () => {
    // Paid feature denied...
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: false, expiresAt: iso(NOW + 30 * DAY), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(false);
    // ...but free features still work.
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: false, expiresAt: iso(NOW + 30 * DAY), feature: FREE_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('expired paid user (past expiry + renewal grace, still flagged active) falls back to FREE', () => {
    // An ACTIVE row is honoured for the server's renewal grace (3 days) after
    // expiry — see RENEWAL_GRACE_MS. Past that it is genuinely lapsed.
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: iso(NOW - 4 * DAY), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(false);
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: iso(NOW - 4 * DAY), feature: FREE_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('an ACTIVE row just past expiry (renewal webhook not yet landed) keeps paid access', () => {
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: iso(NOW - 1000), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('paid access is still granted at the exact expiry instant (now === expiresMs uses strict >)', () => {
    // computeFeatureAccess downgrades only when now > expiresMs (strict). At the
    // exact boundary the paid feature is still available. Guards the > vs >=.
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: iso(NOW), feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('active paid user with no expiry keeps paid access', () => {
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: null, feature: PRO_FEATURE },
        NOW,
      ),
    ).toBe(true);
  });

  it('unknown feature is never granted', () => {
    expect(
      computeFeatureAccess(
        { tier: 'pro', isActive: true, expiresAt: null, feature: 'no_such_feature' },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('renewal grace matches the server', () => {
   
  const fs = require('node:fs');
   
  const path = require('node:path');
   
  const { RENEWAL_GRACE_MS, withinRenewalGrace, computeFeatureAccess } = require('../entitlement');

  it('uses the same grace as supabase/functions/_shared/effectiveTier.ts', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../supabase/functions/_shared/effectiveTier.ts'), 'utf8');
    const m = src.match(/const GRACE_MS = (\d+) \* 24 \* 60 \* 60 \* 1000/);
    expect(m).not.toBeNull();
    expect(RENEWAL_GRACE_MS).toBe(Number(m[1]) * 24 * 60 * 60 * 1000);
  });

  it('a paid ACTIVE row an hour past expiry (renewal webhook pending) keeps paid features', () => {
    const now = Date.parse('2026-10-08T05:00:00Z');
    expect(withinRenewalGrace('2026-10-08T04:00:00Z', now)).toBe(true);
    const tierFeature = (require('../../types/fitness').TIER_FEATURES.pro ?? []).find(
      (f: string) => !(require('../../types/fitness').TIER_FEATURES.free ?? []).includes(f),
    );
    expect(computeFeatureAccess({ tier: 'pro', isActive: true, expiresAt: '2026-10-08T04:00:00Z', feature: tierFeature }, now)).toBe(true);
  });

  it('past the grace, or inactive, falls back to free', () => {
    const now = Date.parse('2026-10-12T05:00:00Z');
    expect(withinRenewalGrace('2026-10-08T04:00:00Z', now)).toBe(false);
    const fitness = require('../../types/fitness');
    const paidOnly = (fitness.TIER_FEATURES.pro ?? []).find((f: string) => !(fitness.TIER_FEATURES.free ?? []).includes(f));
    expect(computeFeatureAccess({ tier: 'pro', isActive: true, expiresAt: '2026-10-08T04:00:00Z', feature: paidOnly }, now)).toBe(false);
    expect(computeFeatureAccess({ tier: 'pro', isActive: false, expiresAt: '2026-12-08T04:00:00Z', feature: paidOnly }, now)).toBe(false);
  });
});
