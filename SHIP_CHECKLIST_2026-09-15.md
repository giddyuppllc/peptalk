# PepTalk ship checklist, 2026-09-15

PepTalk ships once, when everything below is done. Nothing here has been run
against production. It was prepared from branch `reconcile/master-2026-09-07`
after the three 09-15 feature branches were merged onto it. Every live fact
below came from a read-only check on 2026-09-15: `migration list --linked`,
SELECT-only `db query --linked`, and `secrets list` (digests only).

Do the sections in order. A later section depends on the one before it.

---

## 0. Before anything touches production

- [ ] `git fetch`. `origin/master` was `3e2561c` on 09-15, and the local
      branch is 38 commits ahead of it (this checklist's commit included), none
      pushed. **Decide** where this
      branch goes: fast-forward `master`, or a PR. CLAUDE.md says to work on
      `master`.
- [ ] Re-run the net on the exact commit you will ship. Every command must
      exit 0:
      `npx tsc --noEmit && npm run lint:ci && npx jest && npm run verify:all`

      **`verify:all` grew on 2026-09-16 and now takes ~20 minutes.** It ends
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

      Right now it reports `HEAD is not tagged v1.10.1` and `42 commits on
      HEAD are on no remote branch`. Clear both before building:
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
stopped being true: the live ledger is 11 files behind the repo (57 recorded,
68 files). Eight of those 11 are already live. `db push` would run them again,
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

The 09-15 probe confirmed that none of these three changes exists live.

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

### 1c. Close out
- [ ] `npx supabase migration list --linked`: all 68 local versions show a remote.
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
- [ ] A pending onboarding opt-in is not tied to an account. Sign-out and
      Delete My Data now clear it (tested). One path remains: someone signs up
      with no session (email-confirmation path), never confirms, and a
      different account signs in on that device. That account receives the
      opt-in. Decide whether to bind the pending choice to the signup
      email/user.
- [ ] Shared devices and push tokens (from the migration header): with UNIQUE
      (expo_push_token), a second user on the same device gets an RLS error
      instead of taking over the token. Reassigning it across users needs a
      server-side path.

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
- [ ] `aiDataConsent` still defaults to `true` (`useHealthProfileStore.ts:95`),
      and the v2 migration still forces it true (`:565`). 52eb417 already
      stops health data being sent without consent. The default is the open
      decision. The consent modal wording also needs to name health profile,
      Health data, labs and doses.
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
- [ ] "Apple ID" billing wording still appears in `app/subscription.tsx` and
      `app/(tabs)/profile.tsx`. Confirm it is gated off on Android and web,
      and write the Google Play and web variants (not re-checked for gating).

**Other**
- [ ] `app/settings/integrations.tsx:347-349`: Oura "approval in progress",
      Whoop "partnership in progress" still in a Coming Soon section.
- [ ] "Video coming soon" on exercises without clips: keep, hide, or form cues.
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
