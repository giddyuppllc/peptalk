/**
 * A refused purchase has to reach the person who paid for it.
 *
 * The shape of the bug this locks down: the native sheet closes successfully,
 * Apple or Google has taken the money, `validate-purchase` refuses to grant
 * entitlement, and the paywall stays exactly as it was. The failure was
 * reported — to Sentry, with `source: iap.validate` — and to nobody else. From
 * the buyer's side, paying did nothing and the app never mentioned it.
 *
 * That is the same failure as the on-device bot quietly answering in Aimee's
 * place: a real error absorbed by a path that had no way to say so.
 *
 * These are source scans rather than renders. The screen is a 1,100-line
 * component with native modules behind it, and what matters here is not how
 * the banner looks — it is that the state is SET at the point of failure,
 * CLEARED when entitlement arrives, and READ by the screen. A render test
 * would pass against a version that sets the flag and never shows it.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LAYOUT = 'app/_layout.tsx';
const SCREEN = 'app/subscription.tsx';
const STORE = 'src/store/useSubscriptionStore.ts';

describe('a refused purchase is visible to the buyer', () => {
  it('every place that throws on a refused grant sets failedPurchase first', () => {
    const src = read(LAYOUT);

    // There are two initIAP registrations — one for the cold-boot path and one
    // for the post-sign-in path. Both call validatePurchase and both throw on
    // refusal. A fix applied to one of them is not a fix.
    const throwSites = src.split('validate-purchase did not grant entitlement').length - 1;
    expect(throwSites).toBeGreaterThanOrEqual(2);

    const setSites = src.split('setFailedPurchase({ productId })').length - 1;
    expect(setSites).toBe(throwSites);

    // …and the set must come BEFORE the throw in each block, or the throw
    // unwinds past it.
    for (const chunk of src.split('validate-purchase did not grant entitlement').slice(0, -1)) {
      const tail = chunk.slice(-400);
      expect(tail).toContain('setFailedPurchase({ productId })');
    }
  });

  it('still throws, so the store replays the unfinished purchase', () => {
    // Setting the flag must not become a substitute for rejecting. iapService
    // only skips finishTransaction when this callback REJECTS; resolving would
    // consume the receipt and entitle nobody.
    const src = read(LAYOUT);
    const sets = src.split('setFailedPurchase({ productId });').length - 1;
    expect(sets).toBeGreaterThanOrEqual(2);

    // EVERY site, not one of them. A first draft of this asserted a single
    // match and a mutation that removed the throw from one registration walked
    // straight past it, because the other registration still satisfied the
    // regex.
    const followedByThrow = (src.match(/setFailedPurchase\(\{ productId \}\);\s*\n\s*throw new Error\(/g) ?? []).length;
    expect(followedByThrow).toBe(sets);
  });

  it('the screen reads the flag and renders something for it', () => {
    const src = read(SCREEN);
    expect(src).toContain('useSubscriptionStore((s) => s.failedPurchase)');
    expect(src).toMatch(/\{failedPurchase && \(/);
  });

  it('the banner does not tell a charged user to buy again', () => {
    // The one instruction that would make this materially worse.
    const src = read(SCREEN);
    const banner = src.slice(src.indexOf('{failedPurchase && ('), src.indexOf('{failedPurchase && (') + 900);
    expect(banner).toMatch(/don't buy again/i);
    expect(banner).not.toMatch(/try again|purchase again|retry/i);
  });

  it('entitlement arriving clears it', () => {
    const src = read(STORE);
    // The success branch of validatePurchase writes the tier; it must drop the
    // failure with it, or a banner outlives the problem it describes.
    const successBlock = src.slice(src.indexOf('const resolvedTier'), src.indexOf('const resolvedTier') + 400);
    expect(successBlock).toContain('failedPurchase: null');
  });

  it('signing out clears it', () => {
    const src = read(STORE);
    // Anchor on the IMPLEMENTATION, not the interface declaration that
    // appears first in the file — matching that proves nothing about runtime.
    const at = src.indexOf('clearSubscription: () => set({');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 400);
    expect(block).toContain('failedPurchase: null');
  });

  it('is not persisted', () => {
    // Same reasoning as pendingPurchase: a stale "we owe you a plan" surviving
    // a restart, after the replay already fixed it, is worse than losing it.
    const src = read(STORE);
    const partialize = src.slice(src.indexOf('partialize: (state) => ({'), src.indexOf('partialize: (state) => ({') + 500);
    expect(partialize).not.toContain('failedPurchase');
  });

  it('the flag is declared on the state, not just written ad hoc', () => {
    const src = read(STORE);
    expect(src).toMatch(/failedPurchase: \{ productId: string; sinceMs: number \} \| null;/);
    expect(src).toMatch(/setFailedPurchase: \(info: \{ productId: string \} \| null\) => void;/);
  });
});
