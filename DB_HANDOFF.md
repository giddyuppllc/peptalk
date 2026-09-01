# Supabase — what to do from the machine that can sign in

Written 2026-08-31. Everything here needs the Supabase dashboard or the DB
password; none of it can be done from the machine this was written on.

Project: **`zniucpbeepxysvkshpir`** (AimeeBrain) · `https://zniucpbeepxysvkshpir.supabase.co`

---

## 1. Set the reviewer account password — do this first

This is the **only ticked box** on the pre-submission checklist, and
`docs/app-store-review-notes.md` records that *"a non-working reviewer login was
the original 2.1a repeat-rejection cause"*. Build 1.10.0 (75) was then rejected
on 29 Aug for the same symptom.

1. Authentication → Users → `reviewer@peptalk.bio`
2. Set the password to the one in the review notes: `PepTalkReview2026!`
3. Confirm the account's tier is **Free**, not Plus/Pro. A pre-entitled account
   makes the Subscribe buttons no-op, which reads to a reviewer as a dead
   button — that is itself a 2.1(a) finding.
4. **Then actually log in on the build.** Not the dashboard — the shipped app.
   This is the step that has been skipped.

---

## 2. ~~Do NOT run `supabase db push`~~ — RESOLVED 2026-08-31, read this

The migration ledger and the database disagree, and the ledger is the one that
is wrong.

- 57 migration files exist locally.
- 49 are recorded in `supabase_migrations.schema_migrations`.
- **21 files are not recorded** — but the objects they create *do* exist. I
  checked three directly (`clinical_review_decisions`, `lab_results`,
  `workout_video_overrides`); all present.

So they were applied out-of-band — SQL editor, or a push that did not record —
and `db push` would try to replay 21 migrations against a schema that already
has their objects. Expect failures, and possibly destructive ones.

**What to do instead:** reconcile the ledger rather than replaying the work.
For each file below, confirm its objects exist, then mark it applied:

```bash
supabase migration repair --status applied <version>
```

Unrecorded versions:

```
20260526000000  20260624010000  20260624020000  20260627000000
20260628000000  20260628000001  20260628000002  20260628000003
20260629000000  20260629000001  20260629000002  20260629000004
20260629000005  20260804000010  20260813000000  20260813010000
20260813020000  20260813030000  20260813040000  20260813050000
20260825000000
```

### The two security ones are already in effect

`20260813040000_lock_down_reference_table_writes` and
`20260813050000_update_policies_with_check` are unrecorded, which looks alarming.
I verified the live state directly: there are **no non-SELECT policies** on
`peptides`, `peptide_interactions` or `peptide_safety`, so anon writes are denied
by default. An earlier note of mine suggested otherwise — that was a bad probe
(PostgREST returns 204 for a zero-row UPDATE before RLS is evaluated). **There is
no live exposure.** Repair the ledger, do not re-run them.

---

## 3. Five edge functions are deployed with no source in this repo

All 55 functions in `supabase/functions/` are deployed — nothing is missing.
But five more are live with no code under version control:

```
aimee-usage                credit-autorefill
credit-autorefill-settings reconcile-purchases
send-welcome-email
```

Either pull them into the repo (`supabase functions download <slug>`) or delete
them. Running code nobody can read or review is the worse of the two.

---

## 4. Confirm the auth setting that is NOT the login bug

`mailer_autoconfirm` is **on**, so signups get a session immediately and email
confirmation is not what bounced the reviewer. Worth knowing before anyone
"fixes" it — turning confirmation on would create the dead end described in
`app/onboarding.tsx`, where a user ends up onboarded-but-signed-out and pinned
on `/auth`. The code now orders itself correctly either way, but the setting is
still the thing that decides whether that path is ever taken.

---

## 5. Secrets the deploy runbook expects

