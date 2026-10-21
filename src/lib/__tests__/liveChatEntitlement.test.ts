/**
 * Live-event chat was gated on the RAW stored tier string, not on the feature
 * key `community_live_chat` that Plus actually grants.
 *
 *   app/(tabs)/community/live/[eventId].tsx  tier === 'plus' || tier === 'pro'
 *   app/(tabs)/community/live/index.tsx      same
 *
 * `useTier()` returns `useSubscriptionStore.tier` unfiltered. `hasFeature()`
 * runs computeFeatureAccess, which drops an inactive or expired paid tier back
 * to the free feature set. The stored tier survives expiry, so a lapsed
 * subscriber kept posting in live events — and because the gate never named a
 * feature key, verify:featurekeys could not see it either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canPostInLiveEvent, computeFeatureAccess } from '../entitlement';
import { TIER_FEATURES } from '../../types/fitness';

const ROOT = path.join(__dirname, '..', '..', '..');
const FEATURE = 'community_live_chat';

/** What hasFeature('community_live_chat') would return for this user. */
const hasLiveChat = (
  tier: 'free' | 'plus' | 'pro',
  isActive: boolean,
  expiresAt: string | null,
  now = Date.now(),
) => computeFeatureAccess({ tier, isActive, expiresAt, feature: FEATURE }, now);

const NOW = Date.parse('2026-09-16T12:00:00Z');
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-08-01T00:00:00Z';

describe('the feature key still exists and is granted where we think', () => {
  it('Plus and Pro grant it, Free does not', () => {
    expect(TIER_FEATURES.free).not.toContain(FEATURE);
    expect(TIER_FEATURES.plus).toContain(FEATURE);
    expect(TIER_FEATURES.pro).toContain(FEATURE);
  });
});

describe('canPostInLiveEvent', () => {
  it('lets the host post whatever their tier', () => {
    expect(
      canPostInLiveEvent({ isHost: true, requiredTier: 'pro', hasLiveChatFeature: false, tier: 'free' }),
    ).toBe(true);
  });

  it('lets anyone post in a free event', () => {
    expect(
      canPostInLiveEvent({ isHost: false, requiredTier: 'free', hasLiveChatFeature: false, tier: 'free' }),
    ).toBe(true);
  });

  it('defaults a missing requiredTier to plus, not to free', () => {
    expect(
      canPostInLiveEvent({ isHost: false, requiredTier: null, hasLiveChatFeature: false, tier: 'free' }),
    ).toBe(false);
    expect(
      canPostInLiveEvent({ isHost: false, requiredTier: undefined, hasLiveChatFeature: true, tier: 'plus' }),
    ).toBe(true);
  });

  it('blocks a free user from a plus event', () => {
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'plus',
        hasLiveChatFeature: hasLiveChat('free', false, null, NOW),
        tier: 'free',
      }),
    ).toBe(false);
  });

  it('lets an active Plus subscriber post in a plus event', () => {
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'plus',
        hasLiveChatFeature: hasLiveChat('plus', true, FUTURE, NOW),
        tier: 'plus',
      }),
    ).toBe(true);
  });

  // THE BUG: each of these passed `tier === 'plus' || tier === 'pro'`.
  it.each([
    ['expired Plus', 'plus' as const, true, PAST],
    ['expired Pro', 'pro' as const, true, PAST],
    ['inactive Plus with a future expiry', 'plus' as const, false, FUTURE],
    ['inactive Pro with a future expiry', 'pro' as const, false, FUTURE],
  ])('blocks a lapsed subscriber (%s) whose stored tier still reads paid', (_l, tier, isActive, expiresAt) => {
    expect(hasLiveChat(tier, isActive, expiresAt, NOW)).toBe(false);
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'plus',
        hasLiveChatFeature: hasLiveChat(tier, isActive, expiresAt, NOW),
        tier,
      }),
    ).toBe(false);
  });

  it('blocks an active Plus subscriber from a PRO-only event', () => {
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'pro',
        hasLiveChatFeature: hasLiveChat('plus', true, FUTURE, NOW),
        tier: 'plus',
      }),
    ).toBe(false);
  });

  it('lets an active Pro subscriber post in a PRO-only event', () => {
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'pro',
        hasLiveChatFeature: hasLiveChat('pro', true, FUTURE, NOW),
        tier: 'pro',
      }),
    ).toBe(true);
  });

  it('blocks an expired Pro from a PRO-only event even though the stored tier says pro', () => {
    expect(
      canPostInLiveEvent({
        isHost: false,
        requiredTier: 'pro',
        hasLiveChatFeature: hasLiveChat('pro', true, PAST, NOW),
        tier: 'pro',
      }),
    ).toBe(false);
  });
});

describe('the live screens use the feature-key path, not a raw tier string', () => {
  const screens = [
    'app/(tabs)/community/live/[eventId].tsx',
    'app/(tabs)/community/live/index.tsx',
  ];

  const read = (rel: string) =>
    fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it.each(screens)('%s asks for the feature key', (rel) => {
    expect(read(rel)).toContain(`useFeatureGate('${FEATURE}')`);
  });

  it.each(screens)('%s no longer decides access from tier === plus', (rel) => {
    expect(read(rel)).not.toMatch(/tier === 'plus'/);
  });

  it('[eventId] routes the decision through the pure helper', () => {
    expect(read(screens[0])).toMatch(/const tierAllowed = canPostInLiveEvent\(\{/);
  });
});
