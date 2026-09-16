/**
 * The monthly spend ledger must not lose concurrent increments.
 *
 * WHY THIS FILE EXISTS
 * `recordSpend` in supabase/functions/aimee-chat-stream/_cost.ts read the row,
 * added this call's microcents in JavaScript, and upserted the result. Two
 * calls that overlap both read the same "before" value and both write
 * before+delta: one increment is lost. Measured against an in-memory table
 * driven by the module's own code, ten concurrent calls recorded ONE.
 *
 * That was survivable while only the chat stream wrote here. It is not now:
 * every AI edge function records through _shared/aiAllowance.ts, and the
 * GLOBAL SENTINEL row is written by every AI call from every user — so the
 * hottest row in the schema is the one the AIMEE_MONTHLY_BUDGET_CENTS runaway
 * breaker reads. A breaker that undercounts by an order of magnitude is not a
 * breaker; it is the only cap on twelve functions, reporting a tenth of the
 * spend.
 *
 * WHAT THIS TEST DOES
 * Runs the REAL recordSpend against a fake Supabase client backed by an
 * in-memory table whose reads and writes each yield to the event loop — which
 * is what makes two overlapping calls interleave, exactly as two edge-function
 * invocations do. The `bump_aimee_spend` RPC is modelled the way Postgres
 * behaves: the read and the addition happen together, under the row lock, with
 * no await between them.
 *
 * It is not a structural scan. A scan for the string `rpc(` would pass a
 * function that called the RPC and then overwrote the row.
 */
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const COST = path.join(ROOT, 'supabase', 'functions', 'aimee-chat-stream', '_cost.ts');

const USER = '11111111-1111-1111-1111-111111111111';
const SENTINEL = '00000000-0000-0000-0000-000000000000';
const DELTA = 7_000; // microcents per call

type Row = { user_id: string; date: string; spend_microcents: number; call_count: number };

