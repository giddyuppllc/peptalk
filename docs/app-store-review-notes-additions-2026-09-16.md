# DRAFT — Edward approves

**Nothing in this file is approved and nothing here has been pasted anywhere.**
It is a proposed *addition* to `docs/app-store-review-notes.md` and a list of
console answers that need updating. It lives in its own file precisely so it
cannot be pasted into App Store Connect by accident along with the approved
notes — when Edward approves a section, move it across into
`app-store-review-notes.md` and delete it here.

Written 2026-09-16 on `fix/privacy-manifest-and-reporting-2026-09-16`. Every
factual claim below was read out of the code on that branch, not carried over
from an older note; where something could not be verified it says so.

---

## 1. Proposed addition to the App Review Notes — the leaderboard

> ### Community leaderboard and shout-outs
>
> - The leaderboard is **opt-in and off by default**. A new account — including
>   the reviewer account — appears nowhere on it until the member turns it on,
>   from Profile → Public sharing, from the leaderboard screen itself, or from
>   the optional toggle in onboarding.
> - Anyone signed in can **view** the board. Appearing on it is the choice.
> - Because it is off by default, the board is **empty on a fresh install** and
>   stays empty until a member opts in. An empty board is the correct state,
>   not a loading failure: it renders an empty message rather than a spinner.
> - When a member does opt in, the board shows other members their **display
>   name, avatar, check-in streak, dose adherence percentage and workout
>   count**. No health values, compound names or doses appear on it.
> - Leaving is immediate. Turning the switch off removes the member's rows from
>   every board and from the shout-out list at once, before any refetch.
> - Every row for another member carries a **visible control** offering
>   **Report** (Spam / Harassment / Unsafe medical advice / Misinformation /
>   Off-topic / Other) and **Hide**. Hiding is the existing symmetric community
>   block: neither member then sees the other on the board, in the feed or in
>   comments. Blocked members are listed and reversible at Profile → Settings →
>   Blocked users.
> - Reports are queued for human review. Nothing is auto-actioned against a
>   member on report count alone.

**Reached from:** the community feed header (trophy icon) and its leaderboard
strip, the PT navigation sheet, Profile → Public sharing, and Aimee's
`community-leaderboard` screen intent.

---

## 2. Proposed addition — the reviewer account and the onboarding questions

This is the shape of **both** prior 2.1(a) rejections, so it is worth saying in
the notes before a reviewer hits it.

> ### One-time profile questions after signing in
>
> The test account was created before PepTalk restored onboarding answers from
> the server. It therefore has no stored onboarding record, and the app asks
> for a small set of profile basics **once**, immediately after the first
> sign-in on a fresh install. This is expected: answer them and the app
> proceeds to Home. It is a one-time prompt, not a loop, and it does not
> reappear on later launches or on other devices — from then on the answers are
> restored from the account.

⚠️ **Before submitting, do this rather than relying on the paragraph above:**
sign in as the reviewer account on a clean install, answer the questions once,
confirm you land on Home, then force-quit and reopen and confirm you are *not*
asked again. If the second launch asks again, the note is wrong and the build
is not submittable — that disagreement between `isComplete` and
`isAuthenticated` is exactly what produced both 2.1(a) rejections.

---

## 3. Proposed addition — compounds shown with safety information only

> ### Compounds with no dosing shown
>
> Some compounds in the peptide library are presented with **safety information
> only — contraindications, interactions and monitoring — and no dose,
> frequency or protocol**. Where PepTalk has no dosing figure it trusts, it
> shows none rather than filling the gap. The dose calculator will not produce
> a protocol for these compounds either.

**The list, as of this branch (2026-09-16):** four compounds carry a safety
profile and resolve to no canonical dose —

| id | Name |
|---|---|
| `adipotide` | Adipotide |
| `glow` | GLOW (GHK-Cu / BPC-157 / TB-500 blend) |
| `humanin` | Humanin |
| `klow` | KLOW (GHK-Cu / KPV / BPC-157 / TB-500 blend) |

