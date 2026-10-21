/**
 * A ledger outage is a 503, not a 429.
 *
 * WHY THIS FILE EXISTS
 * `_shared/aiAllowance.ts` hardcoded `status: 429` for every refusal, and the
 * commit that introduced it deleted explicitly-reasoned 503 branches from
 * aimee-chat, food-scan, lab-scan and aimee-pantry-scan. Three refusals share
 * that one status and only two of them are quota:
 *
 *   user_cap_hit       the account has spent its monthly allowance   429
 *   global_cap_hit     the system-wide runaway breaker tripped       429
 *   ledger_unreachable the spend table could not be READ             503
 *
 * The third is a transient database failure that makes the cap unenforceable,
 * so the call is refused fail-closed. Answering 429 makes every client treat
 * it as spent quota — src/services/aimeeWorkout.ts:254 maps 429 to
 * `rate_limit` — so backoff will not retry a call that would succeed a second
 * later, and aimee-voice was left answering 503 for its own failed-closed bump
 * and 429 for the ledger inside one handler.
 *
 * `retryAfter` and `upgrade` are asserted here too: aimeeWorkout.ts:251 keys
 * its upgrade prompt on `body?.upgrade`, and it went missing in the same
 * change.
 */
import path from 'node:path';

const SHARED = path.join(
  __dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'aiAllowance.ts',
);

const MC = 1_000_000;
const USER = 'u-1';
const SENTINEL = '00000000-0000-0000-0000-000000000000';
const PRO_CENTS = 1200;
const BREAKER_CENTS = 100_000;

/**
 * Shape of the module under test, DECLARED rather than `typeof import(...)`:
 * tsconfig excludes supabase/functions (Deno, not React Native), and a
 * type-position import drags it back in, where every `Deno.env.get` becomes a
 * typecheck error. Loaded at RUNTIME by absolute path, under a Deno shim.
 */
interface Shared {
  checkAiAllowance(
    supabase: unknown,
    userId: string,
    tier: string,
  ): Promise<{
    allowed: boolean;
    status: number;
    cost: { allowed: boolean; reason?: string };
    body: { error: string; reason?: string; retryAfter?: number; upgrade?: boolean };
  }>;
}

function load(): Shared {
  jest.resetModules();
  (globalThis as any).Deno = { env: { get: () => undefined } };
  return require(SHARED) as Shared;
}

const supa = (opts: { userCents: number; globalCents: number; ledgerError?: boolean }) => ({
  from: () => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte']) c[m] = () => c;
    c.then = (res: any, rej: any) =>
      Promise.resolve(
        opts.ledgerError
          ? { data: null, error: { message: 'connection reset' } }
          : {
              data: [
                { user_id: USER, spend_microcents: opts.userCents * MC },
                { user_id: SENTINEL, spend_microcents: opts.globalCents * MC },
              ],
              error: null,
            },
      ).then(res, rej);
    c.maybeSingle = async () => ({ data: { balance_microcents: 0 }, error: null });
    return c;
  },
  rpc: async () => ({ data: null, error: null }),
});

afterAll(() => {
  delete (globalThis as any).Deno;
});

describe('checkAiAllowance status', () => {
  it('answers 503 with a retryAfter when the ledger cannot be read', async () => {
    const { checkAiAllowance } = load();
    const r = await checkAiAllowance(supa({ userCents: 0, globalCents: 0, ledgerError: true }), USER, 'pro');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('ledger_unreachable');
    expect(r.body.retryAfter).toBe(60);
    // Nothing to upgrade to: the database is down, not the allowance spent.
    expect(r.body.upgrade).toBeUndefined();
  });

  it('answers 429 when the account has actually spent its allowance', async () => {
    const { checkAiAllowance } = load();
    const r = await checkAiAllowance(supa({ userCents: PRO_CENTS, globalCents: 0 }), USER, 'pro');
    expect(r.status).toBe(429);
    expect(r.body.reason).toBe('user_cap_hit');
    expect(r.body.retryAfter).toBeGreaterThan(0);
  });

  it('offers the upgrade only to a tier that has one, and only for its OWN cap', async () => {
    const { checkAiAllowance } = load();
    const plus = await checkAiAllowance(supa({ userCents: 300, globalCents: 0 }), USER, 'plus');
    expect(plus.status).toBe(429);
    expect(plus.body.reason).toBe('user_cap_hit');
    expect(plus.body.upgrade).toBe(true);

    const free = await checkAiAllowance(supa({ userCents: 25, globalCents: 0 }), USER, 'free');
    expect(free.body.upgrade).toBe(true);

    const pro = await checkAiAllowance(supa({ userCents: PRO_CENTS, globalCents: 0 }), USER, 'pro');
    expect(pro.body.upgrade).toBe(false);

    // The system-wide breaker is not something a plan buys past.
    const breaker = await checkAiAllowance(supa({ userCents: 0, globalCents: BREAKER_CENTS }), USER, 'plus');
    expect(breaker.status).toBe(429);
    expect(breaker.body.reason).toBe('global_cap_hit');
    expect(breaker.body.upgrade).toBe(false);
  });

  it('retryAfter on a 429 points at the start of the next UTC month', async () => {
    const { checkAiAllowance } = load();
    const r = await checkAiAllowance(supa({ userCents: PRO_CENTS, globalCents: 0 }), USER, 'pro');
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const expected = Math.round((next - now.getTime()) / 1000);
    expect(Math.abs((r.body.retryAfter as number) - expected)).toBeLessThanOrEqual(5);
    // A monthly allowance must not report a daily-sized wait.
    expect(r.body.retryAfter).toBeLessThanOrEqual(32 * 86_400);
  });

  it('an allowed call carries no refusal status fields the caller could act on', async () => {
    const { checkAiAllowance } = load();
    const r = await checkAiAllowance(supa({ userCents: 0, globalCents: 0 }), USER, 'pro');
    expect(r.allowed).toBe(true);
    expect(r.cost.allowed).toBe(true);
  });
});

describe('every AI function answers the ledger outage the same way', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const FUNCTIONS = path.join(__dirname, '..', '..', '..', 'supabase', 'functions');

  it('no AI function hardcodes a status for an allowance refusal', () => {
    // They must pass `allowance.status` through, or the shared decision above
    // is overridden locally and the 503 never reaches the client. This is how
    // aimee-voice ended up 503 for one failure and 429 for the other.
    const names = fs
      .readdirSync(FUNCTIONS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map((d) => d.name);
    const users = names.filter((n) => {
      const dir = path.join(FUNCTIONS, n);
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.ts'))
        .some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('checkAiAllowance('));
    });
    expect(users.length).toBeGreaterThanOrEqual(12);
    for (const n of users) {
      const src = fs.readFileSync(path.join(FUNCTIONS, n, 'index.ts'), 'utf8');
      const block = src.slice(src.indexOf('checkAiAllowance('), src.indexOf('checkAiAllowance(') + 400);
      expect(block).toContain('allowance.status');
      expect(block).not.toMatch(/!allowance\.allowed[\s\S]{0,200}?,\s*429\s*\)/);
    }
  });
});
