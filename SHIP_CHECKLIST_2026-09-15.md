# PepTalk ship checklist, 2026-09-15

PepTalk ships once, when everything below is done. Nothing here has been run
against production. It was prepared from branch `reconcile/master-2026-09-07`
after the three 09-15 feature branches were merged onto it. Every live fact
below came from a read-only check on 2026-09-15: `migration list --linked`,
SELECT-only `db query --linked`, and `secrets list` (digests only).

**Updated 2026-09-16.** The four 09-16 branches are now merged in too —
`fix/privacy-manifest-and-reporting`, `feat/safety-only-compounds`,
`fix/profile-restore-races` and `fix/spend-ledger-and-dose-guard`. HEAD is
~80 commits ahead of `origin/master` (`3e2561c`), none pushed — count it
with `git rev-list --count origin/master..HEAD` rather than trusting this
number, which every commit to this file moves. On the
merged tree: `tsc` 0 · `lint:ci` 0 · `jest` 0 (**103 suites, 2167 tests**).
`verify:all` is **46 steps** and needs `PEPTALK_UNRELEASED=1` until §0's tag
and push are done.

Two merge resolutions are worth knowing about, because both changed behaviour
rather than just text:

- **`src/lib/plannedDose.ts` now reads through the display boundary.** The
  spend-ledger branch moved the "today's planned dose" logic out of
  `my-stacks.tsx` into that helper; the safety-only branch had just routed
  that screen through `src/data/dosingDisplay.ts`. Merged naively, the helper
  would have put a withheld figure back on the card. `verify:safetyonly`
  scans `src/lib`, so the raw version fails it — confirmed by reverting it
  (exit 1) and restoring it (exit 0).
- **`doseSafety.ts` now applies both new rules at once**: the flat 10 mg
  unit-confusion ceiling reaches resolved compounds, *and* the range is
  omitted from the warning text for a safety-information-only compound. The
  code auto-merged; only the two rationale blocks conflicted.

Do the sections in order. A later section depends on the one before it.

---

## 0. Before anything touches production

- [ ] `git fetch`. `origin/master` was `3e2561c` on 09-15 and is unchanged as
      of 09-16; the local branch is ~80 commits ahead of it, none pushed
      (`git rev-list --count origin/master..HEAD` for the real figure).
      **Decide** where this branch goes: fast-forward `master`, or a PR.
      CLAUDE.md says to work on `master`.
- [ ] Re-run the net on the exact commit you will ship. Every command must
      exit 0:
      `npx tsc --noEmit && npm run lint:ci && npx jest && npm run verify:all`

      **`verify:all` grew on 2026-09-16 to 46 steps and takes ~20 minutes.**
      The four merges added `verify:safetyonly` and `verify:privacymanifest`
      to it as well; both sides of the `package.json` conflict were kept, and
      no step was dropped (checked by parsing the chain: 46 named, 0 missing,
      0 duplicated). It ends
      with `verify:vacuous`, `check:migrations:self-test`,
      `test:leaderboard-sql:ci` and `verify:restoremutants` — the last of
      which is 34 mutants and about 15 of those minutes. They were all
      outside the chain, which meant the only thing running them was somebody
      remembering to.

      - `verify:vacuous` used to print its verdict and exit 0 even for a
        scanner that passes over an empty corpus. It exits non-zero now,
        INCONCLUSIVE included.
      - `test:leaderboard-sql:ci` needs Docker. Without it: loud SKIPPED
        banner and exit 0 locally, exit **1** under `CI`. Set
        `LEADERBOARD_SQL_OPTIONAL=1` to opt out on purpose — it still prints
        the banner. **Decide** whether the CI job gets a Docker service or
        the opt-out; until one of those, CI will fail on this step.
      - `verify:version` now fails on an untagged or unpushed HEAD (below).
- [ ] **`verify:version` will fail on this branch until you tag and push.**
      It only ever compared `app.json` against the latest `v*` tag, and with
      no tags at all it printed "no release tags to compare against yet" and
      exited 0 — the state of a fresh clone. It now also requires HEAD to
      carry `v<expo.version>` and to exist on a remote, which is precisely
      the 1.10.0 (75) failure CLAUDE.md records: a rejected binary that
      corresponded to no commit.

      Right now it reports `HEAD is not tagged v1.10.1` and `N commits on
      HEAD are on no remote branch` — it derives N itself, so read it from
      the check rather than from here. Clear both before building:
      ```bash
      git push origin reconcile/master-2026-09-07
      git tag v1.10.1 && git push origin v1.10.1
      ```
      `PEPTALK_UNRELEASED=1` downgrades it to a loud "NOT SHIPPABLE" notice
      for in-progress work. Do not build with that set.
