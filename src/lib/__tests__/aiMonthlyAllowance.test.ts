/**
 * No AI function has a per-DAY limit, and every one enforces the monthly one.
 *
 * WHY THIS FILE EXISTS
 * Edward, 2026-08-26: "daily limits are dumb limit per acc based on what they
 * pay" / "i dont want a daily cap". Only aimee-chat-stream moved. Three weeks
 * later recipe, plan, workout, pantry, voice, lab and report functions still
 * refused at 2-60 calls a day and recorded no spend, so the monthly allowance
 * could not see them at all.
 *
 * TWO LAYERS
 *  1. A scan of every edge function for the daily-bucket shapes: a
 *     bump_ai_usage keyed on today's date, a reset at midnight, "/day)" or
 *     "Resets tomorrow" copy. Exceptions are listed with the reason.
 *  2. Each migrated function's REAL handler, run under a Deno shim with a fake
 *     Supabase client and a fake provider, for three outcomes: over the
 *     account's monthly allowance (429, provider never called), over the
 *     system-wide breaker (429, provider never called), and inside it (provider
 *     called once, its token spend written to the monthly ledger).
 *
 * The scan alone is not enough: a function can lose its daily counter and gain
 * nothing, which reads as "no daily cap" and is actually "no cap".
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');

/** Code with comments removed, so rationale that quotes old copy cannot trip the scan. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
}

function readFunction(name: string): string {
  const dir = path.join(FUNCTIONS, name);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

const allFunctions = fs
  .readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
  .map((d) => d.name);

/**
 * Functions that still carry a per-day count, and why. Each is a decision for
 * Edward, not an oversight.
 */
const DAILY_CAP_ALLOWED: Record<string, string> = {
  'community-moderate-image':
    'Moderation of community images, capped per AUTHOR (50/day) on a feature free users have. Not a paid allowance; a monthly number for it is a decision.',
  'food-search-proxy':
    'Not AI: shared, metered USDA/Spoonacular/CalorieNinjas keys, free feature, 300/day abuse cap. A monthly number for it is a decision.',
};

/** Functions that call a model provider but are not user AI features. */
const NOT_USER_AI: Record<string, string> = {
  'aimee-chat-stream': 'The reference implementation: calls checkCostCap/recordSpend directly (asserted below).',
  'tag-workout-video': 'Admin-only video tagging (ADMIN_EMAILS).',
  'transcribe-workout-video': 'Admin-only one-shot transcription.',
  'community-moderate-image': 'Moderation, see DAILY_CAP_ALLOWED.',
};

const callsProvider = (src: string) => /chat\/completions|audio\/transcriptions/.test(src);

