# App Store Connect — what to send, and what to click

Two of the open items need a message rather than a build. One needs a settings
change that costs nothing and is worth making before the next submission.

---

## 1. Reply to App Review

Paste into the Resolution Center thread for the current submission.

> Thank you for the review.
>
> **Guideline 3 — Business, pricing.** We confirm that $49.99/month is the
> intended price for PepTalk Pro Monthly. It is not a placeholder or an error.
> PepTalk Pro includes unlimited AI coaching, custom workout generation, meal
> planning, and health reporting; PepTalk Plus at $9.99/month is our entry tier.
> Both prices are deliberate.
>
> **Guideline 2.3 — the dose calculator.** Apologies that this was hard to
> find. The calculator is at **Home → Doses → Calculator**. PepTalk does not use
> a bottom tab bar; the four large cards on the Home screen are the navigation.
> In this build we have also added a persistent navigation button (marked "PT",
> top-right of every screen) that opens a full menu with the Dose Calculator as
> its first entry, so it is now reachable in one tap from anywhere in the app.
>
> On first opening Doses you will see a one-time safety disclaimer with a
> checkbox — tick it and tap Continue to reach the calculator.
>
> **Guideline 2.1(a) — login.** We reproduced and fixed this. Session tokens
> could fail to persist to the keychain on a first install without the app being
> told, so the app appeared signed in and was then signed out on the next
> session check. The write is now verified before it is treated as successful.
> We have re-tested the full sign-in path on a freshly erased device with the
> reviewer account below.
>
> **Guideline 2.3.10 — Android references.** Removed from the iOS build. Copy
> naming Google Fit, Samsung Health and Health Connect is now shown only on
> Android, and we have added an automated check that fails our build if an
> Android product name appears on an iOS screen again.
>
> **Guideline 5.1.1(iv) — HealthKit.** Rebuilt to your specification. The
> explanation screen now has a single control, "Continue", which leads directly
> to the system permission sheet. There is no "Not Now" button, no dismiss
> gesture, and no link to Settings anywhere in that flow. We had previously
> misread the finding and added the escape and the Settings link; that was our
> error and both are gone.
>
> **Guideline 2.1(a) — the Apple Health banner.** Also fixed. The app was
> reporting "Access revoked — reconnect in Settings" whenever a HealthKit read
> timed out, including for users whose access was working. It now only says
> access is unavailable on a definite signal from HealthKit.
>
> Test account: **reviewer@peptalk.bio** (Free tier, so the subscription
> purchase flow can be exercised).
>
> Thank you — we are happy to answer anything else.

---

## 2. Fix the subscription levels — do this before submitting

**Currently inverted.** In App Store Connect, **Level 1 is the highest service
tier**. PepTalk Plus is set to Level 1 and PepTalk Pro to Level 3, so StoreKit
believes Plus outranks Pro.

The consequence is a real billing bug: a Plus subscriber upgrading to Pro is
treated as a **downgrade**, so it is deferred to the next renewal date instead of
taking effect immediately with proration. The customer pays more and waits.

This is also a plausible reading of the 18 Jun rejection, "in-app purchase
products were still not configured correctly".

**To fix:** App Store Connect → your app → Subscriptions → **PepTalk Premium**
group → drag or set:

| Subscription | Level now | Level should be |
|---|---|---|
| PepTalk Pro Monthly ($49.99) | 3 | **1** |
| PepTalk Plus Monthly ($9.99) | 1 | **2** |

It is free to change while the products are still in review, and it does not
require a new binary.

---

## 3. The subscriptions sitting in "Ready for Review" are not a problem

All three — Plus, Pro and the Premium group — show "Ready for Review" and have
never been approved. That is expected: **a first-ever subscription cannot be
approved on its own.** Apple has to see it working inside a binary, so it rides
along with the app version submission, and it will do that on every submission
until one build passes.

They are not errors and they are not blocking anything. Get the binary approved
and all three clear at once.

---

## 4. Before you submit

- [ ] Set the reviewer account password and **log in on the actual build** — see
      `DB_HANDOFF.md`. A non-working reviewer login was the original 2.1(a)
      cause, and it is still the only ticked box on the old checklist.
- [ ] Confirm the reviewer account is on **Free**, not Plus/Pro. A pre-entitled
      account makes Subscribe a no-op, which reads as a dead button — itself a
      2.1(a) finding.
- [ ] Set `app.json` version to the version you are submitting and **commit it**.
      The last submission was 1.10.0 (75) while the repo said 1.9.9 and no commit
      ever set 1.10.0, so nobody could say which code Apple reviewed.
- [ ] Paste the updated `docs/app-store-review-notes.md` into App Review
      Information → Notes. It now tells the reviewer there is no tab bar and
      exactly where the calculator is.
- [ ] Run the release blockers on an **erased** simulator:
      `xcrun simctl erase <udid>`, install, then
      `maestro --device <udid> test .maestro/login.yaml -e EMAIL=… -e PASSWORD=…`
      and `.maestro/navigation.yaml`.