- [ ] `npm run check:drift:cli`. Confirms the deployed edge functions still
      match `origin/master` before section 2 overwrites them
      (see `docs/EDGE-FUNCTION-DRIFT.md`).

---

## 1. Migrations

**Do NOT run `supabase db push`.** CLAUDE.md says it is "safe again". That
stopped being true: the live ledger is **13** files behind the repo (57
recorded, 70 files — two more arrived with the 09-16 branches). Eight of those
13 are already live. `db push` would run them again,
and `CREATE OR REPLACE FUNCTION` would overwrite the live function bodies.

Versions are unique and ordered. The check was
`ls supabase/migrations | cut -d_ -f1 | sort | uniq -d`, which printed nothing.
`20260517000000_push_tokens_device_unique.sql` is now a comment-only pointer.
Its version is already in the ledger, under the name `live_message_reports`,
so it needs no action.

### 1a. Already applied, missing from the ledger: repair only, do not re-run

A read-only probe on 09-15 found every object these files create present
live: every column, table, index and RLS policy, and each function with
anon/authenticated EXECUTE revoked. Record them and nothing else:

| Version | File | Live evidence (09-15) |
|---|---|---|
| 20260825000001 | subscription_environment.sql | `subscriptions.environment`, `subscription_events.environment` exist |
| 20260825120000 | age_attestation.sql | `profiles.age_range`, `age_attested_at`, `age_gate_min` exist |
| 20260825130000 | profile_personal_details.sql | `profiles.phone`, `date_of_birth`, `address_line1/2`, `city`, `region`, `postal_code`, `country` exist |
| 20260825200000 | welcome_email_sent.sql | `profiles.welcome_email_sent_at` exists |
| 20260826100000 | ai_credit_packs.sql | `ai_credit_grants`, `ai_credit_balance` (RLS on, read-own policies), `idx_ai_credit_grants_user`, `grant_ai_credits`/`consume_ai_credits` exist |
| 20260826140000 | credit_rpc_revoke_anon.sql | anon/authenticated EXECUTE = false on `grant_ai_credits`, `consume_ai_credits`, `purge_expired_aimee_pending_actions`, `_apply_user_id_rls` |
| 20260826180000 | credit_autorefill.sql | `ai_credit_autorefill` (RLS, policy), 3 functions, anon/authenticated EXECUTE false |
| 20260827090000 | purchase_validation_log.sql | table (RLS on), 3 `idx_pvl_*` indexes, `log_purchase_validation` (anon/authenticated false) |

The probe did not diff function bodies against the repo. If you want that
proof before repairing, compare `pg_get_functiondef` with each file first.

```bash
npx supabase migration repair --status applied 20260825000001 --linked
npx supabase migration repair --status applied 20260825120000 --linked
npx supabase migration repair --status applied 20260825130000 --linked
npx supabase migration repair --status applied 20260825200000 --linked
npx supabase migration repair --status applied 20260826100000 --linked
npx supabase migration repair --status applied 20260826140000 --linked
npx supabase migration repair --status applied 20260826180000 --linked
npx supabase migration repair --status applied 20260827090000 --linked
```

### 1b. Never applied: apply in this order, then record

The 09-15 probe confirmed that none of the first three exists live. Items 4
and 5 arrived on 09-16 and have never been applied anywhere.

