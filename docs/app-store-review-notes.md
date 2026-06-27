# App Store Review Notes — PepTalk v1.9.x

Paste the **App Review Notes** section verbatim into App Store Connect →
App Review Information → Notes when submitting. The other sections are
context for the developer.

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
  Integrations**. Tap **Connect** on the "Apple Health" card to grant access;
  the screen explains that PepTalk reads steps, heart rate, HRV, VO₂ max,
  sleep, weight, body composition, and cycle data, and writes check-ins,
  weight, and symptom logs back to Apple Health.
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
- Aimee (the AI assistant) has system prompts forbidding medical advice
  and is rate-limited to 20 messages/day on Plus / unlimited on Pro.

### Third-party AI processing & consent (Guideline 5.1.2)
- AI features (Aimee chat, voice→text, photo food/lab/pantry scanning,
  meal/recipe/workout generation, lab interpretation) send the content you
  submit to third-party AI providers: xAI (Grok) for text/vision and OpenAI
  (Whisper) for voice transcription.
- Consent is opt-in and off by default: the first time the user triggers any
  AI feature, a consent modal explains the third-party processing and requires
  an affirmative tap before any data is sent. Declining leaves AI features off;
  the rest of the app works normally. Consent is revocable in Profile settings.
- This is disclosed in the in-app Privacy Policy (Profile → Privacy Policy).

### Sign-in
- Email + password only (no third-party social auth), so Apple Sign-In
  is not required per Guideline 4.8.
- Account deletion is implemented in-app: Profile → Account → Delete
  account. Deletes all user-keyed rows server-side and removes the
  auth.users record.

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
