/**
 * A grant that does not renew must not get the renewal grace.
 *
 * `resolveEffectiveTier` honours a 3-day window past `expires_at`. It exists
 * for exactly one reason: at an auto-renewal boundary the row keeps
 * `is_active = true` while its stored `expires_at` is still the OLD period end,
 * until DID_RENEW / RTDN lands. Without the window every renewing payer would
 * be downgraded during that gap.
 *
 * A trial has no renewal, so it has no lag to absorb — and grace silently
 * extends it. A 7-day trial written as `expires_at = now + 7 days` would grant
 * Pro for TEN. On something whose whole length is seven days that is not a
 * rounding error, it is a 43% overrun given away to every user.
 *
 * The decision under test is `isRowLive`. Everything else in that module needs
 * a Supabase client to exercise, which is why the part that actually decides
 * whether somebody keeps paid access had no test of its own until now.
 *
 * The file is imported through a source read rather than an import: it is a
 * Deno edge-function module and jest here is Node. What is asserted is the
 * behaviour of the real function, evaluated in-process.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'supabase/functions/_shared/effectiveTier.ts');

type Row = { tier: string | null; expires_at: string | null; renews?: boolean | null };

/**
 * Pull `isRowLive` and `GRACE_MS` out of the Deno module and evaluate them.
 *
 * Deliberately NOT a re-implementation. A copy of the logic in the test would
 * pass forever while the real resolver drifted away from it, which is the exact
 * failure this repo keeps finding in its own checks.
 */
function loadIsRowLive(): { isRowLive: (r: Row, now: number) => boolean; graceMs: number } {
  const src = fs.readFileSync(SRC, 'utf8');

  const graceMatch = src.match(/const GRACE_MS = ([^;]+);/);
  if (!graceMatch) throw new Error('GRACE_MS not found — effectiveTier.ts has moved on');

  const fnMatch = src.match(/export function isRowLive\(row: SubscriptionRow, now: number\): boolean \{[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('isRowLive not found — effectiveTier.ts has moved on');

  const body = fnMatch[0]
    .replace('export function isRowLive(row: SubscriptionRow, now: number): boolean', 'function isRowLive(row, now)');

  const make = new Function(`const GRACE_MS = ${graceMatch[1]};\n${body}\nreturn { isRowLive, GRACE_MS };`);
  const out = make();
  return { isRowLive: out.isRowLive, graceMs: out.GRACE_MS };
}

const { isRowLive, graceMs } = loadIsRowLive();
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(ms).toISOString();

describe('the grace window itself', () => {
  it('is three days — the figure the trial length is reasoned against', () => {
    expect(graceMs).toBe(3 * DAY);
  });
});

describe('a renewing subscription keeps its grace', () => {
  it('is live inside the window past expiry', () => {
    expect(isRowLive({ tier: 'pro', expires_at: at(NOW - 2 * DAY) }, NOW)).toBe(true);
  });

  it('is dead once it falls past the window', () => {
    expect(isRowLive({ tier: 'pro', expires_at: at(NOW - 4 * DAY) }, NOW)).toBe(false);
  });

  it('treats an absent `renews` exactly as it treated a row before the column existed', () => {
    // The column is NOT NULL DEFAULT TRUE, but a caller that does not select it
    // hands back undefined. That must not silently cost a payer their grace.
    const past = at(NOW - 2 * DAY);
    expect(isRowLive({ tier: 'pro', expires_at: past }, NOW)).toBe(true);
    expect(isRowLive({ tier: 'pro', expires_at: past, renews: undefined }, NOW)).toBe(true);
    expect(isRowLive({ tier: 'pro', expires_at: past, renews: null }, NOW)).toBe(true);
    expect(isRowLive({ tier: 'pro', expires_at: past, renews: true }, NOW)).toBe(true);
  });
});

describe('a grant that does not renew ends when it says it ends', () => {
  it('is dead the moment it expires — no grace', () => {
    expect(isRowLive({ tier: 'pro', expires_at: at(NOW - 1), renews: false }, NOW)).toBe(false);
  });

  it('is still live a second before', () => {
    expect(isRowLive({ tier: 'pro', expires_at: at(NOW + 1), renews: false }, NOW)).toBe(true);
  });

  it('a 7-day trial lasts 7 days, not 10', () => {
    const granted = NOW;
    const expires = at(granted + 7 * DAY);
    const trial = { tier: 'pro', expires_at: expires, renews: false };

    expect(isRowLive(trial, granted + 6 * DAY)).toBe(true);
    expect(isRowLive(trial, granted + 7 * DAY - 1)).toBe(true);
    expect(isRowLive(trial, granted + 7 * DAY + 1)).toBe(false);
    // The whole point: with grace it would still be live here.
    expect(isRowLive(trial, granted + 9 * DAY)).toBe(false);

    // And the same row WITH renews omitted would indeed run to ten — this is
    // the bug, pinned, so nobody removes the flag thinking it changes nothing.
    const asRenewing = { tier: 'pro', expires_at: expires };
    expect(isRowLive(asRenewing, granted + 9 * DAY)).toBe(true);
  });
});

describe('what is never live', () => {
  it('a null expiry — only failure paths write one', () => {
    expect(isRowLive({ tier: 'pro', expires_at: null }, NOW)).toBe(false);
    expect(isRowLive({ tier: 'pro', expires_at: null, renews: false }, NOW)).toBe(false);
  });

  it('an unparseable expiry', () => {
    // Reading a corrupt date as live would grant Pro indefinitely off one bad
    // value — the same shape as the crash fixes elsewhere in this branch, with
    // entitlement as the consequence instead of a throw.
    for (const bad of ['nonsense', '', '2026-13-45', 'null']) {
      expect(isRowLive({ tier: 'pro', expires_at: bad }, NOW)).toBe(false);
      expect(isRowLive({ tier: 'pro', expires_at: bad, renews: false }, NOW)).toBe(false);
    }
  });
});

describe('the resolver actually uses it', () => {
  it('selects `renews` and routes every row through isRowLive', () => {
    // A pure function nothing calls is the shape of most of this repo's bugs.
    const src = fs.readFileSync(SRC, 'utf8');
    expect(src).toContain("select('tier, expires_at, renews')");
    expect(src).toMatch(/if \(!isRowLive\(row, now\)\) continue;/);
    // …and no second, open-coded expiry test left behind beside it.
    const afterQuery = src.slice(src.indexOf('const now = Date.now();'));
    expect(afterQuery).not.toMatch(/getTime\(\) <= /);
  });
});