**1. `20260915000000_community_reports_resolved_by_set_null.sql`** (from `78d266d`)
Changes `community_reports.resolved_by` to `ON DELETE SET NULL`, so Delete
Account works for moderators. No row changes.
```bash
npx supabase db query --linked -f supabase/migrations/20260915000000_community_reports_resolved_by_set_null.sql
npx supabase migration repair --status applied 20260915000000 --linked
```
Verify: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'community_reports_resolved_by_fkey';` must end in `ON DELETE SET NULL`.

**2. `20260915120000_push_tokens_token_unique.sql`** (from `d6139b6`)
Adds `UNIQUE (expo_push_token)` and drops the composite constraint. It deletes
no data. If a token is stored twice, it stops with an error.
Pre-check (on 09-15: 1 row, 1 distinct token):
`select expo_push_token, count(*) from public.push_tokens group by 1 having count(*) > 1;` must return 0 rows.
```bash
npx supabase db query --linked -f supabase/migrations/20260915120000_push_tokens_token_unique.sql
npx supabase migration repair --status applied 20260915120000 --linked
```
Verify: `select conname from pg_constraint where conrelid = 'public.push_tokens'::regclass and contype = 'u';` must be exactly `push_tokens_expo_push_token_key`.

**3. `20260915200000_community_leaderboard.sql`** (from `64d0290`)
Adds `profiles.leaderboard_opt_in` (default false), 3 indexes, and 6 functions
(3 callable, 3 internal). Passed 143 checks in the Docker test on 09-15.
```bash
npx supabase db query --linked -f supabase/migrations/20260915200000_community_leaderboard.sql
npx supabase migration repair --status applied 20260915200000 --linked
npm run verify:rpcgrants
```
Verify: no anon EXECUTE on any `get_community_*`, `get_my_leaderboard_metrics`
or `_leaderboard_*` function, and authenticated EXECUTE on the 3 `get_*` only.

**4. `20260916000000_aimee_spend_atomic.sql`** (from the 09-16 fix branch)
Adds `bump_aimee_spend`, a SECURITY DEFINER function that increments
`aimee_cost_cents` inside one `INSERT ... ON CONFLICT DO UPDATE`. Creates a
function and nothing else — no column, no constraint, no row change, no
backfill. `recordSpend` (`_shared/aiAllowance.ts` → `aimee-chat-stream/_cost.ts`)
calls it instead of the SELECT-then-UPSERT that lost nine of every ten
concurrent increments, including on the global sentinel row the
`AIMEE_MONTHLY_BUDGET_CENTS` runaway breaker reads.

**Apply this BEFORE section 2.** The edge functions in section 2 call the RPC
and have no fallback: deployed first, they would log `recordSpend failed` and
record no spend at all.
```bash
npx supabase db query --linked -f supabase/migrations/20260916000000_aimee_spend_atomic.sql
npx supabase migration repair --status applied 20260916000000 --linked
npm run verify:rpcgrants
```
Verify: `select proname, prosecdef, proconfig from pg_proc where proname = 'bump_aimee_spend';`
must show `prosecdef = t` and `proconfig = {search_path=}`, and
`verify:rpcgrants` must not list it (no anon or authenticated EXECUTE).

**5. `20260916120000_community_reports_user_and_ai_targets.sql`** (from the
09-16 privacy-manifest / reporting branch)
Makes a *member* and an *Aimee reply* reportable. `community_reports` was
polymorphic over exactly two targets and enforced it with
`CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)`, so
there was no shape in which a report could name a person — which App Review
1.2 wants for the leaderboard (it publishes another member's display name,
avatar and metrics to every signed-in user) and Play's generative-AI policy
wants for AI output. An Aimee message has no row to point at, so the report
carries the text and the time.

**Additive only.** Existing rows already satisfy the widened CHECK; no
backfill, no column dropped, no row rewritten. It drops the original
constraint by *looking its generated name up* rather than guessing at
`community_reports_check`, and re-adds it widened. Worth knowing: the
auto-moderator's IF/ELSIF tests post then comment, so the two new kinds fall
through to `RETURN NEW` — **no automatic action is ever taken against a member
or an assistant reply.** Whether N reports should suspend an account is a
business rule nobody has stated, so it was not invented. [DECIDE]
```bash
npx supabase db query --linked -f supabase/migrations/20260916120000_community_reports_user_and_ai_targets.sql
npx supabase migration repair --status applied 20260916120000 --linked
```
Verify: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.community_reports'::regclass and contype = 'c';`
must show `community_reports_exactly_one_target` summing **four** targets,
plus `community_reports_ai_time_with_text` and
`community_reports_no_self_report`. Member reports are deduplicated by a
partial unique index (`UNIQUE (reporter_id, post_id)` does not constrain rows
where `post_id IS NULL` — Postgres treats NULLs as distinct); AI reports are
deliberately not deduplicated.

