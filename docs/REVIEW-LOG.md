# PepTalk ship review — standing log

One document across six reviews of the same body of work. PRs #19–#23 are a
stack: each is based on the one before it, so its diff is only its own slice.
PR #18 is the whole thing against `master`, reviewed last, once the pieces have
been.

**Read this before reviewing.** It carries what earlier reviews already
established, so nobody spends a run rediscovering it, and it carries the open
questions so a reviewer can answer one rather than re-ask it.

**How it is maintained.** A reviewer cannot commit to this file. Findings are
transcribed here after each run — verdict, what survived verification, what was
rejected and why. If you are reviewing, structure findings so they transcribe
cleanly: one finding per item, file and line, the concrete failing input, and
your own confidence. "This looks risky" costs a round trip; "this throws on
`{"doses":null}` at DoseHeatmap.tsx:62" does not.

---

## The standing brief

This is an enterprise health-journalling and harm-reduction app. It presents
protocols and dosing ranges so people can understand them **in relation to
their own goals**. It does not prescribe, and it does not tell anyone what they
need. Acceptable ranges of use, not instructions.

Consequences that matter when reviewing:

- A wrong dose figure carries the app's full authority. Dose changes are not
  ordinary code changes.
- **Jamie Esposito is the approving clinician.** Where she has ruled, her ruling
  wins over every stored figure. `src/data/clinicianRulings.ts` is the record of
  what she actually wrote and is deliberately never edited for readability —
  `rulingDoseMcg()` parses it for the overdose guard. `clinicianRulingsDisplay.ts`
  renders it.
- User-visible copy is Edward's. New copy is marked **DRAFT — Edward approves**.
  Flag copy you think is wrong; do not assume it is a bug.
- App Review has rejected this app repeatedly. The recorded causes are in
  `CLAUDE.md` and are not hypothetical.

## Conventions a reviewer should know before calling something odd

- **Verify by exit code, not by grepping output.** A crashed check prints no
  "FAIL". `npm run verify:all | tail` reports `tail`'s status; this has already
  hidden a real failure once in this work.
- **`verify:all` fails on purpose right now**: HEAD is deliberately untagged, and
  the release gate refuses an untagged commit. Run it as
  `PEPTALK_UNRELEASED=1 npm run verify:all`.
- **Checks are mutation-tested against themselves.** A check nobody has tried to
  break is treated here as decoration. If you find one that cannot fail, that is
  a finding.
- **Windows CRLF is a live hazard.** Two of three `verify:safetyonly` mutants had
  never run on this machine: the anchors use `\n` and the files are CRLF. The
  suite claimed to prove three things and proved one.
- Source-scanning tests are deliberate where a behavioural test would pass
  against the broken version — several are, and each says why.

---

## Established, so no review needs to re-derive it

| Fact | Evidence |
|---|---|
| `merge` in zustand 5.0.14 is a bare `{ ...current, ...persisted }`, no validation | `node_modules/zustand/middleware.js:337` |
| A `version` bump with **no** `migrate` DISCARDS persisted state and hydrates defaults — it does **not** hang | `middleware.js:410` returns `[false, undefined]`; measured directly |
| `null` is the only corrupt value `JSON.stringify` itself emits (NaN, Infinity, undefined-in-array all → null) | measured |
| `GOOGLE_SERVICE_ACCOUNT_JSON` is the literal three characters `{…}` | sha256 match, unchanged since 2026-05-05 |
| `OPENAI_API_KEY` is an **xAI** key — `OPENAI_BASE_URL` is `https://api.x.ai/v1` | sha256 match |
| Vision functions are fine: they fall back to `OPENAI_WHISPER_API_KEY`, a real OpenAI key | `food-scan/index.ts:20-28` |
| 13 active paid subscriptions: 6 web plus, 5 web pro, 2 iOS pro. **Zero Play.** | live query |
| `peptalk.bio` has no Resend DKIM; SPF is Google-only; DMARC is `p=quarantine` | live DNS |
| The live PWA serves `02d7626`, from 2026-09-12 | `curl app.peptalk.bio` |

## Ruled out — do not re-raise without new evidence

- `src/lib/routeGuard.ts` is **not** the cause of the 2.1(a) login loop. It is
  loop-free and its tests hold. The cause is the session *persistence write*.
- The redirect in `routeGuard` rule 3 must **not** be softened. Letting an
  unverifiable session through reopens the hole closed in `02d7626`. A mutant
  that makes exactly that change is in `verify:sessionloopmutants`.
- `healthKitAdapter` filters non-finite samples before its session maths
  (`healthKitAdapter.ts:638`) — its `new Date(...).toISOString()` is safe.
