# Admin AI grant — unlock AI for `edward@giddyupp.com`

**Run this on the machine that's CLI-authed to Supabase (project `zniucpbeepxysvkshpir` / "AimeeBrain").**
One idempotent SQL statement. ~15 seconds. No code deploy needed.

---

## Why this is needed (context)

On the web PWA, the admin account lost access to AI features. This is a **known,
correct side effect of the H1 security fix** in the Square work, not a regression:

- Before: a dev/preview **web** build auto-granted **Pro to every signed-in user**
  (`useSubscriptionStore.ts` bypass). The admin was silently riding that.
- The Square security sweep closed that hole — the bypass is now gated
  `&& Platform.OS !== 'web'` (`useSubscriptionStore.ts:163` and `:377`). Correct:
  the web PWA is the real, Square-monetized surface and must not give Pro away.
- Result: on web the client now derives tier **only** from the `subscriptions`
  table. The admin has no paid row → drops to `free` → AI UI locks.
- `BETA_TESTER_EMAILS` does **not** help here: it only unlocks the **server**
  (`_shared/effectiveTier.ts:90`). The **web client never reads it**, so the UI
  stays locked regardless.

**Fix:** give the admin a real **admin-grant** `subscriptions` row (`tier=pro`,
far-future expiry). This is the documented pattern (`effectiveTier.ts:21` —
"Admin/reviewer grants seed an active row with a far-future expiry"). It unlocks
AI on **both web and native**, and does **not** reopen the H1 giveaway (scoped to
one user). Idempotent — safe to run more than once.

---

## The SQL (edit the email only if granting someone else)

```sql
with u as (
  select id, email from auth.users
  where lower(email) = lower('edward@giddyupp.com')
),
ins as (
  insert into public.subscriptions
    (user_id, product_id, tier, platform, expires_at, is_active, last_validated_at)
  select id, 'admin_grant', 'pro', null, now() + interval '10 years', true, now()
  from u
  on conflict (user_id, product_id) do update
    set tier = 'pro', expires_at = now() + interval '10 years',
        is_active = true, last_validated_at = now()
  returning user_id, tier, is_active, expires_at
),
mir as (
  update public.profiles p set subscription_tier = 'pro'
  from u where p.id = u.id
  returning p.id
)
select (select email from u)                             as email,
       (select user_id::text from ins)                   as granted_user,
       (select tier from ins)                            as tier,
       (select is_active from ins)                       as is_active,
       (select to_char(expires_at,'YYYY-MM-DD') from ins) as expires,
       (select count(*) from mir)                        as profile_rows_updated;
```

Notes:
- `platform` is set to `null` on purpose — it's nullable, so the grant does **not**
  depend on the `platform IN (...,'web')` CHECK migration being applied.
- `subscriptions` has `UNIQUE (user_id, product_id)`, so the `on conflict` makes
  re-runs safe (it just refreshes the expiry).

---

## How to run it — pick ONE

### A. Supabase Dashboard (works anywhere, no creds to fumble)
Dashboard → project **AimeeBrain** (`zniucpbeepxysvkshpir`) → **SQL Editor** →
paste the block above → **Run**.

### B. psql on the CLI-authed machine
Get the connection string from Dashboard → **Project Settings → Database →
Connection string** (or the `SUPABASE_DB_URL` secret), then:

```bash
psql "postgresql://postgres:[PASSWORD]@db.zniucpbeepxysvkshpir.supabase.co:5432/postgres" \
  -f docs/admin_ai_grant.sql     # or paste the SQL inline with -c "..."
```

### C. Management API (if you have a `sbp_…` personal access token)
```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/zniucpbeepxysvkshpir/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @docs/admin_ai_grant.query.json
```
(The JSON is just `{"query":"<the SQL above, single line>"}`.)

---

## Expected result (verification)

One row:

| email | granted_user | tier | is_active | expires | profile_rows_updated |
|-------|--------------|------|-----------|---------|----------------------|
| edward@giddyupp.com | `<uuid>` | pro | t | ~2036-xx-xx | 1 |

If `granted_user` is empty / `profile_rows_updated = 0`, the email didn't match a
row in `auth.users` — double-check the address the admin actually signs in with.

## After it runs
Reload the web app (or sign out/in) so `syncFromServer` pulls the new `pro` row.
AI unlocks immediately. No rebuild/redeploy required.

---

## Optional follow-up (not required to fix the admin)

The web client doesn't recognize `BETA_TESTER_EMAILS` at all, so **any other tester**
who was riding the old web bypass is also locked out now. If you want testers
handled automatically on web (instead of a grant row each), the clean fix is to have
`syncFromServer` resolve tier from a small server endpoint that runs
`resolveEffectiveTier` + the beta check, rather than reading the `subscriptions`
table directly. Separate task — ping to scope it.
