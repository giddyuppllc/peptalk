# App Store Review Notes — PepTalk

Paste the **App Review Notes** section verbatim into App Store Connect →
App Review Information → Notes when submitting. The other sections are
context for the developer.

> **Pending additions, not yet approved:**
> `docs/app-store-review-notes-additions-2026-09-16.md` holds proposed notes for
> the leaderboard, the one-time onboarding questions on the reviewer account,
> and the safety-only compounds, plus the App Privacy / Play Data safety answers
> that need updating. **Do not paste from that file** — it is a draft awaiting
> Edward. Approved sections move into this file; nothing has been moved across
> from it. (The corrections below are a separate matter — they are fixes to
> statements in this file that the code contradicts, not additions from there.)

> **Three corrections made 2026-09-16, each against the code rather than
> against an older revision of this file.** They are here because this section
> is pasted verbatim into App Store Connect, so a wrong sentence here is a
> wrong sentence told to App Review:
>
> 1. Aimee's allowance said *20 messages/day on Plus, unlimited on Pro*. The
>    gate is a monthly message count (`aimee-chat-stream` `RATE_LIMITS`: free 3,
>    plus 750, pro 9,000) with a monthly cost cap alongside it. Neither the
>    period nor either number was right, and *unlimited* is the exact claim
>    Edward had removed from every in-app surface on 2026-09-16.
> 2. The notes routed the reviewer through *Home → Profile* repeatedly — the
>    navigation table, the HealthKit section, the live-chat section and the
>    account-deletion line — immediately after telling them navigation is the
>    four Home cards. Profile is not one of the four. Build 1.9.8 was rejected
>    under 2.3 for a reviewer
>    not finding a screen that existed, so an instruction that cannot be
>    followed is the same defect in a different place.
>
>    It now names the **PT** button, and that is on purpose rather than for
>    brevity. Home *does* have a Profile avatar in the top-right
>    (`src/components/v3/AvatarShortcut.tsx`), but **on Home it is covered by
>    the PT button on a modern iPhone** and cannot be tapped:
>
>    | control | vertical extent on Home | horizontal |
>    |---|---|---|
>    | Profile avatar (36pt, inside the greeting row) | y ≈ 69–106 — from `Greeting`'s `paddingTop: 60` (`v3.ts:114`); Home adds no top inset | right edge at `W − 20` |
>    | PT button (36pt, absolute, `zIndex`/`elevation` 100, mounted at the ROOT above the Stack) | y = `insets.top + 8` → `+ 44`, i.e. 67–103 at `insets.top ≈ 59` | `right: 14`, plus `hitSlop` 10 |
>
>    With the hit slop the PT button's touch target is y ≈ 57–113 by
>    x ≈ `W−60 … W−4`, which contains the avatar outright. On an iPhone SE
>    (`insets.top` 20) they do not overlap, so this only bites on the phones
>    Apple reviews on. Profile is still reachable — it is in the PT menu
>    (`src/lib/navMap.ts:125`) — so this is a dead control, not a dead end.
>    **▶ Edward's call** whether the avatar moves, the PT button moves, or Home
>    drops the avatar; nothing was moved here, because that is a design choice.
> 3. Account deletion said *Profile → Account → Delete account*. That screen
>    does have an ACCOUNT section and Delete Account is **not** in it — it is
>    under DATA (`app/(tabs)/profile.tsx:912`). A 5.1.1(v) check that opens the
>    section we named and finds nothing is a rejection.
>
> 4. **Reconciled 2026-09-16.** The Guideline 5.1.2 paragraph says *the first
>    modal names the health profile among what is sent*. That had been made
>    true of the imperative fallback (`src/utils/ensureAiConsent.ts:26`) and
>    **not** of the modal a user actually meets first, so this file was briefly
>    claiming something the binary did not do. The root `AiConsentModal` now
>    carries a fourth row — *The health details in your profile → xAI (Aimee)* —
>    and points at the separate switch, in the fallback's own words. Both
>    surfaces now say the same thing, and the paragraph is accurate.

---

## App Review Notes (paste this into ASC)