describe('no AI edge function counts per day', () => {
  it('scans a real tree (not vacuous)', () => {
    expect(allFunctions.length).toBeGreaterThan(40);
    expect(allFunctions.filter((f) => callsProvider(readFunction(f))).length).toBeGreaterThanOrEqual(15);
  });

  it.each(allFunctions.filter((f) => !(f in DAILY_CAP_ALLOWED)))('%s has no daily bucket or daily copy', (name) => {
    const code = codeOnly(readFunction(name));
    // bump_ai_usage keys its counter on p_date: whatever is passed there IS the
    // window. It must resolve to the first of the month (slice(0, 7)), never
    // to today's date (slice(0, 10)).
    for (const call of code.split("rpc('bump_ai_usage'").slice(1)) {
      const arg = call.slice(0, call.indexOf('}'));
      const m = arg.match(/p_date:\s*([^,\n]+)/);
      expect(m).not.toBeNull();
      let expr = m![1].trim();
      const id = expr.replace(/\(\)$/, '');
      if (/^[A-Za-z_]\w*$/.test(id)) {
        const decl =
          code.match(new RegExp(`(?:const|let)\\s+${id}\\s*=\\s*([^;]+);`)) ??
          code.match(new RegExp(`function\\s+${id}\\s*\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
        expect(decl).not.toBeNull();
        expr = decl![1];
      }
      expect(expr).toContain('slice(0, 7)');
      expect(expr).not.toContain('slice(0, 10)');
    }
    expect(code).not.toContain('setUTCHours(24');
    // Limit copy only: the dosing prompt legitimately says 'mcg/day'.
    expect(code).not.toMatch(/limit reached[^'"`\n]*\/day/i);
    expect(code).not.toContain('Resets tomorrow');
    expect(code).not.toMatch(/DAILY_LIMIT|dailyLimit|VOICE_DAILY/);
  });

  it('every listed exception still exists (a stale allowlist hides nothing)', () => {
    for (const name of Object.keys(DAILY_CAP_ALLOWED)) expect(allFunctions).toContain(name);
  });
});

describe('every user AI function enforces the monthly allowance', () => {
  const aiFunctions = allFunctions.filter((f) => callsProvider(readFunction(f)) && !(f in NOT_USER_AI));
  const scanners = new Set(['food-scan', 'lab-scan', 'aimee-pantry-scan'].filter((f) => f in DAILY_CAP_ALLOWED));

  it('finds the AI functions (not vacuous)', () => {
    expect(aiFunctions.length).toBeGreaterThanOrEqual(12);
  });

  it.each(aiFunctions.filter((f) => !scanners.has(f)))('%s checks the allowance and records spend', (name) => {
    const code = codeOnly(readFunction(name));
    expect(code).toContain('checkAiAllowance(');
    if (name === 'aimee-voice') {
      // Whisper reports no tokens, so voice has no spend to record; it keeps
      // a monthly call count instead (asserted by the handler test below).
      expect(code).toContain('VOICE_MONTHLY_LIMIT');
    } else {
      expect(code).toContain('recordAiSpend(');
    }
  });

  it('aimee-chat-stream still uses the same checkCostCap and recordSpend', () => {
    const code = codeOnly(readFunction('aimee-chat-stream'));
    expect(code).toContain('checkCostCap(supabase, user.id, tier)');
    expect(code).toContain('recordSpend(supabase, user.id, costMC');
  });
});

// ─── Handlers, exercised ─────────────────────────────────────────────────────

const USER = '11111111-1111-1111-1111-111111111111';
const SENTINEL = '00000000-0000-0000-0000-000000000000';
const MC = 1_000_000;
const PRO_ALLOWANCE_CENTS = 1200; // _cost.ts default for pro
const SYSTEM_BREAKER_CENTS = 100_000; // _cost.ts default AIMEE_MONTHLY_BUDGET_CENTS
const USAGE = { prompt_tokens: 1000, completion_tokens: 500 };
const EXPECTED_MC = 1000 * 20 + 500 * 50; // _grok.ts default per-token rates

type Log = [string, string, any, any?][];

function fakeSupabase(opts: { userSpendMC: number; globalSpendMC: number; ledgerError?: boolean }, log: Log) {
  const listFor = (table: string) => {
    if (table === 'subscriptions') {
      return { data: [{ tier: 'pro', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }], error: null };
    }
    if (table === 'aimee_cost_cents') {
      if (opts.ledgerError) return { data: null, error: { message: 'down' } };
      return {
        data: [
          { user_id: USER, spend_microcents: opts.userSpendMC },
          { user_id: SENTINEL, spend_microcents: opts.globalSpendMC },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  };
  const singleFor = (table: string) => {
    if (table === 'profiles') return { data: { subscription_tier: 'pro', is_pro: true }, error: null };
    if (table === 'ai_credit_balance') return { data: { balance_microcents: 0 }, error: null };
    if (table === 'ai_usage_log') return { data: { count: 1 }, error: null };
    return { data: null, error: null };
  };
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'match', 'neq']) c[m] = () => c;
    c.maybeSingle = async () => singleFor(table);
    c.single = async () => singleFor(table);
    c.then = (res: any, rej: any) => Promise.resolve(listFor(table)).then(res, rej);
    return c;
  };
  const done = () => {
    const d: any = Promise.resolve({ data: null, error: null });
    d.select = () => Promise.resolve({ data: null, error: null });
    return d;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER, email: 'someone@example.com' } }, error: null }) },
    from: (table: string) => ({
      select: () => chain(table),
      upsert: (arg: any, o: any) => {
        log.push(['upsert', table, arg, o]);
        return done();
      },
      insert: (arg: any) => {
        log.push(['insert', table, arg]);
        return done();
      },
      update: (arg: any) => {
        log.push(['update', table, arg]);
        return chain(table);
      },
      delete: () => chain(table),
    }),
    rpc: async (name: string, args: any) => {
      log.push(['rpc', name, args]);
      return { data: [{ count: 1 }], error: null };
    },
  };
}