- `healthConnectService`'s date conversion is inside a `try/catch`.
- `useCommunityStore`'s `cutoff` is `Date.now()` minus a constant.

---

## Open questions for Edward — not defects

1. **Three door-less screens.** `/calculators`, `/calculators/reconstitution`
   and `nutrition/food-scanner` each duplicate something already reachable.
   Wiring them puts two of the same tool in the menu; deleting them throws away
   working code. Which survives is a product call.
2. **`shouldForwardHome` vs `app/auth.tsx`** disagree on whether "onboarded"
   requires a gender. Not reachable from a clean install (`aboutYouAnswered()`
   requires gender, so the server restore cannot produce that state) — only
   legacy local state can. Changing who gets re-asked onboarding questions is
   not a scanner's call.
3. **`terms.tsx` says nothing about auto-renewal or cancellation** across 219
   lines, for an app selling auto-renewing subscriptions on three platforms. The
   paywall carries the Apple 3.1.2(a) disclosure, so this is not a review
   blocker — but the EULA is silent on the subscription it governs.
4. **Camera and photo-library permissions** are requested at four call sites with
   no pre-prompt explainer. Allowed (only HealthKit mandates one), but a denied
   camera permission is permanent on first ask, and what those screens do on
   denial is unaudited.
5. **38 persisted stores, 3 with a real migration.** Now safe against corrupt
   blobs, but no store has a migration path for a deliberate schema change.

## What it actually takes to go live — verified 2026-09-18, not transcribed

Every line here was checked against the live project or the live DNS today. Where
something could not be checked, it says so rather than guessing.

### ✅ CLEARED 2026-09-18 — the 13 unapplied migrations

**All 70 migrations are now in the live ledger; `check:migrations` exits 0.**

Nine were already applied and the ledger had simply lost them — repaired, no SQL
run: `subscription_environment`, `age_attestation`, `profile_personal_details`,
`welcome_email_sent`, `ai_credit_packs`, `credit_rpc_revoke_anon`,
`credit_autorefill`, `purchase_validation_log`,
`community_reports_resolved_by_set_null`.

Four were genuinely absent and were applied: `push_tokens_token_unique`,
`community_leaderboard`, `aimee_spend_atomic`,
`community_reports_user_and_ai_targets`.

Checked afterwards against the live schema rather than against the ledger:
`profiles.leaderboard_opt_in`, `community_reports.reported_user_id`, the
`push_tokens_expo_push_token_key` constraint, `bump_aimee_spend` and
`get_community_leaderboard` all exist, and **anon cannot execute
`get_community_leaderboard`** — the property that migration was written to hold.

**Two traps worth carrying into the other reviews**, because the same shape is
everywhere in this repo:

- A first probe reported the credit-pack tables MISSING. The names had been
  guessed; the real ones are `ai_credit_balance` and `ai_credit_grants`, both
  live. Acting on that would have re-run a migration that then failed.
- Object existence does not prove a `REVOKE` ran. `credit_rpc_revoke_anon`
  exists to remove anon access, so the ACLs were read directly: `anon` and
  `authenticated` are both false on all seven functions.

Pre-flight before the push: the only `INSERT` among the four sits inside a
function body, not a migration-time data change, and `push_tokens` held one row
with zero duplicates, so the UNIQUE could not fail. Dry-run first; it listed
exactly the four expected.

**How this stayed invisible.** `check:migrations` could not parse the CLI's
output — it now answers JSON and the parser only understood the table — so it
reported "no migration rows" **while printing thirteen of them underneath its own
failure message**. Every self-test passed throughout, because they exercise the
parser against fixtures rather than against the CLI. Fixed in `64f5e18`. This is
the canonical example in this repo of why a green check is not evidence.

### ⚠️ Unverified — nobody can answer these from this machine

- **Edge-function drift.** `check:drift` needs `SUPABASE_ACCESS_TOKEN`, which is
  not set here, so whether the 55 deployed functions match this branch is
  **unknown**. `docs/EDGE-FUNCTION-DRIFT.md` last spoke on 2026-09-01. Five more
  functions are deployed with no source in this repo (`DB_HANDOFF.md`).
- **Store build state.** Not checkable without console credentials.

### 🔴 Blocking, needs Edward — no amount of code fixes these

