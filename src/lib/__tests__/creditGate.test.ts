/**
 * The cost gate, EXERCISED — not grepped.
 *
 * WHY THIS FILE EXISTS
 * creditPacks.test.ts asserts that `_cost.ts` mentions `readCreditBalance` and
 * `usingCredits`. A mutation proved that insufficient: changing the decision to
 * `if (false)` — which stops credits working entirely, so a user who paid stays
 * blocked — left every one of those string assertions passing. A guard that
 * only checks a symbol is present cannot see what the code DOES with it.
 *
 * So this runs the real `checkCostCap` and `recordSpend` against a fake
 * Supabase client and asserts on outcomes: allowed vs denied, and the exact
 * number of microcents drawn from credits.
 *
 * `_cost.ts` is Deno source. It reads `Deno.env.get` at module scope, so the
 * shim below has to be installed BEFORE the import — hence require() inside
 * the setup rather than a top-level import.
 */

/** Minimal Deno shim so the edge module can be loaded under jest. */
function installDenoShim(env: Record<string, string> = {}) {
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
}

type Row = { user_id: string; spend_microcents: number };

/**
 * A fake PostgREST client covering only what _cost.ts touches.
 *
 * `creditBalance: 'error'` simulates an unreadable balance, which must fail
 * closed rather than deny a paying customer for the wrong reason.
 */
function makeSupabase(opts: {
  usageRows?: Row[];
  usageError?: boolean;
  creditBalance?: number | 'error' | 'missing';
  onRpc?: (name: string, args: any) => void;
}) {
  return {
    from(table: string) {
      if (table === 'aimee_cost_cents') {
        const chain: any = {
          select: () => chain,
          in: () => chain,
          gte: () =>
            Promise.resolve(
              opts.usageError
                ? { data: null, error: { message: 'boom' } }
                : { data: opts.usageRows ?? [], error: null },
            ),
        };
        return chain;
      }
      if (table === 'ai_credit_balance') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => {
            if (opts.creditBalance === 'error') {
              return Promise.resolve({ data: null, error: { message: 'boom' } });
            }
            if (opts.creditBalance === 'missing' || opts.creditBalance === undefined) {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({
              data: { balance_microcents: opts.creditBalance },
              error: null,
            });
          },
        };
        return chain;
      }
      // recordSpend's ledger write — accept and ignore.
      const noop: any = {
        select: () => noop,
        eq: () => noop,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
      return noop;
    },
    rpc(name: string, args: any) {
      opts.onRpc?.(name, args);
      return Promise.resolve({ data: 0, error: null });
    },
  };
}

const MC = 1_000_000; // microcents per cent
const USER = 'user-1';

// Plus allowance = 300 cents by default, per _cost.ts.
const PLUS_ALLOWANCE_MC = 300 * MC;

function loadCost() {
  jest.resetModules();
  installDenoShim({});
  return require('../../../supabase/functions/aimee-chat-stream/_cost.ts');
}

describe('a user inside their allowance is simply allowed', () => {
  it('allows and reports no credit use', async () => {
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({
      usageRows: [{ user_id: USER, spend_microcents: 10 * MC }],
    });
    const res = await checkCostCap(supa, USER, 'plus');
    expect(res.allowed).toBe(true);
    expect(res.usingCredits).toBeUndefined();
  });
});