type Case = { name: string; request: () => Request; providerReply: () => Response; recordsSpend: boolean };

const jsonReq = (body: unknown) =>
  new Request('http://edge.test/fn', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const completion = () =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: '{"recipes":[],"plan":[],"suggestions":[],"items":[],"days":[{"name":"Day 1","slots":[{"muscle":"chest"}]}]}' } }],
      usage: USAGE,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const CASES: Case[] = [
  { name: 'aimee-chat', request: () => jsonReq({ messages: [{ role: 'user', content: 'hi' }], context: {} }), providerReply: completion, recordsSpend: true },
  { name: 'aimee-recipe', request: () => jsonReq({}), providerReply: completion, recordsSpend: true },
  { name: 'aimee-plan', request: () => jsonReq({}), providerReply: completion, recordsSpend: true },
  { name: 'aimee-workout', request: () => jsonReq({}), providerReply: completion, recordsSpend: true },
  { name: 'aimee-pantry-meal', request: () => jsonReq({ pantryItems: [] }), providerReply: completion, recordsSpend: true },
  { name: 'aimee-pantry-parse', request: () => jsonReq({ text: '2 eggs in the fridge' }), providerReply: completion, recordsSpend: true },
  // hasConsent: these three refuse outright without health-data consent
  // (_shared/aiFeatureConsent.ts), so the fixture has to model a current
  // client or every allowance assertion below would be measuring a 403.
  { name: 'aimee-report-rewrite', request: () => jsonReq({ body: 'You logged 3 doses.', hasConsent: true }), providerReply: completion, recordsSpend: true },
  { name: 'aimee-lab-interpret', request: () => jsonReq({ results: [{ markerId: 'hdl', value: 50, unit: 'mg/dL' }], hasConsent: true }), providerReply: completion, recordsSpend: true },
  {
    name: 'aimee-voice',
    request: () => {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/m4a' }), 'voice.m4a');
      return new Request('http://edge.test/fn', { method: 'POST', headers: { Authorization: 'Bearer user-jwt' }, body: form });
    },
    providerReply: () => new Response('log two eggs', { status: 200 }),
    recordsSpend: false,
  },
  // Scanners: moved in their own commit, so these three can be dropped together.
  { name: 'food-scan', request: () => jsonReq({ imageBase64: 'aGVsbG8=' }), providerReply: completion, recordsSpend: true },
  { name: 'lab-scan', request: () => jsonReq({ imageBase64: 'aGVsbG8=', hasConsent: true }), providerReply: completion, recordsSpend: true },
  { name: 'aimee-pantry-scan', request: () => jsonReq({ imageBase64: 'aGVsbG8=' }), providerReply: completion, recordsSpend: true },
];

async function run(fn: string, c: Case, opts: { userSpendMC: number; globalSpendMC: number; ledgerError?: boolean }) {
  jest.resetModules();
  const log: Log = [];
  let handler: ((req: Request) => Promise<Response>) | null = null;
  const env: Record<string, string> = {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    OPENAI_API_KEY: 'provider-key',
    OPENAI_TRANSCRIBE_API_KEY: 'provider-key',
    OPENAI_VISION_API_KEY: 'provider-key',
  };
  (globalThis as any).Deno = {
    env: { get: (k: string) => env[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h;
    },
  };
  const supa = fakeSupabase(opts, log);
  jest.doMock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => supa }), { virtual: true });
  const providerCalls: string[] = [];
  // The BODY too, not just the URL: the consent suite below asserts on what
  // actually reached the provider, which is the only place a leaked health
  // field would show up.
  const providerBodies: string[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = jest.fn(async (url: string, init?: any) => {
    providerCalls.push(String(url));
    providerBodies.push(typeof init?.body === 'string' ? init.body : '');
    return c.providerReply();
  });
  try {
    require(path.join(FUNCTIONS, fn, 'index.ts'));
    if (!handler) throw new Error(`${fn} registered no handler`);
    const res: Response = await (handler as (req: Request) => Promise<Response>)(c.request());
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, log, providerCalls, providerBodies };
  } finally {
    (globalThis as any).fetch = realFetch;
  }
}