`DEPLOY_RUNBOOK.md` lists ~15 Supabase secrets and the Vault entry
`app_internal_function_secret` used by the pg_net triggers. Confirm they are set
in production — several are needed for community/reaction push to work at all,
and their absence is silent.

---

## 6. Create the website's `waitlist_signups` table

The marketing site (`giddyuppllc/Peptalk.biowebcontainer`) shares this Supabase
project and now needs one table it does not own.

**Why it is urgent rather than tidy-up:** both email forms on peptalk.bio used
to show "You're on the list! We'll email you at launch" without storing
anything. Every address given to us since the site launched is gone, and those
people are waiting for an email. The forms now write for real — but until this
table exists they return 503 and tell the visitor signups are unavailable.

Paste `db/waitlist_signups.sql` from the website repo into the Supabase SQL
editor and run it. It is idempotent.

Then confirm the Vercel project for the website has `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` set — the admin dashboard already needs both, so
they are probably there. Without them the route also answers 503.

Check it worked:

```sql
select count(*), max(created_at) from public.waitlist_signups;
```

RLS is on with no policies, so `anon` and `authenticated` can do nothing; only
the service-role key writes. That is deliberate — these are email addresses
collected from the public internet and nothing client-side should read them
back.

---

## 7. Migration ledger — repaired 2026-08-31, and what it turned up

The ledger had 49 rows against 57 migration files: **21 files unrecorded**. The
standing advice was "never run `supabase db push`", because a push would try to
replay 21 migrations whose objects already existed.

Rather than repair the ledger blind, every object those 21 files create was
checked against the live schema first — 3 tables, 5 columns, 6 functions.

**Twenty were genuinely applied. One was not.**

`20260804000010_community_owner_update_guard.sql` had never reached production.
It is the fix for audit finding M2: the "soft-delete your own post" RLS UPDATE
policy is `USING auth.uid() = user_id` with no column restriction, so through
raw PostgREST an owner could update **any** column of their own row —

- `moderation_status` → self-approve a pending-image post before AI vision
  moderation runs, which defeats the pre-publication moderation Apple requires
  of user-generated content,
- `is_deleted` true→false → un-delete a post auto-moderation had removed,
- `reaction_count` / `comment_count` → vanity inflation.

Confirmed open (no guard triggers, both policies column-unrestricted), then
applied, then verified by simulating the attack as the `authenticated` role
inside a rolled-back transaction: all three writes were pinned to their old
values.

**Had the ledger simply been "repaired" to unblock pushes, that migration would
have been marked applied and the hole would have been sealed shut, permanently
unapplied and invisible.** Verify objects before repairing a ledger.

The ledger now records all 57 files, so **`supabase db push` is safe again**.

### The 13 "orphan" rows — RESOLVED 2026-09-01, and I had them wrong

I previously recorded these as changes applied straight to the database, and
concluded the schema **could not be rebuilt from this repo alone**. That was
wrong, and it is worth correcting because it would have driven real decisions.

Reading their `name` column settles it: **all 13 are migrations that ARE in the
repo**, recorded under a different, auto-generated timestamp —

```
20260618005110 workout_video_overrides  = 20260526000000_workout_video_overrides.sql
20260627171239 hide_pending_images      = 20260627000000_hide_pending_images.sql
20260629002013 fix_admin_set_user_tier  = 20260624010000_fix_admin_set_user_tier.sql
…13 of 13 matched by name
```

They came from a `supabase db push` run against a working copy whose files
carried CLI-generated timestamps, after which the files were re-created with
tidier ones. So the repo has always held the full schema.

Because of that, my ledger repair had recorded each of those migrations twice.
The duplicates are deleted; every canonical row was confirmed present first.

**The ledger and the repo now agree exactly: 57 rows, 57 files, no unrecorded
files and no orphan rows.** `supabase migration list` is clean and
`supabase db push` is safe.

The lesson worth keeping: a version mismatch is not evidence of missing source.
Check the `name` column before concluding anything is lost.
