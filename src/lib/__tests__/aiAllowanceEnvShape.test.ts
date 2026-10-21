/**
 * A malformed allowance secret must not silently remove the cap.
 *
 * WHY THIS FILE EXISTS
 * `_cost.ts` read every cents figure as `Number(Deno.env.get(NAME) ?? default)`,
 * which defends against a MISSING secret and nothing else. Every other shape a
 * secret can actually take fails OPEN:
 *
 *   ""          -> Number('') === 0   -> allowance 0 -> the `allowanceMC > 0`
 *                                        guard never runs -> no cap
 *   "   "       -> 0, same
 *   "$12"       -> NaN -> `userSpend >= NaN` is false -> no cap
 *   "12.00 USD" -> NaN -> no cap
 *   "1,000"     -> NaN on AIMEE_MONTHLY_BUDGET_CENTS -> no runaway breaker
 *
 * Same class as GOOGLE_SERVICE_ACCOUNT_JSON being a three-character
 * documentation placeholder that passed `if (!VALUE)`: the check asked whether
 * the value existed, not whether it was a value.
 *
 * The one shape that must still WORK is a trailing newline — a paste into a
 * secrets UI adds one, and a trailing `\n` on an API key has already cost this
 * codebase a multi-hour outage elsewhere.
 */
import path from 'node:path';

const COST = path.join(__dirname, '..', '..', '..', 'supabase', 'functions', 'aimee-chat-stream', '_cost.ts');

const MC_PER_CENT = 1_000_000;
const USER = 'u-1';
const SENTINEL = '00000000-0000-0000-0000-000000000000';

/**
 * Shape of the module under test, DECLARED rather than `typeof import(...)`:
 * tsconfig excludes supabase/functions (it is Deno, not React Native), and a
 * type-position import drags it back into the program, where every
 * `Deno.env.get` becomes a typecheck error. The module is loaded at RUNTIME by
 * absolute path, under a Deno shim.
 */
interface Cost {
  monthlyCentsForTier(tier: string): number;
  SYSTEM_MONTHLY_CENTS: number;
  checkCostCap(
    supabase: unknown,
    userId: string,
    tier: string,
  ): Promise<{ allowed: boolean; reason?: string }>;
}

function load(env: Record<string, string>): { mod: Cost; errors: string[] } {
  jest.resetModules();
  const errors: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
  });
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
  const mod = require(COST) as Cost;
  spy.mockRestore();
  return { mod, errors };
}

/** A ledger where the user has spent $50 and the system $100,000. */
const fakeSupabase = (userCents: number, globalCents: number) => ({
  from: () => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte']) c[m] = () => c;
    c.then = (res: any, rej: any) =>
      Promise.resolve({
        data: [
          { user_id: USER, spend_microcents: userCents * MC_PER_CENT },
          { user_id: SENTINEL, spend_microcents: globalCents * MC_PER_CENT },
        ],
        error: null,
      }).then(res, rej);
    c.maybeSingle = async () => ({ data: { balance_microcents: 0 }, error: null });
    return c;
  },
  rpc: async () => ({ data: null, error: null }),
});

afterAll(() => {
  delete (globalThis as any).Deno;
});

