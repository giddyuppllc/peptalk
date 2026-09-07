# PepTalk — what bites here

Read this before changing anything. It is not a style guide; it is the list of
things that have actually broken this repo, several of them more than once.

---

## Branch

**Work on `master`.** `feat/pwa-web-support` is fully absorbed into it and 109
commits behind — everything on that branch is in master, and nothing on master
is on it. Web/PWA support is already merged.

## Install

`.npmrc` must keep **`node-linker=hoisted`**, and there must be **no
`package-lock.json`**. CI enforces both as its first step.

Without hoisting, Expo autolinking and Nitro codegen fail to wire
`react-native-iap`'s native module on a clean EAS build, and the paywall crashes
with "undefined is not a function". Local dev masks it — EAS installs fresh.

## The regression net

```
pnpm typecheck && pnpm lint:ci && pnpm test && pnpm verify:all
```

`verify:all` is ~28 bespoke scripts and is the real net here — data integrity,
route reachability, dead components, dosing consistency, CSP, nav params. Run it
before every push. CI runs the same four.

**It has silently died before.** `verify-deadzones` imported a named `globSync`
from `glob` v7, which is CommonJS and has no such export — the script threw on
load and took the chain down at step 16 of 28, so twelve checks stopped running
and nobody noticed. If a verify script starts failing to *load*, everything after
it disappears rather than failing loudly. Use `node:fs`'s built-in `globSync`.

Stryker (`pnpm test:mutation`) and the 15 Maestro flows exist but are **not** in
CI. They are manual.

## Navigation — the tab bar is hidden on purpose

`app/(tabs)/_layout.tsx` sets `tabBarStyle: { display: 'none' }`. The four Home
cards are the navigation. So:

- **"Add a tab" is not a way to make something reachable.** Nothing renders them.
- Everything else reaches users through **`src/lib/navMap.ts`**, which drives the
  PT button's sheet and is checked by `verify:routes`.
- A new section under `app/` with no entry in that map **fails the build**.

This is not theoretical: App Review rejected build 1.9.8 under 2.3 because the
reviewer could not find the dose calculator named in our own App Store
description. It existed, two taps from Home. `/calculators` — a second, richer
hub — had no inbound link from any screen at all, and `verify:routes` called it
reachable because Aimee's route allowlist contained the string. That script
counts any path-shaped string as a link; treat a clean run as "no obvious
orphans", not proof.

## App Review — the rules that have cost us builds

**5.1.1(iv), HealthKit — rejected four times.** One informational screen may
precede the system permission sheet. It must have **no dismiss control of any
kind** (no button, no backdrop tap, no Android back), a **neutral forward label**
("Continue" or "Next", never "Connect"), and it must lead **directly to the
system sheet, never to Settings**.

The fix that failed three times read the rejection backwards — it recorded the
defects as "there was no way to back out, and there was no route to Settings"
and added both. `src/components/HealthPermissionExplainer.tsx` carries the full
note, and a test asserts on its control *set* rather than its rendering, because
the rejected version rendered perfectly.

**2.1(a), login.** Two rejections have been "sent back to the login page after
logging in", both on a clean install. The guard (`src/lib/routeGuard.ts`) is
provably loop-free — the bug is always something putting the app into
`isComplete: true, isAuthenticated: false`, or the session vanishing underneath
it. Never leave those two flags disagreeing.

**2.3.10, no Android names in the iOS binary.** `verify:iosstrings` guards it.
Gate with `Platform.OS`, or add an allowlist entry *with a reason*.

**Never claim a permission result you cannot know.** iOS does not report
read-authorization status. Anything that says "connected" or "access revoked"
without a definite signal is a guess shown as fact — a five-second timeout
reported as "Access revoked — reconnect in Settings" is what produced a separate
2.1(a) rejection, sending a reviewer to a Settings page with no Health toggle on
it.

## Releases must be traceable

`app.json` said `1.9.9` while Apple was reviewing `1.10.0 (75)`, and **no commit
ever set 1.10.0**. The rejected binary corresponded to no commit, so "we fixed
it" and "it is still broken" were both true and unfalsifiable.

Every submitted build must come from a commit that sets its version. Tag it.

## The backend deploys separately

Migrations and edge functions do **not** ship with the app.

- All 55 edge functions in `supabase/functions/` are deployed. Five more are
  deployed with **no source in this repo** — see `DB_HANDOFF.md`.
- The migration ledger was repaired on 2026-08-31 and now records all 57 files,
  so **`supabase db push` is safe again**. Verifying the objects before repairing
  is what turned up `20260804000010_community_owner_update_guard.sql`, which had
  never been applied — a live hole letting a user self-approve their own
  pending-image post. Repairing the ledger blind would have sealed it shut
  permanently. See `DB_HANDOFF.md` §7.
- The ledger and the repo agree exactly (57 rows, 57 files) as of 2026-09-01.
  The 13 rows that once looked orphaned were the SAME migrations under
  CLI-generated timestamps — matched by `name`, duplicates removed. The schema
  IS reproducible from this repo; an earlier note here said otherwise and was
  wrong.
- `DEPLOY_RUNBOOK.md` stops at June and is stale on this point.

