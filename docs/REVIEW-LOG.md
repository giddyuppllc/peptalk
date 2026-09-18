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

## Blocked on Edward, not on code

- **Play billing**: the service account is a placeholder, so every Android
  purchase fails validation today.
- **Email**: `RESEND_API_KEY` unset, and the DNS above means setting it alone
  sends every welcome email to spam. A verified subdomain (`send.peptalk.bio`)
  avoids touching the Workspace SPF record.
- **Deep links**: Play Console SHA-256 needed for `assetlinks.json`.

---

## Review log

### PR #18 — whole branch (285 files) — NOT REVIEWED
Rejected by the tooling as too large. Split into #19–#23. Review last, as an
integration pass, once the pieces are done.

### PR #19 — consent, permissions and the claims the app was making
_awaiting review_

### PR #20 — onboarding restore, the leaderboard, per-account isolation
_awaiting review_

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