describe('a user OVER their allowance depends entirely on credits', () => {
  it('is DENIED with no credits', async () => {
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({
      usageRows: [{ user_id: USER, spend_microcents: PLUS_ALLOWANCE_MC + 5 * MC }],
      creditBalance: 0,
    });
    const res = await checkCostCap(supa, USER, 'plus');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('user_cap_hit');
  });

  it('is DENIED when they have never bought a pack (no balance row)', async () => {
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({
      usageRows: [{ user_id: USER, spend_microcents: PLUS_ALLOWANCE_MC + 5 * MC }],
      creditBalance: 'missing',
    });
    const res = await checkCostCap(supa, USER, 'plus');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('user_cap_hit');
  });

  it('is ALLOWED when they bought credits', async () => {
    // THE POINT OF THE WHOLE FEATURE. If this ever returns false, someone paid
    // for a pack that does nothing.
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({
      usageRows: [{ user_id: USER, spend_microcents: PLUS_ALLOWANCE_MC + 5 * MC }],
      creditBalance: 200 * MC,
    });
    const res = await checkCostCap(supa, USER, 'plus');
    expect(res.allowed).toBe(true);
    expect(res.usingCredits).toBe(true);
    expect(res.creditBalanceMC).toBe(200 * MC);
  });

  it('FAILS CLOSED when the balance cannot be read', async () => {
    // Not "denied for cap" and not "allowed anyway": we do not know whether
    // they are entitled, so we say so.
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({
      usageRows: [{ user_id: USER, spend_microcents: PLUS_ALLOWANCE_MC + 5 * MC }],
      creditBalance: 'error',
    });
    const res = await checkCostCap(supa, USER, 'plus');
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('ledger_unreachable');
  });
});

describe('free tier has an allowance, so credits apply to it too', () => {
  it('allows a free user inside the small backstop', async () => {
    const { checkCostCap } = loadCost();
    const supa = makeSupabase({ usageRows: [] });
    const res = await checkCostCap(supa, USER, 'free');
    expect(res.allowed).toBe(true);
    // Free is metered on message COUNT; the cents figure is only a backstop,
    // so it must be non-zero or the ceiling would never bind.
    expect(res.allowanceMC).toBeGreaterThan(0);
  });
});

describe('credits are drawn down for exactly the overage', () => {
  it('takes nothing while the turn stays inside the allowance', async () => {
    const { recordSpend } = loadCost();
    const calls: any[] = [];
    const supa = makeSupabase({ onRpc: (n, a) => calls.push([n, a]) });
    await recordSpend(supa, USER, 5 * MC, {
      allowanceMC: PLUS_ALLOWANCE_MC,
      priorSpendMC: 10 * MC,
    });
    expect(calls.filter((c) => c[0] === 'consume_ai_credits')).toHaveLength(0);
  });

  it('takes only the part of a straddling turn that crossed the line', async () => {
    // Prior spend 2 cents below the allowance, this turn costs 5 cents:
    // 2 cents are covered by the plan, 3 cents must come from credits.
    const { recordSpend } = loadCost();
    const calls: any[] = [];
    const supa = makeSupabase({ onRpc: (n, a) => calls.push([n, a]) });
    await recordSpend(supa, USER, 5 * MC, {
      allowanceMC: PLUS_ALLOWANCE_MC,
      priorSpendMC: PLUS_ALLOWANCE_MC - 2 * MC,
    });
    const consume = calls.find((c) => c[0] === 'consume_ai_credits');
    expect(consume).toBeDefined();
    expect(consume[1].p_microcents).toBe(3 * MC);
  });

  it('takes the whole turn once fully past the allowance', async () => {
    const { recordSpend } = loadCost();
    const calls: any[] = [];
    const supa = makeSupabase({ onRpc: (n, a) => calls.push([n, a]) });
    await recordSpend(supa, USER, 4 * MC, {
      allowanceMC: PLUS_ALLOWANCE_MC,
      priorSpendMC: PLUS_ALLOWANCE_MC + 50 * MC,
    });
    const consume = calls.find((c) => c[0] === 'consume_ai_credits');
    expect(consume[1].p_microcents).toBe(4 * MC);
  });

  it('takes nothing when the caller supplies no allowance context', async () => {
    // Callers with no allowance concept must not accidentally burn credits.
    const { recordSpend } = loadCost();
    const calls: any[] = [];
    const supa = makeSupabase({ onRpc: (n, a) => calls.push([n, a]) });
    await recordSpend(supa, USER, 9 * MC);
    expect(calls.filter((c) => c[0] === 'consume_ai_credits')).toHaveLength(0);
  });
});
