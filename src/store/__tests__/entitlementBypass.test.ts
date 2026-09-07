/**
 * The dev entitlement bypass must never reach a customer.
 *
 * History: the bypass fired whenever `EXPO_PUBLIC_ENV !== 'production'`, and
 * eas.json's `preview` profile paired that env with `distribution: "store"`.
 * A shippable binary that hands out Pro — and, because the user already owns
 * it, a Subscribe button that does nothing, which is a 2.1(a) finding in its
 * own right.
 *
 * These tests assert the SHAPE of the switch rather than the behaviour of one
 * build, because the broken version behaved perfectly in the build it was
 * written in. That was the whole problem.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BETA_PRODUCT_ID, computeFeatureAccess } from '../../lib/entitlement';

const SRC = readFileSync(join(__dirname, '..', 'useSubscriptionStore.ts'), 'utf8');

describe('entitlement bypass', () => {
  it('is pinned to __DEV__, which no build profile can set', () => {
    expect(SRC).toMatch(
      /export function isDevBuildBypass\(\): boolean \{\s*return __DEV__ === true/,
    );
  });

  it('never lets build configuration decide what a user has paid for', () => {
    // Prose about the history is fine. Reading the value is not.
    const readers = SRC.split('\n').filter((l) => /process\.env\.EXPO_PUBLIC_ENV/.test(l));
    expect(readers).toEqual([]);
  });

  it('excludes web, so the Square-monetized PWA always runs the real flow', () => {
    expect(SRC).toMatch(/__DEV__ === true && Platform\.OS !== 'web'/);
  });

  it('purges a stale grant on load instead of trusting persisted state', () => {
    // The grant was written with expiresAt:null — which never expires — so
    // closing the bypass alone leaves anyone who ran a preview build once
    // holding permanent free Pro after they update to the production build.
    expect(SRC).toMatch(
      /state\?\.productId === BETA_GRANT_PRODUCT_ID && !isDevBuildBypass\(\)/,
    );
  });

  it('keeps one source of truth for the grant marker', () => {
    // Redeclaring the literal would let the two drift, and entitlement.ts is
    // where it matters: getSubscriptionStatus() reports this productId as
    // 'active' with no expiry.
    expect(SRC).toMatch(/export const BETA_GRANT_PRODUCT_ID = BETA_PRODUCT_ID;/);
    expect(BETA_PRODUCT_ID).toBe('beta_tester_grant');
  });
});

describe('a persisted beta grant is not a valid entitlement', () => {
  it('would otherwise grant Pro forever — a null expiry never expires', () => {
    const granted = computeFeatureAccess({
      tier: 'pro',
      isActive: true,
      expiresAt: null,
      feature: 'aimee_ai_unlimited',
    });
    // This is why the purge exists: the gate cannot tell a beta grant from a
    // real subscription, because on paper it looks like a better one.
    expect(granted).toBe(true);
  });

  it('is inert once purged to free', () => {
    const granted = computeFeatureAccess({
      tier: 'free',
      isActive: false,
      expiresAt: null,
      feature: 'aimee_ai_unlimited',
    });
    expect(granted).toBe(false);
  });
});