describe('AIMEE_MONTHLY_CENTS_PRO, every shape a secret can take', () => {
  const DEFAULT_PRO = 1200;

  const cases: { label: string; env: Record<string, string>; cents: number; logs: boolean }[] = [
    { label: 'unset', env: {}, cents: DEFAULT_PRO, logs: false },
    { label: 'empty string', env: { AIMEE_MONTHLY_CENTS_PRO: '' }, cents: DEFAULT_PRO, logs: true },
    { label: 'whitespace only', env: { AIMEE_MONTHLY_CENTS_PRO: '  ' }, cents: DEFAULT_PRO, logs: true },
    { label: 'a dollar sign', env: { AIMEE_MONTHLY_CENTS_PRO: '$12' }, cents: DEFAULT_PRO, logs: true },
    { label: 'a currency suffix', env: { AIMEE_MONTHLY_CENTS_PRO: '12.00 USD' }, cents: DEFAULT_PRO, logs: true },
    { label: 'a thousands comma', env: { AIMEE_MONTHLY_CENTS_PRO: '1,000' }, cents: DEFAULT_PRO, logs: true },
    { label: 'negative', env: { AIMEE_MONTHLY_CENTS_PRO: '-500' }, cents: DEFAULT_PRO, logs: true },
    { label: 'zero (no tier may have no cap)', env: { AIMEE_MONTHLY_CENTS_PRO: '0' }, cents: DEFAULT_PRO, logs: true },
    { label: 'trailing newline', env: { AIMEE_MONTHLY_CENTS_PRO: '1200\n' }, cents: 1200, logs: false },
    { label: 'plain', env: { AIMEE_MONTHLY_CENTS_PRO: '800' }, cents: 800, logs: false },
    { label: 'decimal', env: { AIMEE_MONTHLY_CENTS_PRO: '12.5' }, cents: 12.5, logs: false },
  ];

  it.each(cases)('$label -> $cents cents', ({ env, cents, logs }) => {
    const { mod, errors } = load(env);
    expect(mod.monthlyCentsForTier('pro')).toBe(cents);
    expect(errors.length > 0).toBe(logs);
    if (logs) expect(errors.join('\n')).toContain('AIMEE_MONTHLY_CENTS_PRO');
  });

  it.each(cases.filter((c) => c.cents === 1200 || c.cents === 800 || c.cents === 12.5))(
    '$label still refuses an account that has spent $50',
    async ({ env }) => {
      const { mod } = load(env);
      const r = await mod.checkCostCap(fakeSupabase(5000, 0), USER, 'pro');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('user_cap_hit');
    },
  );

  it('an unknown tier still gets no allowance, and no error is logged for it', () => {
    const { mod, errors } = load({});
    expect(mod.monthlyCentsForTier('enterprise')).toBe(0);
    expect(errors).toEqual([]);
  });

  it('plus and free are validated the same way', () => {
    const { mod } = load({ AIMEE_MONTHLY_CENTS_PLUS: '', AIMEE_MONTHLY_CENTS_FREE: '$1' });
    expect(mod.monthlyCentsForTier('plus')).toBe(300);
    expect(mod.monthlyCentsForTier('free')).toBe(25);
  });

  it('is parsed once, not per request: a bad secret logs at load, not on every call', async () => {
    const { mod, errors } = load({ AIMEE_MONTHLY_CENTS_PRO: '$12' });
    const atLoad = errors.length;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) await mod.checkCostCap(fakeSupabase(0, 0), USER, 'pro');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(atLoad).toBe(1);
  });
});

describe('AIMEE_MONTHLY_BUDGET_CENTS, the system-wide runaway breaker', () => {
  const DEFAULT_BUDGET = 100_000; // $1,000

  it.each([
    { label: 'unset', env: {}, cents: DEFAULT_BUDGET },
    { label: 'empty string', env: { AIMEE_MONTHLY_BUDGET_CENTS: '' }, cents: DEFAULT_BUDGET },
    { label: 'a thousands comma', env: { AIMEE_MONTHLY_BUDGET_CENTS: '1,000' }, cents: DEFAULT_BUDGET },
    { label: 'a dollar sign', env: { AIMEE_MONTHLY_BUDGET_CENTS: '$100000' }, cents: DEFAULT_BUDGET },
    { label: 'trailing newline', env: { AIMEE_MONTHLY_BUDGET_CENTS: '50000\n' }, cents: 50_000 },
  ])('$label -> $cents cents', ({ env, cents }) => {
    const { mod } = load(env as Record<string, string>);
    expect(mod.SYSTEM_MONTHLY_CENTS).toBe(cents);
  });

  it('an explicit "0" still disables the breaker, as documented', () => {
    const { mod, errors } = load({ AIMEE_MONTHLY_BUDGET_CENTS: '0' });
    expect(mod.SYSTEM_MONTHLY_CENTS).toBe(0);
    expect(errors).toEqual([]);
  });

  it('an empty secret does NOT disable the breaker: $100,000 of global spend is refused', async () => {
    const { mod } = load({ AIMEE_MONTHLY_BUDGET_CENTS: '' });
    const r = await mod.checkCostCap(fakeSupabase(0, 10_000_000), USER, 'pro');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('global_cap_hit');
  });

  it('a comma-formatted secret does NOT disable the breaker either', async () => {
    const { mod } = load({ AIMEE_MONTHLY_BUDGET_CENTS: '1,000' });
    const r = await mod.checkCostCap(fakeSupabase(0, 10_000_000), USER, 'pro');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('global_cap_hit');
  });
});
