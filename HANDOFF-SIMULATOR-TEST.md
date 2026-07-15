# PepTalk — Simulator test handoff (App Review resubmission)

**Goal:** verify the fixes in the current build on the **iOS Simulator** (you have a Mac + Simulator, no physical iPad) before we resubmit to App Review. The last rejection happened on an **iPad Air**, so the iPad Simulator reproduces that device class.

**What we're specifically verifying:**
1. **Guideline 5.1.1(iv) — HealthKit** (the live rejection): the permission request must NOT be "modified/encouraging." Fixed in commit `a47217c`.
2. **Guideline 2.1 — login** (older rejection): app must get past the login page with no error prompt.

Current `master` HEAD = `861c44a` and **includes `a47217c`** (the HealthKit fix). Build 64 in TestFlight is from this commit — but a store/EAS build can't run on the Simulator, so we build locally below.

---

## Why a local build (not TestFlight build 64)
Production/EAS "store" builds are device-only (arm64 device slice). To run in the Simulator you compile a Simulator build locally with `expo run:ios`. Same code, same commit — just a Simulator-capable binary.

---

## Prerequisites (on the Mac)
- **Xcode** (latest) + Command Line Tools: `xcode-select --install`
- **iOS + iPadOS Simulators** installed via Xcode → Settings → Components (install the newest iPadOS runtime so you get a recent iPad Air)
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)
- **Node 22** (match EAS's 22.21.0): `nvm install 22 && nvm use 22`
- **Watchman** (recommended): `brew install watchman`
- **Git** with access to `github.com/giddyuppllc/peptalk`

---

## 1. Get the code
```bash
git clone https://github.com/giddyuppllc/peptalk.git
cd peptalk
git checkout master
git pull
git log -1 --oneline          # confirm HEAD is 861c44a (or newer) — must contain a47217c
git log --oneline | grep a47217c   # should print the HealthKit 5.1.1(iv) fix commit
```

## 2. Create `.env` (minimal — enough to log in + test)
The Supabase URL + anon key are the public client values — **copy the anon key from `eas.json`** (the `production` profile's `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Aimee/nutrition/Sentry keys are optional and NOT needed for this test.
```
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_SUPABASE_URL=https://zniucpbeepxysvkshpir.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<copy from eas.json → build.production.env>
```

## 3. Install + run on the Simulator
```bash
npm install

# See available simulators:
xcrun simctl list devices available | grep -Ei "ipad|iphone"

# iPad (reproduces the reviewer's device class) — pick a recent iPad Air name from the list:
npm run ios -- --device "iPad Air 11-inch (M3)"

# iPhone (second pass):
npm run ios -- --device "iPhone 16 Pro"
```
First run compiles the native project (includes `react-native-health`) — a few minutes. Metro starts automatically; leave it running. If the pod step ever fails, run `npx expo prebuild --clean` then retry.

---

## THE TEST CHECKLIST

### A. Login (Guideline 2.1)
1. App launches to the login screen.
2. Sign in with the **App Review demo account** (credentials are NOT stored in this public repo):
   - Get them from **App Store Connect → PepTalkPeptides → App Review Information → Sign-In Information** (the reviewer email + password), or from Edward.
3. ✅ **PASS:** you reach the app (tabs / home) with **no blocking error prompt** after login.
   ❌ FAIL: any "error" alert that stops you from proceeding past login.

### B. HealthKit permission prompt (Guideline 5.1.1(iv)) — the important one, focus on iPad
1. Go to a **check-in / "Sync from Apple Health"** surface (dashboard check-in or the vitals entry flow).
2. Two acceptable outcomes — **either is a PASS:**
   - The **health-sync button is hidden** (device reports no health store), so no permission prompt ever appears; you just type vitals in. **OR**
   - You tap sync and (deny/limit HealthKit) → the alert is **NEUTRAL**: title = the source name ("Apple Health"), body = *"PepTalk couldn't read from Apple Health. You can enter your vitals below, or review permissions in Settings."*, buttons **"Not now" / "Open Settings."**
3. ❌ **FAIL (this is what got rejected):** any alert that says **"Permission Required," "needs access," "please enable,"** or otherwise **pressures/encourages** you to grant HealthKit access.
4. Repeat on the **iPhone** simulator: the standard iOS HealthKit permission sheet is fine — just confirm there is **no custom pressuring pre-prompt** before/around it.

### C. Camera permission (quick sanity — Guideline 5.1.1)
- Open the meal/pantry **scan** feature and **deny** camera. The message should be **informational** ("Enable access in Settings to scan…"), not pressuring. ✅

---

## HealthKit-in-Simulator notes
- HealthKit **works** in the Simulator (you can grant/deny authorization) but has **no real health data** — that's fine; we're testing the **prompt wording/behavior**, not data sync.
- On recent iPadOS the Health app exists, so the sync button may **show** on the iPad Simulator → use outcome B-2 (tap → deny → confirm the neutral alert). On a Simulator with no health store the button is **hidden** → outcome B-1. Both pass.

---

## If it passes → report back
Send a note (screenshots of the HealthKit prompt on iPad are ideal). Then the remaining step is on the ASC side: assemble **one App Review submission = build 64 + BOTH subscriptions** (`peptalk_plus_monthly`, `peptalk_pro_monthly`) and Submit. The subs have never ridden along in a submission — that's the outstanding "IAP not configured" fix.

## Already done in App Store Connect (no action needed)
- Privacy Policy URL → `https://peptalk.bio/privacy` (was a broken giddyupp link)
- Support URL → `https://peptalk.bio/support` (was the peptalkpeptides shop)
- Apple Silicon **Mac App Store availability → OFF**
- Build 64 is in TestFlight (status Complete)

## Reference
- Repo: `github.com/giddyuppllc/peptalk`, branch `master`, HEAD `861c44a`
- Bundle id: `com.peptalkapp.peptalk` · Expo ~54 · RN 0.81.5
- HealthKit fix commit: `a47217c` — "resolve App Review 5.1.1(iv) — remove modified/encouraging permission prompt"
- Demo login: in ASC → App Review Information → Sign-In Information (kept out of this public repo)
