# Recovered edge functions

Five functions are **live in production with no source in this repo**:

| Function | Deployed version |
|---|---|
| `aimee-usage` | 3 |
| `credit-autorefill` | 1 |
| `credit-autorefill-settings` | 1 |
| `reconcile-purchases` | 1 |
| `send-welcome-email` | 3 |

They were running code nobody could read, review, diff, or rebuild. Two of them
touch credits and purchase reconciliation, which is money.

On 2026-08-31 their deployed bundles were fetched
(`GET /v1/projects/{ref}/functions/{slug}/body`, an ESZIP archive) and the
module source extracted back out. Each file here is brace-balanced, contains its
`serve()` handler, and ends at the handler close.

## Read this before using them

**These are transpiled, not original.** The build stripped TypeScript
annotations and normalised formatting, so they are not byte-identical to
whatever was written. They are faithful to the deployed *behaviour* — comments
and logic came through intact — but they are a reconstruction.

**Nothing here is in the deploy path.** `_`-prefixed directories are not treated
as functions, so `supabase functions deploy` cannot push one of these over
working production code. That is deliberate: a subtly truncated reconstruction
silently replacing a live credits function is a worse outcome than having no
source at all.

## Adopting one

1. Read it end to end.
2. Restore the type annotations.
3. Move it to `supabase/functions/<name>/index.ts`.
4. Diff its behaviour against production before deploying.

## The real question

Nobody knows how these got deployed without source. Until that is answered the
same thing can happen again — most likely a `supabase functions deploy` run from
a working copy that had files the repo never received.
