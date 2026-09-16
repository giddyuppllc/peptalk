/**
 * A refused Aimee request must offer a path that actually works — and must
 * offer nothing when none does.
 *
 * WHY (Edward, 2026-09-16: "wire up the credit packs for pro")
 * A Pro subscriber who exhausted the monthly cost cap got a bare refusal. The
 * server only set `upgrade` for free and plus — correctly, since Pro has no
 * higher plan — and nothing else was ever offered, so the one remedy that
 * does exist for them (a credit pack, which `checkCostCap` already spends
 * before refusing, for every tier) was invisible.
 *
 * THE TRAP THIS GUARDS
 * Credits raise the monthly COST ceiling and nothing else. The per-message
 * rate limit (RATE_LIMITS in aimee-chat-stream) never reads the credit
 * balance, and neither does the system-wide runaway breaker. Offering a pack
 * against either of those walls would take money for something that cannot
 * unblock the buyer — named in _shared/credits.ts as this codebase's
 * recurring failure. So the server must not set `topUp` there, and the two
 * source assertions at the bottom pin that it does not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { aimeeDenialOffer, DENIAL_COPY } from '../aimeeDenialActions';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('aimeeDenialOffer', () => {
  it('offers nothing when neither signal is set', () => {
    // The message limit, the global breaker, a transport error. A button here
    // would lead to a screen that cannot help.
    expect(aimeeDenialOffer({})).toEqual({});
    expect(aimeeDenialOffer({ upgrade: false, topUp: false })).toEqual({});
  });

  it('offers only a plan to a tier that has one', () => {
    const o = aimeeDenialOffer({ upgrade: true, topUp: false });
    expect(o.quickReplies).toEqual([DENIAL_COPY.plansQuickReply]);
    expect(o.actions).toHaveLength(1);
    expect(o.actions?.[0].label).toBe(DENIAL_COPY.plansAction);
    expect(o.navAction).toBe('/subscription');
  });

  it('offers a top-up to Pro, which has no plan to move to', () => {
    const o = aimeeDenialOffer({ upgrade: false, topUp: true });
    expect(o.quickReplies).toEqual([DENIAL_COPY.topUpQuickReply]);
    expect(o.actions).toHaveLength(1);
    expect(o.actions?.[0].label).toBe(DENIAL_COPY.topUpAction);
    // The shelf lives on /subscription, which owns the per-platform rail —
    // so the native app still never links out to Square.
    expect(o.navAction).toBe('/subscription');
  });

  it('offers both to free/plus at the cost cap, plan first', () => {
    const o = aimeeDenialOffer({ upgrade: true, topUp: true });
    expect(o.actions?.map((a) => a.label)).toEqual([
      DENIAL_COPY.plansAction,
      DENIAL_COPY.topUpAction,
    ]);
  });

  it('treats non-boolean truthiness as absent', () => {
    // errBody is parsed JSON from the network; a string "false" or a 1 must
    // not become an offer.
    expect(aimeeDenialOffer({ upgrade: 'yes' as unknown as boolean })).toEqual({});
    expect(aimeeDenialOffer({ topUp: 1 as unknown as boolean })).toEqual({});
  });

  it('every route it can emit is the subscription screen', () => {
    for (const flags of [
      { upgrade: true },
      { topUp: true },
      { upgrade: true, topUp: true },
    ]) {
      const o = aimeeDenialOffer(flags);
      for (const a of o.actions ?? []) expect(a.route).toBe('/subscription');
    }
  });
});

describe('the server only promises a top-up where credits can deliver one', () => {
  const allowance = () => read('supabase/functions/_shared/aiAllowance.ts');
  const stream = () => read('supabase/functions/aimee-chat-stream/index.ts');

  it('sets topUp on the user cost cap', () => {
    expect(allowance()).toContain("topUp: cost.reason === 'user_cap_hit'");
    expect(stream()).toContain("topUp: costCheck.reason === 'user_cap_hit'");
  });

  it('never sets topUp on the per-message rate limit', () => {
    // The rate-limit refusal is the jsonError carrying `retryAfter:
    // rateLimit.retryAfter`. Credits do not move that wall.
    const src = stream();
    const i = src.indexOf('rateLimit.retryAfter');
    expect(i).toBeGreaterThan(-1);
    // Inspect the whole jsonError call that contains it.
    const start = src.lastIndexOf('jsonError(', i);
    expect(start).toBeGreaterThan(-1);
    const call = src.slice(start, src.indexOf('});', i));
    expect(call).not.toContain('topUp');
  });

  it('never offers a plan or a top-up past the system-wide breaker', () => {
    // global_cap_hit is not the user's to buy past. Both flags are written as
    // an equality against user_cap_hit, so neither can be true for it — this
    // asserts no one has added a bare `topUp: true` anywhere.
    for (const src of [allowance(), stream()]) {
      for (const line of src.split('\n')) {
        if (!line.includes('topUp') && !line.includes('upgrade:')) continue;
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue;
        if (line.includes('topUp: true') || line.includes('upgrade: true')) {
          // The one legitimate bare `upgrade: true` is the 403 for a tier with
          // no Aimee access at all, where a plan genuinely is the fix.
          expect(line).toContain('403');
        }
      }
    }
  });

  it('anti-vacuity: the files really do contain these decisions', () => {
    expect(allowance()).toContain('user_cap_hit');
    expect(stream()).toContain('user_cap_hit');
    expect(stream().split('jsonError(').length - 1).toBeGreaterThanOrEqual(3);
  });
});