Derived by resolving every id in `src/data/safetyProfiles.ts` +
`src/data/safetyProfilesFromGuides.ts` (54 profiles) through
`getCanonicalDose()`; four returned null.

⚠️ **Re-derive this list at submission time.** A separate branch
(`feat/safety-only-compounds-2026-09-16`) is changing which compounds are
safety-only, so the table above is true of *this* branch and may be short by
the time a build goes out. Do not paste a stale list into a reviewer note — a
reviewer who finds a dose on a compound the notes said had none is being told
something untrue about the app.

---

## 4. Proposed addition — reporting an AI response (Google Play)

Relevant to the Play listing rather than App Review, but it belongs in the same
notes file:

> ### AI-generated content
>
> Aimee's replies are generated by a third-party AI provider. Every finished
> reply in the chat thread carries a **report control** on the message itself,
> offering the same six reasons as the community surfaces. A report records the
> assistant's message text and the time it was shown, and nothing else — no
> health profile, no conversation history, no logged doses, meals or weights —
> so a report cannot become a route for health data the member has not agreed
> to send.

---

## 5. App Store Connect → App Privacy — the answers to update

All of these are **Linked to the user** and **not used for tracking**; the app
declares `NSPrivacyTracking: false` and an empty tracking-domains list.

| Category | Type | Purpose | Status |
|---|---|---|---|
| Contact Info | Name | App Functionality | already answered |
| Contact Info | Email Address | App Functionality, Customer Support | already answered |
| Contact Info | **Phone Number** | App Functionality | **ADD** |
| Contact Info | **Physical Address** | App Functionality | **ADD** |
| Health & Fitness | Health | App Functionality | already answered |
| Health & Fitness | Fitness | App Functionality | already answered |
| User Content | Photos or Videos | App Functionality | already answered |
| User Content | **Audio Data** | App Functionality | **ADD** |
| User Content | Other User Content | App Functionality | already answered |
| Identifiers | User ID | App Functionality, Analytics | already answered |
| Purchases | Purchase History | App Functionality | already answered |
| Usage Data | Product Interaction | Analytics, App Functionality | already answered |
| Diagnostics | Crash Data | App Functionality | **CHANGE to Linked** |
| Diagnostics | **Performance Data** | App Functionality | **ADD** |
| Other Data | **Other Data Types** (date of birth) | App Functionality | **ADD** |

Why each of the changes:

- **Phone Number / Physical Address** — Profile → Personal details writes
  `profiles.phone` and `address_line1 … country`. Optional fields, but stored
  on the account when given, which is collection.
- **Audio Data** — a voice message to Aimee is uploaded to OpenAI Whisper for
  transcription (`supabase/functions/aimee-voice`). PepTalk keeps no copy; the
  function returns a transcript and stores nothing. It is still declared,
  because the recording leaves the device under the member's account.
  ▶ **Edward's call:** the microphone usage string currently says "audio is not
  stored". That is true of PepTalk. Confirm whether you also want to say
  anything about the transcription provider's own retention.
- **Crash Data → Linked** — this was answered as *unlinked* and that is wrong.
  `useAuthStore` calls `telemetry.setUser({ id })` on every login and Sentry's
  `beforeSend` deliberately keeps `user.id` (it strips only email/username), so
  crashes are tied to the account.
- **Performance Data** — Sentry tracing is on (`tracesSampleRate: 0.1`),
  auto-instrumenting fetch, navigation and AppState. Same linkage as crash data.
- **Other Data Types (date of birth)** — `profiles.date_of_birth`. Apple has no
  dedicated key for a birth date; "Other data types" is the catch-all.
  ▶ **Edward's call:** if you would rather answer this under a different
  category, the manifest entry in `app.json` changes with it.

**Not declared, because the app does not collect it:** precise or coarse
location, contacts, browsing history, search history, advertising data, payment
or credit info, sensitive info. If any of those is ever answered *yes* in the
console without a matching manifest entry, `npm run verify:privacymanifest`
will not catch it — that check reads the repo, not App Store Connect.

