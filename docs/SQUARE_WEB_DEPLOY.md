# Square web-checkout — deploy runbook

Deploys the **web/PWA Square subscription** path. **Native iOS/Android IAP is
untouched** — this only adds the `Platform.OS === 'web'` checkout + its backend.

Run this on the machine whose **Supabase CLI is already authed** (has a
`SUPABASE_ACCESS_TOKEN` / logged in). Project ref: **`zniucpbeepxysvkshpir`**.

> No secrets live in this file. The Square values live in the gitignored
> `~/Projects/.square-creds` on the primary machine — copy that file to this
> machine (AirDrop/scp) before step 3, or recreate it from the Square dashboard.

---

## 0. Pull the branch
```bash
cd ~/Projects/giddyuppllc/peptalk        # (or wherever this repo lives)
git fetch origin
git checkout feat/pwa-web-support
git pull --ff-only
```

## 1. Confirm CLI auth + link
```bash
supabase projects list          # should list the org (proves you're authed)
supabase link --project-ref zniucpbeepxysvkshpir
```
If `projects list` says "Access token not provided": create a Personal Access
Token at https://supabase.com/dashboard/account/tokens and either
`export SUPABASE_ACCESS_TOKEN=<token>` or run `supabase login`.

## 2. (Get the Square creds file onto this machine)
Copy `~/Projects/.square-creds` from the primary machine. It contains (sandbox):
`SQUARE_ENV, SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_WEBHOOK_SIGNATURE_KEY,
SQUARE_WEBHOOK_URL, SQUARE_RETURN_URL`.

## 3. Set the edge-function secrets (values sourced from that file, never typed here)
```bash
set -a; source ~/Projects/.square-creds; set +a
supabase secrets set \
  SQUARE_ENV="$SQUARE_ENV" \
  SQUARE_ACCESS_TOKEN="$SQUARE_ACCESS_TOKEN" \
  SQUARE_LOCATION_ID="$SQUARE_LOCATION_ID" \
  SQUARE_WEBHOOK_SIGNATURE_KEY="$SQUARE_WEBHOOK_SIGNATURE_KEY" \
  SQUARE_WEBHOOK_URL="$SQUARE_WEBHOOK_URL" \
  SQUARE_RETURN_URL="$SQUARE_RETURN_URL" \
  --project-ref zniucpbeepxysvkshpir
```

## 4. Deploy the two edge functions
```bash
# Checkout: KEEP the JWT gate (reads the signed-in user)
supabase functions deploy square-checkout --project-ref zniucpbeepxysvkshpir

# Webhook: NO jwt gate, or Square's POST gets 401 before our code runs
supabase functions deploy square-webhook --no-verify-jwt --project-ref zniucpbeepxysvkshpir
```

## 5. Apply the migration (widen `platform` to allow `'web'`)
**Safest / targeted** — paste this into the Supabase **SQL editor** and run it
(no DB password needed, only touches the CHECK constraint, additive):
```sql
DO $$ DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid='public.subscriptions'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%platform%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', c); END IF;
  BEGIN ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_platform_check CHECK (platform IN ('ios','android','web'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid='public.subscription_events'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%platform%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.subscription_events DROP CONSTRAINT %I', c); END IF;
  BEGIN ALTER TABLE public.subscription_events
    ADD CONSTRAINT subscription_events_platform_check CHECK (platform IN ('ios','android','web'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
```
**Or via CLI** (applies ALL pending migrations — run `supabase migration list`
first and confirm only `20260804000000_subscriptions_web_platform` is pending):
```bash
supabase db push --project-ref zniucpbeepxysvkshpir
```

## 6. Square dashboard (already done — verify)
- **Sandbox** mode ON.
- Webhook endpoint → `https://zniucpbeepxysvkshpir.supabase.co/functions/v1/square-webhook`
  (must byte-match `SQUARE_WEBHOOK_URL`), events: **`payment.updated`** + **`order.updated`**.
- Signature Key copied into `.square-creds` (step 2).

## 7. Sandbox smoke test
1. Open the PWA web build, sign in, tap **Upgrade** on Plus or Pro.
2. You should be redirected to Square's **sandbox** checkout. Pay with a Square
   test card (e.g. `4111 1111 1111 1111`, any future exp / any CVV / any ZIP).
3. Square returns you to `.../subscription?checkout=success`.
4. Within a few seconds the tier should unlock (webhook wrote a `platform:'web'`
   `subscriptions` row). Tail logs if not:
   ```bash
   supabase functions logs square-webhook --project-ref zniucpbeepxysvkshpir
   supabase functions logs square-checkout --project-ref zniucpbeepxysvkshpir
   ```
   - `signature verification failed` → `SQUARE_WEBHOOK_URL` ≠ the URL registered
     in Square, or wrong Signature Key.
   - `Square not configured` → `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` unset.

## Rollback
- Functions are additive (nothing native calls them) — deleting them is safe:
  `supabase functions delete square-checkout square-webhook`.
- The migration only widens a CHECK; it never breaks existing ios/android rows.

## Not yet wired (future)
- **Auto-renew**: this scaffold takes the *first* charge via a Square payment
  link. True recurring needs Square **Catalog subscription plans** + the
  Subscriptions API (`SQUARE_PLAN_PLUS_MONTHLY` / `SQUARE_PLAN_PRO_MONTHLY`,
  events `invoice.payment_made` + `subscription.updated`). See TODOs in
  `supabase/functions/square-checkout/index.ts`.
- **Production**: regenerate Square **production** keys, set `SQUARE_ENV=production`,
  and register a production webhook — do NOT reuse sandbox keys.
