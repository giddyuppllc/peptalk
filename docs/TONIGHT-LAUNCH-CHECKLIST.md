# PepTalk v1.9.8 Launch Checklist — Tonight

Code is done. Edge functions deployed. Build 22 is processing.
Everything below is dashboard work that only you can do.

---

## Where things stand right now

| Item | Status | Owner |
|---|---|---|
| Wave 70 code fixes (8 launch blockers) | ✅ Pushed (`eee91f0`) | done |
| 18 edge functions deployed to prod | ✅ Done | done |
| Supabase secrets set | ✅ All 21 verified | done |
| Migration `community_live_message_reports` applied | ✅ Done | done |
| EAS build 22 with auto-submit | 🚀 Running (~25-35 min) | done |
| App Store Connect manual setup | ⏳ Your turn | you |
| Press "Submit for Review" in ASC | ⏳ After ASC setup | you |

---

## When the build lands in TestFlight (~30-50 min from now)

Apple emails you when build 22 finishes processing. Then:

### 1. Install on your device + 15-minute smoke (10-15 min)

You don't need to walk the full Phase 2 test plan — the changes since
build 20 are localized. Hit these:

1. **Subscription paywall**: open it, verify the new auto-renew disclosure
   reads cleanly above each Subscribe button. Verify Terms + Privacy
   links at bottom open the right pages. Try a sandbox Plus purchase
   → confirm tier flips.
2. **Aimee chat**: send a message → response works. The fail-closed
   rate limit means if the DB is wonky, you'll see a 503 instead of
   unlimited calls.
3. **Peptide library → BPC-157**: title visible at top, sources card,
   Beginner/Advanced pills with the new "Educational reference only"
   footnote.
4. **Peptide library → Dihexa**: see the new "Dosing reference" empty
   state with "doesn't have a published human-trial dosing protocol".
5. **Peptide library → Mazdutide**: see the 5-step titration ladder.
6. **Live chat**: long-press another user's message → Report works.
7. **Health Report → Export as PDF**: PDF generates, share sheet opens.
8. **Profile → Admin → Workout video tagger**: opens for Jamie + Edward.

If anything's broken, tell me — we have time before submit.

### 2. ASC dashboard tasks (60-180 min depending on screenshots)

Go to https://appstoreconnect.apple.com/apps/6760955746