/** Yield to the event loop, so overlapping callers actually interleave. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function makeLedger() {
  const rows = new Map<string, Row>();
  const key = (u: string, d: string) => `${u}|${d}`;
  const writes: string[] = [];

  return {
    rows,
    writes,
    client: {
      from(table: string) {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            const chain: any = {
              eq(col: string, val: string) {
                filters[col] = val;
                return chain;
              },
              async maybeSingle() {
                writes.push(`select:${table}`);
                await tick(); // the round trip the racing caller slips into
                const r = rows.get(key(filters.user_id, filters.date));
                return { data: r ? { ...r } : null, error: null };
              },
            };
            return chain;
          },
          async upsert(row: Row) {
            writes.push(`upsert:${table}`);
            await tick();
            rows.set(key(row.user_id, row.date), { ...row });
            return { data: null, error: null };
          },
        };
      },
      async rpc(name: string, args: Record<string, unknown>) {
        writes.push(`rpc:${name}`);
        if (name !== 'bump_aimee_spend') return { data: null, error: null };
        // Postgres holds the row lock across the read and the add, so there is
        // deliberately NO await between them here.
        await tick();
        const k = key(args.p_user_id as string, args.p_date as string);
        const cur = rows.get(k);
        const next: Row = {
          user_id: args.p_user_id as string,
          date: args.p_date as string,
          spend_microcents: (cur?.spend_microcents ?? 0) + (args.p_microcents as number),
          call_count: (cur?.call_count ?? 0) + 1,
        };
        rows.set(k, next);
        return { data: next.spend_microcents, error: null };
      },
    },
  };
}

function loadCost() {
  jest.resetModules();
  (globalThis as any).Deno = { env: { get: () => undefined } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(COST) as typeof import('../../../supabase/functions/aimee-chat-stream/_cost');
}

afterAll(() => {
  delete (globalThis as any).Deno;
});

describe('recordSpend under concurrency', () => {
  it('records all ten of ten concurrent calls, on the user row AND the global sentinel', async () => {
    const { recordSpend } = loadCost();
    const ledger = makeLedger();
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all(
      Array.from({ length: 10 }, () => recordSpend(ledger.client as any, USER, DELTA)),
    );

    const user = ledger.rows.get(`${USER}|${today}`);
    const global = ledger.rows.get(`${SENTINEL}|${today}`);

    // The read-modify-write recorded 1 x DELTA and call_count 1 here.
    expect(user).toBeDefined();
    expect(user!.spend_microcents).toBe(10 * DELTA);
    expect(user!.call_count).toBe(10);

    expect(global).toBeDefined();
    expect(global!.spend_microcents).toBe(10 * DELTA);
    expect(global!.call_count).toBe(10);
  });

  it('the fake ledger really does lose a read-modify-write (the harness is not vacuous)', async () => {
    const ledger = makeLedger();
    const today = new Date().toISOString().slice(0, 10);
    // The exact shape recordSpend used to have, against the same fake client.
    const oldRecordSpend = async () => {
      const { data: existing } = await ledger.client
        .from('aimee_cost_cents')
        .select()
        .eq('user_id', USER)
        .eq('date', today)
        .maybeSingle();
      await ledger.client.from('aimee_cost_cents').upsert({
        user_id: USER,
        date: today,
        spend_microcents: ((existing as Row | null)?.spend_microcents ?? 0) + DELTA,
        call_count: ((existing as Row | null)?.call_count ?? 0) + 1,
      });
    };
    await Promise.all(Array.from({ length: 10 }, oldRecordSpend));
    expect(ledger.rows.get(`${USER}|${today}`)!.spend_microcents).toBe(DELTA);
  });

  it('writes the ledger through the atomic RPC and never through a bare upsert', async () => {
    const { recordSpend } = loadCost();
    const ledger = makeLedger();
    await recordSpend(ledger.client as any, USER, DELTA);

    expect(ledger.writes.filter((w) => w === 'rpc:bump_aimee_spend')).toHaveLength(2); // user + sentinel
    expect(ledger.writes.filter((w) => w.startsWith('upsert:'))).toEqual([]);
    expect(ledger.writes.filter((w) => w.startsWith('select:'))).toEqual([]);
  });

  it('a zero or negative amount writes nothing at all', async () => {
    const { recordSpend } = loadCost();
    const ledger = makeLedger();
    await recordSpend(ledger.client as any, USER, 0);
    await recordSpend(ledger.client as any, USER, -5);
    expect(ledger.writes).toEqual([]);
    expect(ledger.rows.size).toBe(0);
  });
});

describe('the migration that makes the RPC exist', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const file = path.join(ROOT, 'supabase', 'migrations', '20260916000000_aimee_spend_atomic.sql');
  const sql = fs.readFileSync(file, 'utf8');

  it('adds the increment inside the ON CONFLICT, not in the caller', () => {
    expect(sql).toMatch(/ON CONFLICT \(user_id, date\)/);
    expect(sql).toMatch(/spend_microcents = public\.aimee_cost_cents\.spend_microcents \+ p_microcents/);
    expect(sql).toMatch(/call_count = public\.aimee_cost_cents\.call_count \+ 1/);
  });

  it('is SECURITY DEFINER with an empty search_path', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toMatch(/SET search_path = ''/);
  });

  it('revokes the two Supabase default grantees by name, not just PUBLIC', () => {
    // REVOKE ... FROM PUBLIC does not touch ALTER DEFAULT PRIVILEGES grants to
    // anon/authenticated. See scripts/verify-rpc-grants.mjs.
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) FROM ${role};`);
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) TO service_role;');
  });

  it('is schema-additive: no data statement outside the function body, no backfill', () => {
    // Comments quote the very SQL they explain, so strip them before scanning.
    const code = sql.replace(/^\s*--.*$/gm, '');
    // The ONE insert is the upsert inside the function, which runs per call —
    // not a migration-time write.
    const body = code.slice(code.indexOf('AS $$'), code.indexOf('$$;') + 3);
    const outside = code.replace(body, '');
    expect(outside).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|COPY)\b/i);
    expect(code).not.toMatch(/\bALTER TABLE\b/i);
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(body.match(/\bINSERT\b/gi)).toHaveLength(1);
  });

  it('is named in the ship checklist, so it is applied before the functions deploy', () => {
    const checklist = fs.readFileSync(path.join(ROOT, 'SHIP_CHECKLIST_2026-09-15.md'), 'utf8');
    expect(checklist).toContain('20260916000000_aimee_spend_atomic.sql');
  });
});
