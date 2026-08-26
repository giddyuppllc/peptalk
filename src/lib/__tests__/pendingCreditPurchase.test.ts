/**
 * Surviving the Square redirect.
 *
 * Buying credit on the web means leaving the app, paying on a Square-hosted
 * page, and returning to a fully reloaded PWA. Square redirects as soon as the
 * payment completes; the webhook that grants the credit lands separately, a
 * moment later. So the buyer can very reasonably arrive back and see the
 * balance they had before they paid.
 *
 * The rule these tests hold: NEVER claim a credit landed unless it provably
 * did. Telling someone their credit arrived when it has not is worse than
 * telling them it is still coming, because it stops them checking.
 */
import {
  rememberCreditPurchase,
  readPendingCreditPurchase,
  clearPendingCreditPurchase,
  balanceIncreased,
  isCheckoutReturn,
  type PendingCreditPurchase,
} from '../pendingCreditPurchase';

/** In-memory sessionStorage stand-in; jsdom may not provide one. */
function installStorage() {
  const map = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  return map;
}

/** A storage that throws on every access, as private-mode browsers can. */
function installHostileStorage() {
  (globalThis as any).sessionStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
}

describe('remembering a purchase across the redirect', () => {
  beforeEach(() => { installStorage(); });

  it('round-trips the pack and the pre-purchase balance', () => {
    rememberCreditPurchase('peptalk_credits_small', 120, 1_000);
    const p = readPendingCreditPurchase(1_500);
    expect(p).not.toBeNull();
    expect(p!.productId).toBe('peptalk_credits_small');
    expect(p!.balanceBeforeCents).toBe(120);
  });

  it('keeps a null balance as null rather than coercing it to zero', () => {
    // null means "could not read", and zero means "you have none". Conflating
    // them would let an unreadable balance masquerade as a provable increase.
    rememberCreditPurchase('peptalk_credits_small', null, 1_000);
    expect(readPendingCreditPurchase(1_500)!.balanceBeforeCents).toBeNull();
  });

  it('returns null when nothing is pending', () => {
    expect(readPendingCreditPurchase()).toBeNull();
  });

  it('expires a stale record instead of confirming an old attempt', () => {
    rememberCreditPurchase('peptalk_credits_small', 100, 0);
    // Half an hour and one millisecond later.
    expect(readPendingCreditPurchase(30 * 60 * 1000 + 1)).toBeNull();
  });

  it('clears on demand', () => {
    rememberCreditPurchase('peptalk_credits_large', 5, 1_000);
    clearPendingCreditPurchase();
    expect(readPendingCreditPurchase(1_100)).toBeNull();
  });

  it('ignores a corrupted record rather than throwing', () => {
    const map = installStorage();
    map.set('peptalk.pendingCreditPurchase', '{not json');
    expect(readPendingCreditPurchase()).toBeNull();
  });

  it('ignores a record missing its fields', () => {
    const map = installStorage();
    map.set('peptalk.pendingCreditPurchase', JSON.stringify({ nope: true }));
    expect(readPendingCreditPurchase()).toBeNull();
  });

  it('survives a storage that throws on every call', () => {
    installHostileStorage();
    expect(() => rememberCreditPurchase('peptalk_credits_small', 10)).not.toThrow();
    expect(readPendingCreditPurchase()).toBeNull();
    expect(() => clearPendingCreditPurchase()).not.toThrow();
  });
});

describe('a credit is only confirmed when it provably arrived', () => {
  const at = (before: number | null): PendingCreditPurchase => ({
    productId: 'peptalk_credits_small',
    balanceBeforeCents: before,
    startedAt: 0,
  });

  it('confirms when the balance went up', () => {
    expect(balanceIncreased(at(100), 400)).toBe(true);
  });

  it('does NOT confirm when the balance is unchanged', () => {
    // The webhook has not landed yet. Saying "credit added" here is the lie
    // this whole module exists to prevent.
    expect(balanceIncreased(at(100), 100)).toBe(false);
  });

  it('does NOT confirm when the balance cannot be read', () => {
    expect(balanceIncreased(at(100), null)).toBe(false);
  });

  it('does NOT confirm when the previous balance was unknown', () => {
    // Without a before-value there is nothing to compare against, so an
    // increase cannot be proven even if one occurred.
    expect(balanceIncreased(at(null), 400)).toBe(false);
  });

  it('does NOT confirm on a decrease', () => {
    expect(balanceIncreased(at(400), 100)).toBe(false);
  });

  it('treats a zero prior balance as a real comparison, not a missing one', () => {
    // A first-time buyer starts at 0. Conflating 0 with "unknown" would mean
    // their very first purchase could never be confirmed.
    expect(balanceIncreased(at(0), 300)).toBe(true);
    expect(balanceIncreased(at(0), 0)).toBe(false);
  });
});

describe('detecting the return from checkout', () => {
  const setUrl = (search: string) => {
    (globalThis as any).window = { location: { search } };
  };

  it('recognises the success return', () => {
    setUrl('?checkout=success');
    expect(isCheckoutReturn()).toBe(true);
  });

  it('ignores an ordinary visit', () => {
    setUrl('');
    expect(isCheckoutReturn()).toBe(false);
    setUrl('?tab=plans');
    expect(isCheckoutReturn()).toBe(false);
  });

  it('ignores any other checkout value', () => {
    setUrl('?checkout=cancelled');
    expect(isCheckoutReturn()).toBe(false);
  });

  it('is false when there is no window at all (native)', () => {
    delete (globalThis as any).window;
    expect(isCheckoutReturn()).toBe(false);
  });
});
