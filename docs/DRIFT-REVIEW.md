# The six files where the repo and production BOTH changed

Generated 2026-09-01. These could not be adopted mechanically: each side has
lines the other lacks, so taking production wholesale would DISCARD repo-only
work, and deploying the repo would discard production-only work.

**The question for each is the same:** is the repo-only code deliberate work that
was never deployed, or is it stale code that production has already moved past?

## What has since been settled

Each repo-only line was re-checked with whitespace collapsed, and against the
`withErrorReporting` wrapper that legitimately replaces `Deno.serve(async (req)
=> {`. That reduced the list:

- **`square-webhook` — ADOPTED.** All 2 repo-only lines were the unwrapped
  `Deno.serve`. Nothing was lost, so production was taken verbatim.
- **`validate-purchase` (+346) and `apple-notifications` (+26) — ADOPTED.**
  Strict supersets: every repo line survives in production, verified line by
  line before writing.

**And production is NOT uniformly ahead.** `_shared/credits.ts` has 11 repo-only
lines that are genuinely absent from production, including a dated decision:

> ONE PACK, $4.99. Edward's call, 2026-08-26: a single pack is all this needs,
> rather than a small/medium/large ladder nobody asked for.

That reads as a decision made AFTER the deployed version was built. Adopting
production there would discard it. Do not assume "deployed = newer" for these
four.

Only the repo-only lines are listed — those are the ones at risk of being lost.
The production-only additions are visible in the `.deployed.ts` copies alongside
each function under `supabase/functions/_recovered/`.

## `aimee-chat-stream/index.ts`

repo 739 lines · deployed 849 lines · **20 lines only in the repo**, 126 only in production

```diff
-  free: 0,
-  plus: 25,
-  pro: 300,
-  const costCheck = await checkCostCap(supabase, user.id);
-  const systemPrompt = buildAimeeSystemPrompt(safeContext);
-    return jsonError(
-      429,
-      `Daily message limit reached (${rateLimit.limit}/day)${tier === 'plus' ? '. Upgrade to Pro for more.' : '. Rese
-      { upgrade: tier === 'plus', retryAfter: rateLimit.retryAfter },
-    );
-        await recordSpend(supabase, user.id, costMC);
-    tools: AIMEE_TOOLS,
-  const today = new Date().toISOString().slice(0, 10);
-      p_date: today,
-      const tomorrow = new Date(now);
-      tomorrow.setUTCHours(24, 0, 0, 0);
-      const retryAfter = Math.max(1, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
-    const today = new Date().toISOString().slice(0, 10);
-      .eq('date', today)
-      .eq('date', today);
```

## `aimee-chat-stream/_cost.ts`

repo 146 lines · deployed 322 lines · **77 lines only in the repo**, 245 only in production

```diff
- * Cost cap for Aimee.
- *
- * Two layers:
- *   1. Per-user daily — protects against a single account fanning out cost.
- *   2. System-wide daily — global circuit breaker on the Grok / xAI bill.
- *      Stored under the sentinel UUID below.
- * Default budgets (override via Supabase secrets):
- *   AIMEE_DAILY_BUDGET_CENTS         — system-wide ceiling. Default 1000 = $10.
- *   AIMEE_PER_USER_DAILY_CENTS       — per-user ceiling.    Default 200  = $2.
- *
- * Both are FAIL-CLOSED on DB error: if we can't read the ledger, we can't
- * enforce the cap, so we refuse the call rather than risk runaway spend.
-const SYSTEM_DAILY_CENTS = Number(
-  Deno.env.get('AIMEE_DAILY_BUDGET_CENTS') ?? 1000,
-const PER_USER_DAILY_CENTS = Number(
-  Deno.env.get('AIMEE_PER_USER_DAILY_CENTS') ?? 200,
-);
-const SYSTEM_DAILY_MC = SYSTEM_DAILY_CENTS * 1_000_000;
-const PER_USER_DAILY_MC = PER_USER_DAILY_CENTS * 1_000_000;
-  reason?:
-    | 'global_cap_hit'
-    | 'user_cap_hit'
-    | 'ledger_unreachable';
-  userSpendMC?: number;
-}
-  const today = new Date().toISOString().slice(0, 10);
… 51 more
```

## `square-subscribe/index.ts`

repo 161 lines · deployed 253 lines · **5 lines only in the repo**, 89 only in production

```diff
-  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
-    const planVariationId = Deno.env.get(plan.planEnv) ?? '';
-    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID || !planVariationId) {
-    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
-    return json({ ok: true, subscriptionId, tier: plan.tier });
```

## `square-webhook/index.ts`

repo 249 lines · deployed 292 lines · **2 lines only in the repo**, 43 only in production

```diff
-Deno.serve(async (req) => {
-});
```

## `square-checkout/index.ts`

repo 102 lines · deployed 133 lines · **7 lines only in the repo**, 35 only in production

```diff
-  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
-    const plan = PLAN[productId];
-    if (!plan) return json({ error: 'Unknown product' }, 400);
-    const referenceId = `${user.id}:${plan.tier}:${productId}`;
-          name: plan.name,
-          price_money: { amount: plan.amountCents, currency: 'USD' },
-        payment_note: `PepTalk ${plan.tier} web · user ${user.id}`,
```

## `_shared/credits.ts`

repo 129 lines · deployed 138 lines · **12 lines only in the repo**, 21 only in production

```diff
- * ONE PACK, $4.99.
- * Edward's call, 2026-08-26: a single pack is all this needs, rather than a
- * small/medium/large ladder nobody asked for.
- *
- * `creditCents` (300 = $3.00 of AI spend) is the remaining number he has not
- * pinned. At roughly $0.0008 a turn that is about 3,750 turns, and it matches
- * the AI allowance included in a month of Plus — so a top-up buys about the
- * same amount of Aimee that the subscription itself does. Change the one line
- * below if that ratio is wrong; a test fails if the two catalogs disagree.
-  peptalk_credits: {
-    productId: 'peptalk_credits',
-    name: 'AI Credits',
```