### 1c. Close out
- [ ] `npx supabase migration list --linked`: all 70 local versions show a remote.
- [ ] `npm run check:migrations` — new on 2026-09-16, and the machine-checked
      version of the line above. It reads the live ledger (read-only:
      `supabase migration list --linked`, nothing else) and exits non-zero
      naming every repo migration with no ledger row.

      It cannot pass without an answer: a missing CLI, an unlinked project or
      any CLI error is exit 1 with the reason, never a skip. `npm run
      check:migrations:self-test` runs the parser against fixtures offline and
      is in `verify:all`.

      It reports orphan ledger rows as a warning, not a blocker, and it will
      NOT tell you to `db push` — some of the 11 unrecorded files are already
      applied under a different recorded timestamp (§1a), and pushing them
      blind is how the ledger got into this state.

---

## 2. Edge functions

`git diff origin/master --name-only -- supabase/functions` lists 23 files in 15
functions. The changed shared modules (`_shared/aiAllowance.ts`,
`_shared/aimeeConsent.ts`, `_shared/r2UserObjects.ts`) are imported only by
functions that are already on this list.

```bash
npx supabase functions deploy aimee-chat
npx supabase functions deploy aimee-chat-stream
npx supabase functions deploy aimee-lab-interpret
npx supabase functions deploy aimee-pantry-meal
npx supabase functions deploy aimee-pantry-parse
npx supabase functions deploy aimee-pantry-scan
npx supabase functions deploy aimee-plan
npx supabase functions deploy aimee-recipe
npx supabase functions deploy aimee-report-rewrite
npx supabase functions deploy aimee-voice
npx supabase functions deploy aimee-workout
npx supabase functions deploy food-scan
npx supabase functions deploy lab-scan
npx supabase functions deploy delete-user
npx supabase functions deploy clinical-review --no-verify-jwt   # per its own header
```

- `aimee-chat-stream` needs the leaderboard migration (1b.3) applied first:
  its navigation map now points at `/community/leaderboard`.
- `aimee-usage` imports `readCreditBalance` from `aimee-chat-stream/_cost.ts`.
  That export is still present (`_cost.ts:104`).
- `delete-user` now purges R2 images. `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_COMMUNITY_BUCKET` and
  `R2_PUBLIC_BASE` are all set.
- [ ] **Deploy order for the seven consent-gated functions.** `lab-scan`,
      `aimee-lab-interpret`, `aimee-report-rewrite`, `aimee-pantry-meal`,
      `aimee-plan`, `aimee-recipe` and `aimee-workout` now read `hasConsent`
      off the request body and treat an ABSENT flag as no consent — the same
      fail-closed shape `aimee-chat` already uses. A client build older than
      this branch sends no flag.

      So deploying these AHEAD of the app strips health fields (and, for the
      first three, refuses outright with a 403) for everyone still on the old
      build. Ship the app first, or in the same window. If you must deploy
      early, say so — it is a visible behaviour change, not a silent one.
- [ ] Afterwards, run `npm run check:drift:cli`. It should report no drift.

---

## 3. Web (PWA)

```bash
npm run deploy:web
curl -s "https://app.peptalk.bio/?cb=$(date +%s)" | grep build-commit   # must equal the shipped SHA
```
Live on 09-15: build-commit `02d7626`. `.env` must still hold the four
`EXPO_PUBLIC_SQUARE_*` / Sentry values and end with a newline (CLAUDE.md).

---

## 4. Store builds

- `app.json` version is `1.10.1`. The only tag is `v1.9.9`. App Store Connect
  last held `1.10.0 (75)`, which was rejected. `eas.json` uses
  `appVersionSource: remote` with `autoIncrement`, so EAS assigns build
  numbers.
- [ ] **Decide** whether `1.10.1` stays or gets bumped. If it is bumped,
      commit the bump.
- [ ] Tag the exact commit EAS will build (`git tag v1.10.1`) and push the tag
      (CLAUDE.md: "Releases must be traceable").
- [ ] `npm run preflight`
- [ ] `eas build --platform all --profile production`, then `eas submit`.
      Native-only fixes in this batch: push-token error reporting, notification
      prompt timing, the camera permission flow, Android blocked permissions,
      onboarding restore, and the leaderboard.
- [ ] Manual Maestro flow: `.maestro/login-returning-user.yaml` on an ERASED
      device (a returning account restores its onboarding answers).

---

## 5. Console items (Edward, in the store / Supabase dashboards)