## Docs here go stale, loudly

Several handoff files describe states master moved past — `DEPLOY_RUNBOOK.md`,
`docs/TONIGHT-LAUNCH-CHECKLIST.md`, `HANDOFF-healthkit.md`, `CHANGELOG.md` (still
titled with a May branch name). `PUNCH_LIST.md` is the most current status board.
Check a doc's claims against the code before acting on them — that is how the
HealthKit rejection got recorded inverted and shipped twice.

## Known shape of this codebase

- **Two HealthKit implementations.** `src/services/healthKitService.ts` (used by
  check-in) and `src/services/integrations/healthKitAdapter.ts` (used by the
  integrations screen). They are separate. Fixing one does not fix the other.
- `src/lib/products.ts` is RN-free on purpose so it can be unit-tested.
- Web has no `expo-secure-store`; `webStorageAdapter` uses localStorage and falls
  back to memory. Both adapters now report degraded persistence rather than
  swallowing it.
- The desktop gate (`src/components/DesktopGate.tsx`) means a desktop browser
  only ever exercises the gate page — CSP and web behaviour must be verified on
  a phone or an installed PWA.

## Running the E2E flows

`.maestro/` holds 19 flows. They are NOT in CI — they are manual, and they only
tell the truth if you know which platform each one belongs to.

```bash
# iOS — erase first for anything auth-related; clearState does NOT wipe the Keychain
xcrun simctl erase <udid> && xcrun simctl boot <udid>
maestro --device <udid> test .maestro/login.yaml -e EMAIL=… -e PASSWORD=…

# Android — needs the SDK, an emulator, and Metro reachable
adb reverse tcp:8081 tcp:8081
maestro --device emulator-5554 test .maestro/navigation.yaml
```

**Every UI flow runs `prepare-app.yaml` first.** It settles the app and clears
two things that otherwise produce false failures: React Native's LogBox banner —
a NATIVE overlay window on Android that swallows touches well beyond its visible
area — and the launch-time AI-consent modal. A day was lost to the first one
looking exactly like a product bug. Do not remove that preamble.

**Preconditions, because a red run usually means one of these, not a defect:**

| Flow | Needs |
|---|---|
| `login.yaml` | an ERASED device — `clearState` leaves the iOS Keychain intact, so it boots signed in and proves nothing |
| most others | an already signed-in app; run `login.yaml` first |
| `healthkit-visible` | **iOS only** — Apple Health does not exist on Android |
| `healthkit-explainer` | **a real device** — the Simulator reports no HealthKit data layer, so Apple Health renders under "Coming soon" with no entry point |
| `subscribe` | a store that can sell — an Android `google_apis` image has no Play Billing |
| `workout-generate-test` | answers a SECOND, point-of-use AI consent prompt |

**Selectors are platform-specific more often than you would like.** "Log In"
appears twice on the auth screen and the submit button is index 0 on iOS and
index 1 on Android. Prefer an `accessibilityLabel`, and if you add a primary CTA
give it one — the pattern here is icon + text inside a gradient, which composes
a label including the decoration and defeats matching on the visible words.

## Deploying the PWA

```bash
npm run deploy:web        # export → verify:build → vercel deploy --prod
curl -s https://app.peptalk.bio | grep build-commit   # a green deploy is not a served build
```

`verify:build` is a real gate and `deploy:web` chains with `&&`. It refuses a
build carrying Square sandbox, and (since 90fc3c1) one carrying the production
SDK and app id with the SANDBOX location — the combination that would tokenize
cards against the wrong location while every other signal looked right. There is
an `ALLOW_SANDBOX_PAYMENTS=1` escape hatch; using it ships a PWA that cannot take
a payment.

### The build needs env that lives nowhere else

`EXPO_PUBLIC_SQUARE_ENV`, `_APPLICATION_ID`, `_LOCATION_ID` and
`EXPO_PUBLIC_SENTRY_DSN` are inlined at BUILD time — the Vercel project holds no
environment variables, because a static export has nothing to read at runtime.
They are in `.env` (gitignored). All four are public by design and already ship
in the client bundle.

They had to be recovered from the live bundle on 2026-08-31 because they existed
in no repo and no Vercel project, and the then-live build was stamped with a
commit present in **no branch**. Keep `.env` intact, or a build silently falls
back to sandbox.

**`.env` must end with a newline.** Without it the last variable is dropped, and
the symptom is a build that looks fine while shipping the sandbox Application ID.

### Auto-update, and why sw.js is stamped

A browser installs a new service worker only when the BYTES of sw.js change.
`public/sw.js` is static, so every deploy served an identical file, the browser
never ran install/activate, and the cache-purge in `activate` never ran. An
installed PWA in standalone mode can stay resident for days without a full
navigation, so it had no way to notice a new build at all.

`inject-pwa` now stamps the build commit into `dist/sw.js`; the registration
calls `reg.update()` on load and on visibilitychange (throttled to 15 minutes);
and `controllerchange` reloads the page ONCE, guarded, so an open tab stops
running the old bundle.

Verified across two real deploys: the served `sw.js` first line went from
`// build: 1d99768…` to `// build: 90fc3c1…`.
