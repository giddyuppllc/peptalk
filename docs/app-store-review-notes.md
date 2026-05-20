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
- Email: [TODO: create a test account before submission]
- Password: [TODO]
- Tier: Plus (granted manually for review)

### Subscriptions (StoreKit / IAP)
- We offer two auto-renewing subscriptions, monthly only:
  - peptalk_plus_monthly ($9.99/mo)
  - peptalk_pro_monthly ($49.99/mo)
- Receipt validation: server-side via Supabase edge function
  `validate-purchase` calling Apple's verifyReceipt. The user's tier
  flips after a successful validation; restoration via "Restore
  Purchases" is supported (Profile → Subscription).
- Manage Subscription button (Profile → Subscription) deep-links to
  https://apps.apple.com/account/subscriptions per Apple guidelines.

### Live community chat (UGC)
- Plus and Pro members can post in admin-hosted live events. Free users
  can read transcripts but cannot post.
- A blocking disclaimer modal appears the first time any user enters a
  live event. It states: chats are member-to-member, not medical advice,
  and members must consult a licensed healthcare provider. Acceptance
  persists per-account.
- Every live message has long-press affordances:
    - Owners + the host: Edit / Delete
    - All other viewers: **Report** (Spam / Harassment / Unsafe medical
      advice / Misinformation / Off-topic / Other)
- Image moderation is automated via Grok Vision before any image is
  visible in the feed; flagged images soft-delete the parent post and
  notify the author.
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

- [ ] Test account created with Plus tier set manually in `subscriptions` table
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