describe.each(CASES)('$name, run for real', (c) => {
  it('refuses with 429 once the account has spent its monthly allowance, before calling the provider', async () => {
    const r = await run(c.name, c, { userSpendMC: PRO_ALLOWANCE_CENTS * MC, globalSpendMC: 0 });
    expect(r.status).toBe(429);
    expect(r.body.reason).toBe('user_cap_hit');
    expect(r.providerCalls).toEqual([]);
  });

  it('refuses with 429 when the system-wide monthly breaker has tripped', async () => {
    const r = await run(c.name, c, { userSpendMC: 0, globalSpendMC: SYSTEM_BREAKER_CENTS * MC });
    expect(r.status).toBe(429);
    expect(r.body.reason).toBe('global_cap_hit');
    expect(r.providerCalls).toEqual([]);
  });

  it('fails closed when the spend ledger cannot be read — 503, not 429', async () => {
    // FIXED 2026-09-16. This asserted 429 and so locked the bug in.
    // `ledger_unreachable` is not a quota: the spend table could not be READ,
    // so the cap could not be enforced and the call is refused fail-closed.
    // 429 tells every client the quota is gone until it resets —
    // src/services/aimeeWorkout.ts:254 maps 429 to `rate_limit` — so a
    // database blip became "you are out of messages" and backoff would not
    // retry a call that would succeed a second later. aimee-voice already
    // answered 503 for its OWN failed-closed bump in the same handler.
    const r = await run(c.name, c, { userSpendMC: 0, globalSpendMC: 0, ledgerError: true });
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('ledger_unreachable');
    expect(r.body.retryAfter).toBe(60);
    expect(r.providerCalls).toEqual([]);
  });

  it('a 429 carries retryAfter, so a client knows when the allowance returns', async () => {
    const r = await run(c.name, c, { userSpendMC: PRO_ALLOWANCE_CENTS * MC, globalSpendMC: 0 });
    expect(r.status).toBe(429);
    expect(typeof r.body.retryAfter).toBe('number');
    expect(r.body.retryAfter).toBeGreaterThan(0);
    // These cases run as `pro`, which has nothing to upgrade to; the flag must
    // be present and false rather than absent, since aimeeWorkout.ts keys its
    // upgrade prompt on `body?.upgrade`.
    expect(r.body.upgrade).toBe(false);
  });

  it('the system-wide breaker never offers an upgrade — no plan buys past it', async () => {
    const r = await run(c.name, c, { userSpendMC: 0, globalSpendMC: SYSTEM_BREAKER_CENTS * MC });
    expect(r.status).toBe(429);
    expect(r.body.upgrade).toBe(false);
  });

  it('inside the allowance: calls the provider once and meters it monthly, never daily', async () => {
    const r = await run(c.name, c, { userSpendMC: 0, globalSpendMC: 0 });
    expect(r.providerCalls).toHaveLength(1);
    const bumps = r.log.filter(([op, name]) => op === 'rpc' && name === 'bump_ai_usage');
    // Spend is recorded through the ATOMIC bump_aimee_spend RPC, never through
    // a SELECT-then-UPSERT: that pattern lost nine of every ten concurrent
    // increments (see aiSpendLedgerAtomic.test.ts).
    const spend = r.log.filter(([op, name]) => op === 'rpc' && name === 'bump_aimee_spend');
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    if (c.recordsSpend) {
      expect(bumps).toEqual([]);
      expect(r.log.filter(([op, table]) => op === 'upsert' && table === 'aimee_cost_cents')).toEqual([]);
      const mine = spend.find(([, , args]) => args.p_user_id === USER);
      expect(mine).toBeDefined();
      expect(mine![2].p_microcents).toBe(EXPECTED_MC);
      expect(spend.find(([, , args]) => args.p_user_id === SENTINEL)![2].p_microcents).toBe(EXPECTED_MC);
    } else {
      expect(bumps).toHaveLength(1);
      expect(bumps[0][2].p_date).toBe(monthStart);
    }
  });
});