### The leaderboard, specifically

Apple's App Privacy form has no "visible to other users" question, so this
cannot be answered there. It must be covered in **two** places instead:

1. the **privacy policy** at https://peptalk.bio/privacy — it needs to say that
   opting in to the leaderboard makes a member's display name, avatar,
   check-in streak, dose adherence percentage and workout count visible to
   other signed-in members; and
2. the **App Review Notes** (section 1 above).

▶ Someone has to confirm the live privacy policy already says this. It was not
checked as part of this work.

---

## 6. Play Console → Data safety — the answers to update

Same underlying facts, Play's taxonomy:

| Section | Type | Collected | Notes |
|---|---|---|---|
| Personal info | Name | Yes | App functionality |
| Personal info | Email address | Yes | App functionality, customer support |
| Personal info | **Phone number** | **Yes — ADD** | App functionality |
| Personal info | **Address** | **Yes — ADD** | App functionality |
| Personal info | User IDs | Yes | App functionality, analytics |
| Personal info | **Other info** (date of birth) | **Yes — ADD** | App functionality |
| Health and fitness | Health info | Yes | App functionality |
| Health and fitness | Fitness info | Yes | App functionality |
| Photos and videos | Photos | Yes | App functionality |
| **Audio** | **Voice or sound recordings** | **Yes — ADD** | App functionality |
| Messages | Other in-app messages | Yes | Community posts, comments, live chat, Aimee chat |
| Financial info | Purchase history | Yes | App functionality |
| App activity | App interactions | Yes | Analytics, app functionality |
| App info and performance | Crash logs | Yes | App functionality |
| App info and performance | **Diagnostics** | **Yes — ADD** | Sentry performance traces |

Answers that apply across the form:

- **Data is encrypted in transit:** yes.
- **Users can request that data be deleted:** yes — Profile → Account → Delete
  account, in-app, which removes the `auth.users` record and all user-keyed rows.
- **Data shared with third parties:** the AI providers (xAI for text and vision,
  OpenAI for Whisper transcription), Sentry, and Supabase all receive data as
  service providers processing on PepTalk's behalf.
  ▶ **Edward's call, and it is a real one:** Play treats a transfer to a
  *service provider* differently from *sharing*, and answering it wrong is a
  policy strike either way. Decide deliberately rather than by default.
- **Voice recordings — "processed ephemerally":** PepTalk stores no audio, so
  this checkbox is tempting. It describes the *provider's* retention as well as
  ours, though, and that has not been verified.
  ▶ **Recommendation:** answer **collected, not ephemeral** unless someone
  confirms the transcription provider's retention policy in writing.
- **AI-generated content:** Play's generative-AI policy requires an in-app way
  to report offensive AI output. That control now exists on every finished
  Aimee reply — see section 4.

---

## 7. Things this file deliberately did not touch

- **The reviewer password.** `docs/app-store-review-notes.md` carries it in
  plain text and it is in git history, so rotating the string in the file does
  not un-publish it. **Edward rotates it** in Supabase → Authentication → Users
  and login-tests the build before submitting. Nothing in this branch changed
  that line.
- **The AI-consent paragraph in the existing notes.** It says consent is
  "opt-in and off by default", and `canSendToCloud()` in
  `src/services/privacyGuard.ts` currently returns true unless consent is
  explicitly `false` — i.e. opt-**out**. One of those is wrong and a reviewer
  reading the note and then using the app would find the difference. A separate
  branch is working on consent gating; this needs to be reconciled with that
  work before either ships. Flagged, not changed.
- **Copy.** The report and block wording on the new surfaces reuses strings the
  app already ships. Two slots are empty and waiting on Edward:
  `LEADERBOARD_COPY.rowActionsTitle` (title for the member Report/Hide sheet)
  and `AI_REPORT_COPY.messageActionA11yLabel` / `AI_REPORT_COPY.sheetTitle` in
  `src/constants/reportCopy.ts`. All render nothing until he writes them.
