/**
 * The web-subscription money decision (square-webhook → squareSubscriptionPatch).
 *
 * Production, Sept 2026: two web PepTalk+ buyers were told "You've used your 3
 * free Aimee messages" 6–12 minutes after paying, because a Square event landing
 * after the purchase turned their row inactive. Every web PepTalk+ subscription
 * later ended at its first renewal.
 */
import { squareSubscriptionPatch, squareDateEndMs } from '../../../supabase/functions/_shared/square';

const NY = 'America/New_York';
const at = (iso: string) => new Date(iso).getTime();

describe('squareDateEndMs', () => {
  it('reads Square dates in the subscription timezone, not UTC', () => {
    // 2026-10-08 23:59:59 New York (EDT, UTC-4) = 2026-10-09 03:59:59Z
    expect(new Date(squareDateEndMs('2026-10-08', NY)!).toISOString()).toBe('2026-10-09T03:59:59.000Z');
    // November is EST (UTC-5)
    expect(new Date(squareDateEndMs('2026-11-20', NY)!).toISOString()).toBe('2026-11-21T04:59:59.000Z');
  });
  it('rejects a malformed date', () => {
    expect(squareDateEndMs('10/08/2026', NY)).toBeNull();
  });
});

describe('squareSubscriptionPatch', () => {
  const justBought = { nowMs: at('2026-09-09T02:55:00Z'), existingExpiresAt: '2026-10-10T02:43:54Z' };

  it('PENDING right after purchase keeps access (the Sept 9 lock-out)', () => {
    expect(squareSubscriptionPatch({ status: 'PENDING', chargedThroughDate: null, timezone: NY, ...justBought }))
      .toEqual({ is_active: true });
  });

  it('ACTIVE keeps access and never shortens a period already extended', () => {
    const p = squareSubscriptionPatch({ status: 'ACTIVE', chargedThroughDate: '2026-10-08', timezone: NY, ...justBought });
    expect(p.is_active).toBe(true);
    expect(p.expires_at).toBe('2026-10-10T02:43:54.000Z'); // the later of the two
  });

  it('an out-of-order older event cannot revoke an active subscription', () => {
    const order = ['ACTIVE', 'PENDING'].map((status) =>
      squareSubscriptionPatch({ status, chargedThroughDate: '2026-10-08', timezone: NY, ...justBought }).is_active,
    );
    expect(order).toEqual([true, true]);
  });

  it('CANCELED keeps access through the paid-through date in New York time', () => {
    // Event at 02:43Z on Oct 9 = 22:43 Oct 8 in New York: still inside the paid day.
    const p = squareSubscriptionPatch({
      status: 'CANCELED', chargedThroughDate: '2026-10-08', timezone: NY,
      nowMs: at('2026-10-09T02:43:55Z'), existingExpiresAt: '2026-10-08T23:59:59Z',
    });
    expect(p).toEqual({ is_active: true, expires_at: '2026-10-09T03:59:59.000Z' });
  });

  it('CANCELED after the paid-through date ends access', () => {
    expect(
      squareSubscriptionPatch({ status: 'CANCELED', chargedThroughDate: '2026-10-08', timezone: NY, nowMs: at('2026-10-10T00:00:00Z') })
        .is_active,
    ).toBe(false);
  });

  it('DEACTIVATED and PAUSED revoke', () => {
    for (const status of ['DEACTIVATED', 'PAUSED']) {
      expect(squareSubscriptionPatch({ status, chargedThroughDate: '2026-10-08', timezone: NY, nowMs: at('2026-10-09T00:00:00Z') }).is_active)
        .toBe(false);
    }
  });

  it('an unknown or missing status changes nothing', () => {
    expect(squareSubscriptionPatch({ status: 'SOMETHING_NEW', nowMs: Date.now() })).toEqual({});
    expect(squareSubscriptionPatch({ status: null, nowMs: Date.now() })).toEqual({});
  });
});
