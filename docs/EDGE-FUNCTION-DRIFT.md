# Edge-function drift

> **Update 2026-09-01 — the Sentry gap is closed.** All 49 Sentry-only functions
> now match production. Drifted files: **57 → 8**, and every one that remains is
> a real feature difference needing a human diff, listed under §2 and §3 below.
> The original measurement follows, unedited, because the shape of it is the
> point.

# The repo was 934 lines behind production

Measured 2026-09-01 with `npm run check:drift`, which reads the original source
back out of each deployed bundle's source maps and compares it to this repo.

```
152 files compared · 57 drifted · 5 deployed with no source here
934 lines of production code that do not exist in this repository
```

**Deploying any drifted function from this repo would revert whatever is only in
production.** That is not hypothetical: the list below includes purchase
validation and every Square payment path.

## It is three distinct changes, not random rot

### 1. Sentry error reporting — 49 functions · FIXED 2026-09-01

Each differs by two or three lines, and they are always the same two:

```ts
import { reportError } from '../_shared/sentry.ts';
…
    reportError('community-block', err);
```

`_shared/sentry.ts` did not exist in the repo at all until it was recovered on
2026-09-01. So the entire error-reporting integration for edge functions was
written, deployed across the estate, and never committed.

**If edge-function failures have looked invisible, this is why**: redeploying any
of those 49 from the repo silently removed its error reporting.

Now committed, taken from the deployed source verbatim so the repo matches byte
for byte. It came in two forms — 46 functions use a try/catch with
`reportError(...)`, and three whose handlers had no top-level catch are wrapped
in `withErrorReporting(...)` instead. The applier refused to touch a file unless
every added line was one of those forms and nothing unrelated was removed.

### 2. Payments and purchase validation — the serious one

```
+346  validate-purchase/index.ts     638 → 984
 +92  square-subscribe/index.ts      160 → 252
 +43  square-webhook/index.ts        248 → 291
 +31  square-checkout/index.ts       101 → 132
 +26  apple-notifications/index.ts   474 → 500
```

`validate-purchase` has grown by more than half. It is the function that decides
whether someone who paid actually receives what they bought — and
`reconcile-purchases` exists precisely because a customer paid on Google Play on
2026-08-22 and got nothing for three days.

**Do not deploy any of these from the repo without diffing first.**

### 3. The credit / overage feature — deployed, never committed

```
+176  aimee-chat-stream/_cost.ts     145 → 321   (adds readCreditBalance, overageState)
+110  aimee-chat-stream/index.ts     738 → 848
  +9  _shared/credits.ts
```

plus four functions with no source here at all: `credit-autorefill`,
`credit-autorefill-settings`, `aimee-usage`, and `send-welcome-email`.

The deployed `aimee-usage` imports `readCreditBalance` from
`../aimee-chat-stream/_cost.ts`. Deploying the repo's `aimee-chat-stream` would
delete that export.

## What is safe right now

Nothing was changed in production. The recovered originals sit in
`supabase/functions/_recovered/` — including the deployed `aimee-chat-stream`
files for comparison — and are outside the deploy path.

**The repo is safe to read and safe to build the app from. It is NOT currently
safe to `supabase functions deploy` from, function by function, without checking
that function first.**

## Reconciling

Per function, cheapest first:

```bash
SUPABASE_ACCESS_TOKEN=… npm run check:drift <fn>    # is it drifted?
```

Then recover its deployed source the way `_recovered/` was produced, diff it
against the repo, and decide which is correct. For the 49 Sentry-only functions
that is nearly mechanical — the change is two lines and the same two every time.
For `validate-purchase` and the Square paths it is a real review.

## The cause

Code reached production without being committed, repeatedly, from a working copy
someone had locally. Every artifact with a build stamp shows the same thing: the
previously live PWA was stamped `5a993f4a`, a commit in no branch; the 1.10.0
binary Apple reviewed came from EAS remote versioning against an app.json that
said 1.9.9.

Until deploys come from committed code — CI, or a deploy that refuses a dirty
tree — this recurs. `check:drift` measures it; it does not prevent it.