#### Money + agreements
- [ ] **Agreements, Tax, and Banking** → sign the Paid Apps Agreement
- [ ] Bank account info filled in
- [ ] Tax form filled in (W-9 for US — verification can take 24-48hr but
  that DOESN'T block App Store submission, only payouts)

#### IAP products (left sidebar → In-App Purchases)
- [ ] `peptalk_plus_monthly` ($9.99/mo): status should be **"Ready to Submit"**
- [ ] `peptalk_pro_monthly` ($49.99/mo): status should be **"Ready to Submit"**
- [ ] Both have a US-English display name + description
- [ ] If status shows "Missing Metadata" → click into the product and
  fill the required fields

#### App Store Server Notifications
- [ ] App Information → **App Store Server Notifications**
- [ ] **Production Server URL**:
  `https://zniucpbeepxysvkshpir.supabase.co/functions/v1/apple-notifications`
- [ ] **Sandbox Server URL**: same URL
- [ ] **Notifications Version**: **Version 2** (JWS-signed — what our function expects)
- [ ] If there's a "Test Notification" button, press it and confirm
  a 200 OK appears in the function logs at
  https://supabase.com/dashboard/project/zniucpbeepxysvkshpir/functions

#### Age rating
- [ ] App Information → Age Rating → answer **17+**
- [ ] Specifically mark these as triggering 17+:
  - "Frequent/Intense Medical/Treatment Information"
  - "Infrequent/Mild Mature/Suggestive Themes" (justifies live chat)
  - "User-Generated Content" (community feature)
- [ ] "Unrestricted Web Access" = **No**

#### Privacy questionnaire (must match `app.json` privacy manifest)
- [ ] Contact Info → **Email Address** → Linked to user, App Functionality, Not used for tracking
- [ ] Identifiers → **User ID** → Linked, App Functionality + Analytics, Not tracking
- [ ] Health & Fitness → **Health, Fitness** → Linked, App Functionality, Not tracking
- [ ] User Content → **Other User Content** (community) → Linked, App Functionality, Not tracking
- [ ] Usage Data → **Product Interaction** → Linked, Analytics, Not tracking

#### App listing (the screenshot-heavy part)
- [ ] **6.7" iPhone screenshots** (1290×2796) — 1-10 PNGs
- [ ] **6.5" iPhone screenshots** (1242×2688) — 1-10 PNGs
- [ ] Recommended 6 shots to capture from TestFlight: Home (orchid
  greeting) · Peptides library · BPC-157 detail · Dosing calculator ·
  Live chat · Aimee chat
- [ ] **App description** (≤4000 chars) — paste from the overview I
  generated earlier in our session (or the polished version you've
  worked on)
- [ ] **Keywords** (100 chars):
  `peptide,research,dosing,calculator,health,fitness,tracking,wellness,protocol,nutrition`
- [ ] **Promotional text** (170 chars) — one-line pitch
- [ ] **Support URL** — must be a live page (your contact email is fine)
- [ ] **Privacy Policy URL** — must be live + public. Check
  `docs/privacy.html` is hosted on a domain you own
- [ ] **Marketing URL** (optional)
- [ ] **App icon** in ASC (1024×1024) — should auto-upload from your
  EAS build. Verify it matches the new alpha-free version we shipped tonight.

#### App Review prep
- [ ] **App Review Notes**: paste the entire contents of
  `docs/app-store-review-notes.md`. Specifically replace the
  `[TODO: create test account]` placeholders with a real account.
- [ ] **Demo account**: sign up a fresh account through TestFlight
  (e.g. `applereviewer@peptalk.app`), then run this SQL in Supabase:
  ```sql
  UPDATE subscriptions SET tier='plus', is_active=true
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'applereviewer@peptalk.app');
  UPDATE profiles SET subscription_tier='plus'
  WHERE id = (SELECT id FROM auth.users WHERE email = 'applereviewer@peptalk.app');
  ```
  Paste the email + password into the App Review Notes.

### 3. Press "Submit for Review"
- [ ] Build 22 selected from the dropdown
- [ ] "Submit for Review" clicked
- [ ] You should get an email confirmation within minutes
- [ ] Review takes 24-72 hours typical
- [ ] Refresh ASC or check email for status:
  Waiting for Review → In Review → Pending Developer Release / Approved

---

## Risks remaining

| Risk | What to watch | Mitigation |
|---|---|---|
| Reviewer flags peptide dosing as "medical device" (1.4.1) | Initial review email | Disclaimers + "doesn't sell peptides" framing strong; respond with screenshots of the disclaimer modals |
| Reviewer can't access demo account | Email asks for working creds | Make sure DB tier is set BEFORE submitting |
| Apple wants more privacy clarification on Grok Vision | Email asks about third-party AI | Privacy policy now explicitly discloses it; just point to that section |
| Build fails ASC processing for unknown reason | TestFlight shows "Processing failed" | Rebuild + re-submit; should be rare with cached credentials |

---

## What we did NOT solve tonight (intentional, defer to v1.10)

- **Signup spam protection**: enable email-confirmation in Supabase Auth
  dashboard (Settings → Authentication → Email). Recommend before going
  viral; not needed for review.
- **CAPTCHA on signup**: requires hCaptcha or reCAPTCHA integration.
- **Per-user daily image moderation quota**: existing 10-post/day cap
  is sufficient defense; add explicit per-image counter if abuse appears.
- **Server-side workout-video tagging**: lets Jamie's tags go live
  without a rebuild.
- **Android**: separate cycle, separate Play Store setup.

---

## How to reach me if something blows up at 2am

- Check this file for the answer first.
- If you find a real bug in TestFlight that's a blocker, you can
  push a Wave-71 fix + run `npx eas-cli build --platform ios --profile production --auto-submit --non-interactive` again.
  Each build is ~$1-2 in pay-as-you-go credits.
- If Apple rejects in 24-72h: read the email carefully, the resolution
  center note is usually specific. Fix → resubmit (no new build needed
  if it's metadata-only).

Good luck. You shipped.