| What | State today | Consequence |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | literal `{…}`, 3 chars, unchanged since 2026-05-05 | **every Android purchase fails validation** |
| `RESEND_API_KEY` | unset | no transactional email has ever sent |
| `peptalk.bio` mail DNS | no Resend DKIM · SPF is Google-only · DMARC `p=quarantine` | setting the key alone sends **every welcome email to spam** |
| Play Console SHA-256 | not supplied | `assetlinks.json` cannot be completed; Android deep links stay dead |
| `SQUARE_LAUNCH_TRIAL_UNTIL` | unset | no launch trial is running |

Unset but **harmless** — verified to have working fallbacks, so do not chase
them: `GROK_API_KEY` (falls through to `XAI_API_KEY`), the Grok cost-per-token
overrides, `OPENAI_VISION_API_KEY` / `OPENAI_TRANSCRIBE_API_KEY` (fall through to
`OPENAI_WHISPER_API_KEY`, a real OpenAI key), `AIMEE_MONTHLY_CENTS_*` (code
defaults are the live values).

### The channels, and where each stands

| Channel | Live now | Notes |
|---|---|---|
| PWA | build `02d7626`, from **2026-09-12** | six days behind; today's users have the silent Aimee fallback and the 3-message free cap |
| iOS | 2 active Pro subscriptions | IAP works |
| Android | **zero** subscriptions, ever | consistent with the dead service account |
| Web / Square | 11 active subscriptions | works |

Nothing here has been submitted or deployed, deliberately: HEAD is untagged, and
`CLAUDE.md` requires every submitted build to come from a commit that sets its
version and is tagged.

---

## Which documents to trust

This repo has 34 markdown files and they do not agree with each other.
`CLAUDE.md` already records what that costs: *"that is how the HealthKit
rejection got recorded inverted and shipped twice."* A reviewer acting on a
stale doc is a real failure mode here, not a tidiness complaint.

| Doc | Last touched | Trust |
|---|---|---|
| `CLAUDE.md` | 09-16 | **Current.** Read first. |
| `SHIP_CHECKLIST_2026-09-15.md` | 09-16 | **Mostly current**, predates this session. Its §1 migration list is the worked version of the blocker above — but it was written when `check:migrations` was blind, so re-verify against the live ledger. |
| `docs/app-store-review-notes*.md` | 09-16 | Current. |
| `CSP.md`, `DOSING_*` | 09-15/16 | Current. |
| `DEPLOY_RUNBOOK.md` | 08-30 | **Stale — CLAUDE.md says so explicitly**: "stops at June". |
| `docs/TONIGHT-LAUNCH-CHECKLIST.md` | 08-30 | **Stale**, named by CLAUDE.md. |
| `HANDOFF-healthkit.md` | 08-30 | **Stale**, named by CLAUDE.md. |
| `CHANGELOG.md` | 08-31 | **Stale** — still titled with a May branch name. |
| `docs/EDGE-FUNCTION-DRIFT.md`, `docs/DRIFT-REVIEW.md` | 09-01 | Point-in-time; drift is unverified since. |
| `DB_HANDOFF.md`, `HANDOFF-2026-09-01.md` | 08-31/09-01 | Useful for the five source-less functions; otherwise dated. |
| `PUNCH_LIST.md` | 08-09 | 5 weeks old. |
| `INTENT_REVIEW.md`, `DATA_RECOVERY_BACKLOG.md` | 08-06/10 | 6 weeks old. |
| 8 files from April–May | — | `tester-feedback`, `JAMIES-DESIGN-IDEAS`, `PAGE-REFERENCE`, `ACCESSIBILITY_TODO`, `VIDEO_CONTENT_TODO`, `SUPABASE_RLS_CHECKLIST`, `docs/WORKOUT_VIDEOS`, `DEPLOY_VIDEOS`. **Four to five months old.** |

**The spec the code cites is not in the repo.** Several commits reference
"Master Refactor Plan v3.1 §8 + §14", "§12.1" and similar.
`peptalk-master-plan.md` is gitignored (`.gitignore:51`), so a reviewer cannot
read the document those section numbers point into. That is deliberate, not an
accident — but it means any review comment of the form "why is it built this
way" may have an answer the reviewer has no access to.

**Doc consolidation is Edward's call, not a reviewer's finding.** Deleting or
merging these is a decision about what to keep, and nobody should spend a review
run recommending it.


## Review log

### PR #18 — whole branch (285 files) — NOT REVIEWED
Rejected by the tooling as too large. Split into #19–#23. Review last, as an
integration pass, once the pieces are done.

### PR #19 — consent, permissions and the claims the app was making — REVIEWED
Two findings, both `nit`.