From the App Review sweep (CAN'T VERIFY) and the 09-15 verification:

- [ ] **Google Play billing key**: `GOOGLE_SERVICE_ACCOUNT_JSON` is still the
      placeholder (digest unchanged, `updated_at` 2026-05-05). Paste the real
      JSON. Then Play Console → Monetization setup → Send test notification,
      confirm the Pub/Sub push subscription to `/functions/v1/google-rtdn`
      with OIDC, and run `reconcile-purchases`.
- [ ] Supabase Auth → Redirect URLs: add `https://app.peptalk.bio/**`. PWA
      password reset and verification links fall back to peptalk.bio without
      it.
- [ ] **Password reset now has a screen to land on** (`app/set-password.tsx`,
      new 2026-09-16). The reset email has always said "follow the link to
      pick a new password"; the link set a session and routed home, and
      `auth.updateUser({ password })` existed nowhere in the repo.

      Nothing to deploy — it is app code — but it only works if the redirect
      URLs above are whitelisted, on BOTH paths: `peptalk://auth/callback`
      for the native builds and `https://app.peptalk.bio/**` for the PWA.
      Test it end to end on a real device and in the installed PWA before
      shipping; the native path keys off `type=recovery` in the link, the web
      path off Supabase's `PASSWORD_RECOVERY` event.
- [ ] Supabase Auth: `mailer_autoconfirm` is `true`. Order: redirect URL → SMTP
      or verified Resend domain with DKIM → Confirm email ON → real signup test.
- [ ] Email: `RESEND_API_KEY` is not set, so no transactional email has ever
      sent (`welcome_email_sent_at` 0 of 234). Also set `EMAIL_FROM` on a
      mailbox Edward owns.
- [ ] Reviewer login works on an erased device on both stores. The Play
      reviewer password was blank on 25 Aug.
- [ ] ASC: attach `peptalk_plus_monthly` and `peptalk_pro_monthly` to this
      version's submission. Confirm no intro offer or free trial is configured
      (the paywall shows no trial terms).
- [ ] ASC: EULA field, description with a Terms of Use link, keywords,
      screenshots. Every named feature must be reachable, with no Android or
      Google references.
- [ ] ASC App Privacy labels: phone, address, DOB, health, fitness, audio,
      photos, purchases, crash + performance, all linked.
- [ ] Age rating: the Apple questionnaire and Play IARC must agree (Play showed
      3+, Apple 16+; the in-app gate is 18+).
- [ ] Play: Health apps declaration + Health Connect declaration. It must list
      WRITE_WEIGHT and READ_HEART_RATE (the app uses both), unless you decide
      to drop them.
- [ ] Play: Data safety form (last edited in May; camera/photo, personal
      details and AI sharing were added since).
- [ ] Play full description: "Apple Watch & Google Fit sync" (the app uses
      Health Connect, not Google Fit).
- [ ] Current store state: the ASC version record, and Play production (vc24)
      vs the vc41 draft. Do not roll out vc40. Order: Pub/Sub → credentials →
      tax/W-9 → roll out. The payout name reads "Jamie Meng" on a Giddy Upp
      LLC account.
- [ ] `support@peptalk.bio` and `privacy@peptalk.bio` actually receive mail.
- [ ] Deep links: `https://peptalk.bio/.well-known/assetlinks.json` returns a
      308 to www, then a 404. Serve it from the apex, and supply the SHA-256
      app-signing fingerprint (Play Console → App integrity).
- [ ] Active `crm_webhook_endpoints` rows: if subscription events and user id
      go to an external CRM, that sharing has to be declared.
- [ ] Rotate the reviewer password. It is committed in
      `docs/app-store-review-notes.md` history.

---

## 6. Edward decisions still open

Wording is Edward's. Each item was re-checked against this branch on 09-15
unless marked otherwise.

**Leaderboard (new today)**
- [ ] Every leaderboard string is marked DRAFT in
      `src/constants/leaderboardCopy.ts`. Edward writes the final words.
- [x] ~~A pending onboarding opt-in is not tied to an account.~~ **Closed
      2026-09-16** (`766420e`, merged). The address the choice was made for is
      persisted alongside it and the flush requires a match, mirroring the
      `resume.userId === currentUserId` guard in `app/onboarding.tsx`. A
      different account signing in clears the held choice instead of
      inheriting it; no session keeps it waiting; a choice that cannot be
      attributed to an address — including the bare boolean an older build
      persisted — is not held at all. Tested with A-signs-up/B-signs-in.
- [ ] Shared devices and push tokens (from the migration header): with UNIQUE
      (expo_push_token), a second user on the same device gets an RLS error
      instead of taking over the token. Reassigning it across users needs a
      server-side path.

**A per-dose maximum from Jamie (merged 2026-09-16)** [DECIDE]
- [ ] The overdose guard's only high-dose rule for a resolved compound was
      `amount > 3× the maximum`. Jamie's rulings now win on precedence, and
      several of them state a whole **titration span** rather than a per-dose
      window — semaglutide "250 mcg – 12 mg" makes 3× the top a 36 mg ceiling,
      so 25, 30 and 35 mg logged silently while the same dose typed as
      "Ozempic" (which does not resolve) warned. Twenty compounds regressed
      that way, retatrutide at 35 mg and glutathione at 1 g among them.

      Fixed **without inventing a number**: the flat 10 mg unit-confusion
      ceiling now also applies to a resolved compound, lifted only by that
      compound's own documented maximum, so knowing the compound is never less
      protective than not knowing it. The real fix is a per-dose maximum from
      Jamie for the compounds whose ruling is a span. That is hers to give, not
      ours to derive.

**Safety-information-only compounds (merged 2026-09-16)** [WORDS]
- [ ] Three empty copy slots in `src/constants/safetyOnlyCopy.ts`. Every one
      renders **nothing** while empty — no box, no placeholder, no "coming
      soon" — so the app is shippable without them; they are additive.
      `SAFETY_ONLY_WHY_NO_DOSE` (peptide detail, where the dosing cards were),
      `SAFETY_ONLY_PRESCRIBER_LINE` (several listed compounds are
      prescription-only: hCG, hMG, somatropin, enclomiphene, MK-677, YK-11),
      `SAFETY_ONLY_AIMEE_STOCK_ANSWER` (the on-device bot; the server prompt is
      instructed separately and does not read this file).
- [ ] The **existing** empty-state sentence says the compound "doesn't have a
      published human-trial dosing protocol in our catalog". That is false for
      hCG, somatropin and MK-677 — the app has data for them and is choosing
      not to print it. It is currently hidden for listed compounds rather than
      rewritten, because the replacement sentence is Edward's.
- [ ] 17 ids are on the list (`src/data/safetyOnlyCompounds.ts`), mirrored for
      Deno. Two of them — testosterone and gonadorelin — are not compounds in
      the app at all (a lab marker and a goal-matrix entry), listed anyway so
      the list reads as the decision rather than as whatever happens to be
      mappable today. Oral 5-Amino-1MQ was deliberately left showing a dose.

**App Review 1.4.1: dose calculator posture (sweep B)**
- [ ] The iOS posture for dosing surfaces: pure unit math vs protocols for Rx
      and unapproved agents, plus a "Sources & method" disclosure.
- [ ] `app/calculators/index.tsx:65` still says "Edward's recommended ladder".
- [ ] "Aggressive" intensity label (`app/doses/calculator.tsx:85`, and the tiers
      in the Aimee prompts).
- [ ] Supplier-selection content: `src/data/knowledgeTopics.ts:199-221`,
      `src/data/educationalArticles.ts:256`. Testing-lab names Janoshik and
      Colmaric: `educationalArticles.ts:76`, `howToGuides.ts:144`.
- [ ] Plan copy that sells Aimee as a dosing adviser *and* says "/day":
      `app/subscription.tsx:86` "20 personalized chats/day on dosing…",
      `app/onboarding.tsx:123` "Aimee chat (20/day) on dosing & timing".
      The actual allowance is monthly.
- [ ] Whether Aimee may quote doses for compounds outside the curated set
      (`aimee-chat/_prompt.ts`, not re-checked).
- [ ] Cardarine line in `aimee-chat-stream/_prompt.ts` ("10-20 mg figures are
      community-only"; not re-checked).

**Privacy and consent (sweep F, G, H)**
- [ ] 🚩 **The notes tell Apple the opposite of what the code does. Settle
      this before submitting — it is the one open item that is a false
      statement to App Review, not a preference.**

      `docs/app-store-review-notes.md:124` says consent is *"opt-in and off by
      default"*. On the merged tree (line numbers re-checked 2026-09-16):
      `src/store/useHealthProfileStore.ts:114` is `aiDataConsent: true`, and
      the v2 migration at `:581-593` rewrites a **stored `false` back to
      `true`** — so it does not merely default on, it reverses a recorded
      "no". The migration's own comment explains why it was done (testers were
      all on the old opt-in default, onboarding never showed the toggle, so
      everyone got the on-device bot and Aimee looked broken), which is a real
      reason and a different question from what the notes claim.

      Deliberately untouched on 2026-09-16: the gate now works, so the default
      is the whole decision, and it is Edward's. **Either change the default
      and drop the migration, or change the sentence in the notes.** Shipping
      both as they are means submitting a claim the binary contradicts.
      `docs/app-store-review-notes-additions-2026-09-16.md:241-246` flags the
      same thing from the notes' side.
- [ ] **The consent copy is now wrong in two places, because the behaviour
      changed under it on 2026-09-16.** [WORDS]

      `src/utils/ensureAiConsent.ts:26` — the launch modal. It names messages,
      voice and photos, and never mentions health data at all. There are TWO
      consents and it only describes one of them; the health toggle
      (`profile.aiDataConsent`) is what governs the profile, labs, doses,
      side effects, check-ins and allergies, and a user who accepts this modal
      has not been told about that.

      `app/health-profile.tsx:810-814` — the toggle's own description ends
      "Without this, you'll get local-only responses." That was never true for
      the nine feature functions, and it is not true now either: with the
      toggle off, meal plans, recipes, pantry suggestions and workout design
      still run against the AI, just with no health fields attached. Lab
      interpretation, the lab photo scanner and the weekly-report rewrite do
      stop entirely.
- [ ] Two consent-driven client refusals fall back to a SILENT return, which
      matches the existing declined-modal behaviour but tells the user
      nothing: the lab photo scan in `app/health-report/labs.tsx` and the
      weekly-report rewrite. Decide whether either deserves a sentence.
      [WORDS]
- [ ] `NSMicrophoneUsageDescription` (`app.json:23`) says audio "never leaves
      the app without being transcribed first". It is uploaded for
      transcription.
- [ ] `app/privacy.tsx:57` says PepTalk "does not write data back to Health
      Connect". Android weight write shipped.
- [ ] `app/privacy.tsx:100` says Delete My Data will "Delete all data" /
      permanently erase. Delete My Data is now, by design and by test, **this
      device only**. The sentence has to match.
- [ ] `app/privacy.tsx:82`: diagnostics described as anonymous, but Sentry
      gets the user id. The collected-data list also omits phone, DOB, address,
      weight and height. Privacy manifest data types (sweep H): not re-checked.
- [ ] peptalk.bio/privacy says "Apple Health or Google Fit".

**Paywall and plan claims (sweep I, J, O, A5)**
- [ ] `app/subscription.tsx:98` "Everything in Free, ad-free" (Free has no ads).
- [ ] "Early access" framing: `subscription.tsx:83`, `:102` badge, `:117`.
- [ ] "Full demonstration video library for every exercise" (about 122 of 384
      have clips; not re-checked).
- [ ] Sold but ungated: "Searchable research source library" (Pro) and
      "Apple Watch + Apple Health sync" (Plus). Gate them or stop selling them.
- [ ] Per tier key: gate it or stop selling it (`dose_logging`,
      `health_calendar`, `biomarker_tracking`, `pdf_export`, `watch_sync`, …).
- [ ] Profile "Export My Data" opens the Pro health-report paywall. Decide on
      an ungated export or a rename (not re-checked).
- [ ] "Apple ID" billing wording: **the paywall side is gated to iOS as of
      2026-09-16** and `npm run verify:applebilling` (in verify:all) keeps it
      that way. What is left is the copy that replaces it. [WORDS]
      - Android and web pre-purchase disclosure (the sentence after
        "auto-renews monthly until cancelled" — Play and Square each need
        their own cancellation pathway).
      - Android and web footer disclosure (currently nothing renders there).
      - What the paywall's Terms link points at off iOS. Apple's standard
        EULA governs an App Store purchase and nothing else; `app/terms.tsx`
        exists, but which document governs a Play or Square purchase is not a
        default to pick.
      - The Play/Square wording for two warnings that were deliberately NOT
        gated, because hiding them would DROP a real billing warning:
        `app/(tabs)/profile.tsx` delete-account (both branches) and
        `app/subscription.tsx`'s AlreadyOwnedError alert. Both are
        allowlisted in the check with that reason.
      - `app/(tabs)/profile.tsx:897` says "App Store review" / "App Store
        listing" on Android too. Not billing, so outside the check.
- [ ] **"Unlimited Aimee chat" versus the monthly allowance cap.** [WORDS]
      `app/subscription.tsx:111` sells "Unlimited Aimee chat" and
      `src/components/PaywallModal.tsx:109` says "no message limits", while
      `supabase/functions/_shared/aiAllowance.ts` enforces a per-tier monthly
      allowance and refuses past it. Not rewritten — Edward writes the words.
- [ ] **Sold as Pro, gated nowhere, and no key exists to gate them on.**
      `app/subscription.tsx:113` "Multi-week training programs" and `:116`
      "Searchable research source library". `app/workouts/program/[programId]
      .tsx` and `app/resources.tsx` have no PaywallGate, useFeatureGate or
      tier check of any kind, and BOTH keys were deleted on 2026-09-07:
      `workout_programs` (src/types/fitness.ts:470-474, removed because it was
      sold as Pro while every free user had it) and `research_feed_premium`
      (:481-484, removed because it had no screen at all).

      So there is nothing to gate them on without adding a key, which is a
      product decision, not a fix. Gate them or stop selling them. **Decide.**
- [ ] **A rendered price claim changed on 2026-09-16 and needs your eye.**
      `PaywallModal.getRequiredTier` walked ['pro','plus','free'] and returned
      the FIRST hit; PRO_FEATURES is `[...PLUS_FEATURES, …]`, so every granted
      key matched 'pro' immediately and the modal said "Available with PepTalk
      Pro" / "Upgrade to PepTalk Pro" for PLUS features — lab_scan, meal_scan,
      ad_free, community_live_chat — then opened a subscription screen whose
      own tierForFeature highlights Plus. It now returns the minimum tier, so
      those say PepTalk+. The template is untouched; only the tier substituted
      into it changed.

**Other**
- [ ] `app/settings/integrations.tsx:347-349`: Oura "approval in progress",
      Whoop "partnership in progress" still in a Coming Soon section.
- [ ] "Video coming soon" on exercises without clips: keep, hide, or form cues.
      (`src/components/ExerciseVideo.tsx:57` and its `.web` twin,
      `app/workouts/player-v2.tsx:169`, plus the empty state at
      `app/learn/videos/index.tsx:97-99` and the always-on "COMING SOON" pill
      on `src/components/MaxYourStackCard.tsx:89`.) Left alone on 2026-09-16.
- [ ] **`AI_UNAVAILABLE_BODY` in `app/nutrition/recipe-generator.tsx` is
      empty and the notice is hidden until it is not.** [WORDS] The box used
      to render an icon, the heading "Aimee unavailable", and nothing else — a
      TODO sat where the sentence goes. The title is written and stays
      written; one constant needs the body (that these are the built-in
      recipes, and to try again later — your words).
- [ ] **Two reused strings on the new `app/set-password.tsx`.** [WORDS]
      Every string on that screen already existed elsewhere, which is why
      nothing was invented, but two of them are reused rather than chosen:
      the screen heading is currently the field label "Password", and the
      submit button is "Continue".
- [ ] `app/peptide/[id].tsx:1482` footnote "protocol's published research bounds".
- [ ] Onboarding Create Account step has no Terms/Privacy links (sweep R; not
      re-checked).
- [ ] Guest browsing, or at least an optional last name, before account
      creation (sweep M).
- [ ] Play AI-generated content: no in-app "Report response" on Aimee output
      (sweep L; new build).
- [ ] `reconcile-purchases` runs on no schedule. The platform choice is yours:
      pg_cron + pg_net, or an external cron.
- [ ] Orange colours still live (`#f97316`, `#fb923c`, `#D08850`/`#B97A48`; list
      in the 09-15 verification). Edward picks replacements.
- [ ] Mobile optimisation pass (app and peptalk.bio), with 390px screenshots
      first.
- [ ] Link SBB Supply into PepTalk: not in the repo. Edward's call; 1.4.1
      exposure applies.
- [ ] Credit pack at $4.99 vs "$5": confirm.
