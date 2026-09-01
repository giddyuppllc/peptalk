# Recovered edge functions — now ORIGINAL source, not reconstructions

Five functions were live in production with no source anywhere in this repo, and
they depended on three shared modules that were also missing. All eight are now
recovered.

| Function | Deployed version |
|---|---|
| `aimee-usage` | 3 |
| `credit-autorefill` | 1 |
| `credit-autorefill-settings` | 1 |
| `reconcile-purchases` | 1 |
| `send-welcome-email` | 3 |

Two of them move money. `reconcile-purchases` exists because a customer paid on
Google Play on 2026-08-22, got nothing for three days, and had to message on
Instagram.

## These are the real files

The first recovery attempt pulled transpiled JavaScript out of the bundle and was
honest about being a reconstruction. That turned out to be unnecessary: Supabase's
deployed ESZIP embeds **source maps carrying `sourcesContent`** — the original
TypeScript, types and comments intact.

**The method is validated, not assumed.** `_shared/effectiveTier.ts` was already
in the repo; the copy recovered from the bundle came back **byte-identical**.
That is the control.

## What went where

- `_shared/credits.ts`, `_shared/email.ts`, `_shared/sentry.ts` → placed directly
  into `supabase/functions/_shared/`. They were missing outright, nothing else
  imports them yet, and adding them is purely additive.
- The five function bodies → kept **here**, outside the deploy path. Promoting
  one is a deliberate act: read it, confirm it matches what is running, move it
  to `supabase/functions/<name>/`, then deploy.

## Also recovered: a stale file in the repo

`_cost.deployed.ts` is the DEPLOYED `aimee-chat-stream/_cost.ts`. It differs from
the repo's copy by 338 lines — deployed is 242 lines, the repo's is 85. **The
repo copy appears to be stale and production has moved on.**

Deliberately NOT applied. Which version is correct is a judgement about live
cost-capping, and getting it wrong changes what users are charged for AI. Diff
them and decide.

## aimee-chat-stream is BEHIND production — do not deploy it blind

`aimee-chat-stream/index.deployed.ts` and `_cost.deployed.ts` are the DEPLOYED
copies, saved here for comparison and deliberately not applied.

    index.ts   repo 738 lines · deployed 848
    _cost.ts   repo 145 lines · deployed 321

**Deploying `aimee-chat-stream` from this repo would revert production by ~286
lines** and delete `readCreditBalance` and `overageState` from `_cost.ts` — which
the deployed `aimee-usage` imports. Diff and reconcile first.

The other files in that function — `_grok.ts`, `_prompt.ts`, `_tools.ts`,
`_shared/effectiveTier.ts` — are byte-identical to production. The drift is
confined to those two files, and matches the shape of the credit/overage feature
that was never committed.

## Catching this next time

    SUPABASE_ACCESS_TOKEN=… npm run check:drift            # every function
    SUPABASE_ACCESS_TOKEN=… npm run check:drift aimee-chat-stream

`scripts/check-deployed-drift.mjs` reads the ORIGINAL source back out of each
deployed bundle and compares it to the repo. Every other check here compares the
repo against itself; this is the only one that asks whether the repo still
matches what is running. It is not in `verify:all` — it downloads a bundle per
function and needs a token.

## The question still unanswered

How code reaches production without ever being committed. Until that is known,
this recurs — and it has now happened to five functions, three shared modules,
one `_cost.ts`, the previously-live PWA bundle, and the 1.10.0 binary Apple
reviewed.