1. **`src/lib/protocolDoseMath.ts` — two functions answered "what dose does this
   intensity mean" and only one read the authored bands.** CONFIRMED and FIXED
   in `f12109d`. `intensityToDoseRange` honoured `doseBands`; `intensityToDose`
   split the typical range into thirds. It rendered consistently only because
   proto-ss31's bands are typicalDose's own extremes; a protocol with a band
   INSIDE a wider range would have shown two different doses on one screen and
   handed the wrong one to ActivateProtocolButton. `doseSanity` stays green
   throughout — neither figure is out of range, they just disagree.
   The mutation run then caught the first test being weak: its fixture copied
   proto-ss31 and used `min === max` bands, so "mild takes the top of its band"
   survived. Widened; 4/4.
2. **`app/nutrition/recipe-generator.tsx` — the fallback notice ships with an
   empty body.** CONFIRMED. Deliberate: `AI_UNAVAILABLE_BODY` is empty and the
   notice is hidden while it is, so nothing half-finished renders. Awaiting
   Edward's sentence.

### PR #20 — the leaderboard, Delete My Data, per-account isolation — REVIEWED
Three findings: two `normal`, one `nit`. **All three are correct for this
slice's tip and all three are already fixed by slice #21.** Verified
individually against HEAD, not assumed.

1. **`src/services/peptalkBot.ts` emits doses for safety-only compounds**
   (`normal`). Correct at #20. Fixed by `6bae1ef`. All three leak paths the
   review named are closed at HEAD: the dosing-table entry (peptalkBot.ts:977),
   the protocol's Typical Range block (:1021), and `importantNotes` through
   `redactDoseBearingNotes` (:1050). `verify:safetyonly` passes.
2. **`useLeaderboardStore.pendingOptIn` crosses accounts** (`normal`) — user A
   abandons signup at email confirmation, the opt-in persists device-scoped, and
   user B's next login writes `leaderboard_opt_in = true` to B's profile. Correct
   at #20, and the most serious finding so far. Fixed by `766420e` / `c99480e`:
   the choice is persisted with the address it was made for, an unattributable
   one is dropped rather than applied, and a mismatch between `signedInAs` and
   `pendingOptInEmail` clears it instead of writing it.
3. **Docstrings advertise enforcement that does not exist** (`nit`) —
   `scripts/verify-safety-only.mjs` and the mirror drift test. Correct at #20;
   the script exists at HEAD and passes.

**What this tells us about the stack, and it matters for #24, #21, #22 and #23.**
A mid-stack slice is reviewed at its own tip, so a defect introduced in one
slice and fixed in the next is reported as live. That is not a false positive —
the code really was that way at that commit — but it is not actionable either.
Every finding gets checked against HEAD before anything is changed. Two of
#20's three would have been "fixed" twice otherwise.

### PR #24 — dose formatting, one monthly AI allowance, onboarding restore — REVIEWED
One finding, `normal`. Correct for this slice's tip, already fixed by a later
slice. Verified both ends.

1. **`checkAiAllowance` answered 429 for everything, including
   `ledger_unreachable`** — so a transient `aimee_cost_cents` read failure read
   to every migrated caller as "account capped" rather than "retry the outage".
   The RN client keys its rate-limit copy off 429, so a database wobble would
   have shown "limit reached" and no status-based retry would fire.
   At `9814989` (#24's tip) the type itself was `status: 429` and the value was
   hardcoded — the finding is exactly right. At HEAD, `ledger_unreachable`
   returns **503 with `retryAfter: 60`**, and the module header records the
   change. Nothing to do.

**Three reviews, three times the same shape.** #20 had three findings and #24
had one; every one was real at the commit reviewed and every one was already
fixed downstream. That is worth drawing a conclusion from rather than just
noting again:

- The stack is catching its own defects. Three independent adversarial passes
  found nothing that had survived to HEAD.
- Mid-stack reviews are therefore mostly confirming history. **#23 is the one
  that matters most** — it is the tip, so nothing downstream exists to have
  fixed its findings, and anything found there is live.
- The integration pass over the 84 multi-slice files is the other place a live
  defect can still hide, because no single slice shows it.

### PR #21 — the dose guard, the privacy manifest, safety-information-only
_awaiting review_

### PR #22 — password reset, paywall wording, credit packs, App Review gates
_awaiting review_

### PR #23 — dosing authority, purchases, the death loop, crashes, persisted state
_awaiting review_

**Prior independent review of the persist slice (Fable, 2026-09-18):** two real
findings, both confirmed and fixed in `6a1dcfe` — the `migrate` premise was
wrong, and `null` was accepted against non-null defaults. It also cleared the
codemod placement across all 38 stores and found no data loss. Worth knowing
that this slice has already had one adversarial pass.