/**
 * The same real handlers, under the same shim, for the OTHER gate: the
 * health-data consent.
 *
 * `profile.aiDataConsent` governs whether the user's body, labs, doses,
 * allergies and goals may reach the AI provider. Before 2026-09-16 only
 * aimee-chat and aimee-chat-stream consulted it, and these functions sent the
 * lot regardless of it — so this is the assertion that was missing, made the
 * only way that proves anything: run the handler and read what the provider
 * received.
 *
 * `hasConsent` absent is the shape a client build older than this branch
 * sends, and it must be treated as NO consent, like aimee-chat already does.
 */
describe('health-data consent, enforced by the real handlers', () => {
  const inAllowance = { userSpendMC: 0, globalSpendMC: 0 };

  const REFUSE = [
    { name: 'aimee-lab-interpret', withConsent: { results: [{ markerId: 'hdl', value: 50, unit: 'mg/dL' }] } },
    { name: 'aimee-report-rewrite', withConsent: { body: 'You logged 3 doses of BPC-157.' } },
    { name: 'lab-scan', withConsent: { imageBase64: 'aGVsbG8=' } },
  ];

  describe.each(REFUSE)('$name', ({ name, withConsent }) => {
    const c = (body: unknown): Case => ({
      name,
      request: () => jsonReq(body),
      providerReply: completion,
      recordsSpend: true,
    });

    it.each([
      ['absent — a stale client', {}],
      ['false', { hasConsent: false }],
      ["the string 'true'", { hasConsent: 'true' }],
      ['1', { hasConsent: 1 }],
    ])('refuses with 403 when hasConsent is %s, and never calls the provider', async (_l, flag) => {
      const r = await run(name, c({ ...withConsent, ...(flag as object) }), inAllowance);
      expect(r.status).toBe(403);
      expect(r.body.consent).toBe(true);
      expect(r.providerCalls).toEqual([]);
    });

    it('runs normally with hasConsent: true', async () => {
      const r = await run(name, c({ ...withConsent, hasConsent: true }), inAllowance);
      expect(r.status).toBe(200);
      expect(r.providerCalls).toHaveLength(1);
    });
  });

  const STRIP = [
    {
      name: 'aimee-plan',
      body: { days: 5, allergens: ['peanuts'], goals: ['fat loss'], dietType: 'keto' },
      leaks: /peanuts|fat loss|keto/,
      keeps: /5-day|5 days/i,
    },
    {
      name: 'aimee-recipe',
      body: { mealType: 'lunch', constraints: ['vegetarian'], allergens: ['shellfish'] },
      leaks: /shellfish/,
      keeps: /vegetarian/,
    },
    {
      name: 'aimee-pantry-meal',
      body: { pantryItems: [{ name: 'rice' }], allergens: ['gluten'], activeStackPeptides: ['tirzepatide'] },
      leaks: /gluten|tirzepatide/,
      keeps: /rice/,
    },
    {
      name: 'aimee-workout',
      body: { goal: 'transformation', daysPerWeek: 4, gender: 'women' },
      leaks: /\bwomen\b/,
      keeps: /transformation/,
    },
  ];

  describe.each(STRIP)('$name', ({ name, body, leaks, keeps }) => {
    const c = (b: unknown): Case => ({
      name,
      request: () => jsonReq(b),
      providerReply: completion,
      recordsSpend: true,
    });

    it('still runs without consent — the feature is not health-only', async () => {
      const r = await run(name, c(body), inAllowance);
      expect(r.status).toBe(200);
      expect(r.providerCalls).toHaveLength(1);
    });

    it('sends the health fields to the provider WITH consent', async () => {
      const r = await run(name, c({ ...body, hasConsent: true }), inAllowance);
      expect(r.providerBodies.join(' ')).toMatch(leaks);
    });

    it.each([
      ['absent — a stale client', {}],
      ['false', { hasConsent: false }],
    ])('sends NONE of them when hasConsent is %s', async (_l, flag) => {
      const r = await run(name, c({ ...body, ...(flag as object) }), inAllowance);
      const sent = r.providerBodies.join(' ');
      expect(sent).not.toMatch(leaks);
      // and the request is not gutted — the non-health half still went.
      expect(sent).toMatch(keeps);
    });
  });
});

afterAll(() => {
  delete (globalThis as any).Deno;
});