PepTalk is an educational + tracking app for adults researching peptide
therapeutics. The app **does not sell, distribute, or facilitate the
purchase of any peptides, supplements, pharmaceuticals, or controlled
substances** — it is informational + tracking only (Privacy Policy:
https://peptalk.bio/privacy).

### Test account
- Email: reviewer@peptalk.bio
- Password: PepTalkReview2026!   (⚠️ set/confirm this in Supabase → Authentication → Users → reviewer@peptalk.bio, then LOGIN-TEST it on the build before submitting — a non-working reviewer login was the original 2.1a repeat-rejection cause)
- Tier: **Free** — do NOT pre-grant Plus/Pro. The reviewer must be on Free so
  they can tap Subscribe and complete the StoreKit purchase via the sandbox.
  (A pre-entitled account makes the Subscribe buttons no-op, which reads as an
  "unresponsive button" — the 2.1a finding.)

### How to get around the app (please read first)
PepTalk has **no bottom tab bar** — this is deliberate, not a fault. There are
two ways around, and the first one reaches everything:

1. **The round "PT" button in the top-right corner, on every screen.** It opens
   a menu listing every screen in the app, grouped, starting with Doses. If you
   are looking for a specific feature, this is the fastest way to it.
2. The four large cards on the Home screen (Weekly Tracker, Nutrition,
   Activity, Doses).

| To reach | Tap |
|---|---|
| **Profile** (needed for four of the rows below) | **PT** button, top-right → **Profile** |
| **Dose calculator** | Home → **Doses** → **Calculator**, or **PT** → **Dose Calculator** |
| Reconstitution calculator | Home → **Doses** → **Calculator** (same screen, "Reconstitute" mode) |
| Stack Builder | Home → **Doses** → **Stack Builder**, or **PT** → **Stack Builder** |
| Dose log | Home → **Doses** → **Dose Tracker**, or **PT** → **Dose Tracker** |
| Peptide library | Home → **Doses** → **Library**, or **PT** → **Peptide Library** |
| Apple Health | **PT** → **Profile** → **Apple Health & Integrations** |
| Subscriptions | **PT** → **Profile** → **Subscription** |

On first opening **Doses** you will see a one-time safety disclaimer with a
checkbox — tick it and tap **Continue** to reach the tiles above. It appears
once per install.

### Dose calculator — Guideline 2.3
The calculator referenced in our App Store description is at
**Home → Doses → Calculator**. It takes vial strength, reconstitution volume
and target dose, and returns the syringe draw in units and millilitres, plus
doses per vial. There is a second entry for reconstitution planning on the same
screen.

### Subscriptions (StoreKit / IAP) — Guideline 2.1(b)
- The two auto-renewing subscriptions BELOW must be added to this app version's
  In-App Purchases section, with an App Review screenshot, and **submitted
  together with the binary** — otherwise StoreKit has no product to sell in
  review and the Subscribe button can't present a purchase sheet.
  - peptalk_plus_monthly ($9.99/mo)
  - peptalk_pro_monthly ($49.99/mo)
- Receipt validation: server-side via Supabase edge function
  `validate-purchase`, which verifies the StoreKit 2 signed transaction
  (JWS) against Apple's certificate chain. The user's tier
  flips after a successful validation; restoration via "Restore
  Purchases" is supported (Profile → Subscription).
- Manage Subscription button (Profile → Subscription) deep-links to
  https://apps.apple.com/account/subscriptions per Apple guidelines.

### HealthKit / Apple Health (Guideline 2.5.1)
- PepTalk's Apple Health integration is at **Profile → Apple Health &
  Integrations**. Tap **Set up** on the "Apple Health" card. A single
  explanation screen appears describing exactly what is read and written, with
  one button — **Continue** — which takes you straight to the iOS permission
  sheet. There is no other control on that screen and no route to Settings: per
  5.1.1(iv) the only way onward is the system prompt, where you may allow or
  deny each category.
- PepTalk reads steps, heart rate, HRV, VO₂ max, sleep, weight and body
  composition, and writes check-ins and weight back to Apple Health.
- Note: iOS does not report read-authorization status to apps, so PepTalk never
  claims the connection succeeded or failed — it simply shows whatever data it
  can subsequently read.
- Synced metrics surface on the Activity, Sleep, and Weight trackers and in the
  daily summary. HealthKit data is encrypted on-device and never sold.

### Live community chat (UGC)
- Live events are a paying-member feature: only Plus and Pro members can
  enter and post in admin-hosted live events. Free users are shown an upgrade
  prompt for live chat (they cannot enter the live room). The general
  community feed (posts/comments) is readable on Free.
- A blocking disclaimer modal appears the first time any user enters a
  live event. It states: chats are member-to-member, not medical advice,
  and members must consult a licensed healthcare provider. Acceptance
  persists per-account.
- Every live message has long-press affordances:
    - Owners + the host: Edit / Delete
    - All other viewers: **Report** (Spam / Harassment / Unsafe medical
      advice / Misinformation / Off-topic / Other)
- Image moderation is automated via a third-party AI vision service
  (OpenAI) before any image is visible to other members; pending images are
  hidden from non-authors until they pass screening, and flagged images
  soft-delete the parent post and notify the author. Moderation fails closed
  (an image stays hidden if screening cannot complete).
- User-blocking is wired and persisted (Profile → Settings → Blocked
  users). Blocked users' content is filtered client-side from the feed.

### Medical / health disclaimers
- A first-launch modal blocks the Peptides tab until the user
  acknowledges the research/education-only disclaimer.
- Every dosing surface (calculator, peptide detail page, Aimee AI) shows
  a disclaimer banner stating: not medical advice, no doctor-patient
  relationship, consult a licensed provider before any peptide use.
- Aimee (the AI assistant) has system prompts forbidding medical advice, and
  her allowance is metered per month: up to 750 messages a month on PepTalk+
  and up to 9,000 messages a month on PepTalk Pro.
- **The test account is Free, and Free includes 3 Aimee messages a month.**
  After the third, Aimee replies with an upgrade offer rather than an answer.
  That is the intended behaviour, not a failure — please do not read it as an
  unresponsive assistant. Aimee is offered no tools on Free, so she answers
  questions but does not log doses, meals or workouts on that tier.

### Third-party AI processing & consent (Guideline 5.1.2)
- AI features (Aimee chat, voice→text, photo food/lab/pantry scanning,
  meal/recipe/workout generation, lab interpretation) send the content you
  submit to third-party AI providers: xAI (Grok) for text/vision and OpenAI
  (Whisper) for voice transcription.
- Consent is opt-in and off by default: the first time the user triggers any
  AI feature, a consent modal explains the third-party processing and requires
  an affirmative tap before any data is sent. Declining leaves AI features off;
  the rest of the app works normally. Consent is revocable in Profile settings.
- There is a **second, finer control** for health data specifically
  ("AI-Powered Responses", Profile → Health Profile). It governs whether the
  user's health profile — conditions, medications, allergies, labs, dose
  history — is attached to an AI request, and it is **on by default** for a
  user who has already granted the consent above. Turning it off does not
  disable AI: chat, meal plans, recipes, pantry suggestions and workout
  generation continue with the health fields stripped before the request
  leaves the device, while lab interpretation, the lab photo scanner and the
  weekly report rewrite refuse outright. The first modal names the health
  profile among what is sent, so nothing is shared that the user was not told
  about at the point of consent.
- This is disclosed in the in-app Privacy Policy (Profile → Privacy Policy).

### Sign-in
- Email + password only (no third-party social auth), so Apple Sign-In
  is not required per Guideline 4.8.
- Account deletion is implemented in-app: Profile → scroll to the **DATA**
  section → **Delete Account**. Deletes all user-keyed rows server-side and
  removes the auth.users record. (The row directly above it, **Delete My
  Data**, is a different action: it clears this device only.)

### Why 17+ age rating
- Subject matter is peptide therapeutics for adults. Live community
  chat is paying-member-only and could include user-generated medical
  experience reports. Plus + Pro subscription gates protect the chat
  surface from anonymous minor users.

---

## Pre-submission checklist (do not paste — this is for our use)

- [x] Test account reviewer@peptalk.bio exists on FREE tier — set/confirm its password (PepTalkReview2026!) + login-test before submitting
- [ ] All secrets in `supabase/.env.example` set in production Supabase
- [ ] Edge functions deployed via `bash scripts/deploy-edge-functions.sh`
- [ ] App Store Server Notifications Production URL registered in ASC
- [ ] `peptalk_plus_monthly` + `peptalk_pro_monthly` show "Ready to Submit"
- [ ] Age rating set to 17+
- [ ] 6.7" + 6.5" iPhone screenshots uploaded
- [ ] Privacy URL points to a live page (not a placeholder)
- [ ] Support URL points to a live contact page
- [ ] Build uploaded via `eas build -p ios --profile production`
- [ ] Submitted via `eas submit -p ios --latest`
