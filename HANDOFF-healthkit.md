# Handoff — PepTalk Apple HealthKit "Connect does nothing" (TestFlight)

_Last updated: 2026-07-22. Repo: `giddyuppllc/peptalk`, branch `master`, tip `e8d0fab`, version `1.9.9`._

## The problem
On iPhone (TestFlight), tapping **Connect Apple Health** (Settings → Integrations)
does nothing — no permission sheet, no error. The Android Health Connect crash
was a **separate** issue and is already fixed (see below).

## What's already RULED OUT (verified this session)
- ✅ **App ID HealthKit capability** — enabled on the Apple Developer portal for
  `com.peptalkapp.peptalk`. HealthKit is listed in the **active** App Store
  distribution profile (`*[expo] com.peptalkapp.peptalk AppStore`, expires
  2027-03-21). (Confirmed via a browser check of developer.apple.com. An older
  same-name profile is `Invalid` but also lists HealthKit — unrelated, likely a
  rotated cert.) There is NO inline "Clinical Health Records" sub-toggle; a
  separate "HealthKit Access (Verifiable Health Records)" request exists under
  Capability Requests with status **No Status** — leave it alone.
- ✅ **Build config is correct:** `com.apple.developer.healthkit` entitlement is
  emitted (app.json `ios.entitlements` + the react-native-health config plugin);
  `NSHealthShareUsageDescription` + `NSHealthUpdateUsageDescription` present;
  privacy manifest declares Health + Fitness.
- ✅ **Native module links:** `react-native-health` **1.19.0** installed; the
  `RNAppleHealthKit` pod is in Podfile.lock. It's an old-arch bridge module
  (`RCT_EXPORT_MODULE`, accessed via `NativeModules.AppleHealthKit`).

## Remaining candidate causes (in priority order)
- **(A) Stale signing profile in the installed build.** The build currently on
  TestFlight predates HealthKit landing in the profile → entitlement stripped at
  signing → `initHealthKit()` rejects. **A fresh build fixes this** (EAS pulls
  the current HealthKit-enabled profile). `e8d0fab` has NOT been built yet.
- **(B) New-Architecture bridgeless exposure.** App has `newArchEnabled: true`.
  If RN 0.81's legacy interop doesn't expose the old-arch `AppleHealthKit`
  module, `NativeModules.AppleHealthKit` is undefined → `initHealthKit` is not a
  function. My telemetry captures exactly this (`hasNativeInit`).
- **(C) Permission sheet already answered.** iOS shows the HealthKit sheet only
  ONCE per install; a second tap does nothing. **Free 30-sec check:** iPhone →
  Settings → Privacy & Security → Health → Apps → is **PepTalk** listed? If yes,
  it already connected — toggle categories there; no build needed.

## What was SHIPPED this session (all on `master`, pushed)
- `e8d0fab` **fix(healthkit): honest availability + Sentry telemetry on connect**
  - `src/services/integrations/healthKitAdapter.ts`:
    - `available()` now also requires `typeof AppleHealthKit.initHealthKit === 'function'`
      → a missing/unexposed native module shows the card as unavailable instead
      of a dead button.
    - `connect()` emits **silent** Sentry events (no UI — App Review 5.1.1(iv)
      forbids any dialog around the Health request):
      - unavailable → `captureMessage('HealthKit connect: adapter unavailable', 'warning', { source:'healthkit.connect', moduleLoaded, hasNativeInit, hkDataAvailable })`
      - initHealthKit throws → `captureException(err, { source:'healthkit.connect', hasNativeInit, readScopes })`
- `4557043` fix(android): Health Connect permission delegate (the Android
  "app closes" crash — separate issue, done). Custom plugin at
  `plugins/withHealthConnectPermissionDelegate.js`.
- `2c0f57f` fix(iap): stop reporting environmental "IAP unavailable" as crashes.
- (Edward, same day) `f83ccb8` release 1.9.9, `1e05264` IAP finishTransaction fix.

## NEXT STEP — do this on the other machine
Prereqs: EAS CLI + `eas login`, and the git-ignored `./keys/` files present
(`AppStoreConnect_9GTUH8JTAM.p8`, `google-play-service-account.json`). **Never
open/paste the `.p8`** — EAS reads it by path.

```bash
cd ~/Projects/giddyuppllc/peptalk
git pull                                   # expect tip = e8d0fab (or newer)
git log -1 --oneline
npx eas build --platform ios --profile preview --auto-submit
npx eas build:list --platform ios --limit 5   # confirm new build # + status
```
- Lane `preview` = store distribution → TestFlight internal, `autoIncrement: true`
  (→ ~build 66), `appVersionSource: remote`.
- Submit config (eas.json): appleId `edward@giddyupp.com`, ascAppId `6760955746`,
  appleTeamId `6624WDHAHG`.

Then on the iPhone:
1. Install the new build. Check Settings → Privacy → Health → is PepTalk listed? (cause C)
2. Open PepTalk → Settings → Integrations → tap **Connect Apple Health** once.
3. Read Sentry (below).

## Reading Sentry to pinpoint the cause
- Org `giddy-upp-llc`, React Native project id `4511539348307968`.
- Filter issues for `source: healthkit.connect` (or search "HealthKit connect").
- API: `GET https://sentry.io/api/0/organizations/giddy-upp-llc/issues/?query=healthkit&statsPeriod=14d&project=-1`
  with header `Authorization: Bearer <SENTRY_TOKEN>`. **Token is NOT stored in
  this repo** — mint a fresh Sentry auth token (Settings → Auth Tokens) and
  revoke it after. (A prior token was used this session; revoke it if not
  already done.)

### Interpretation
| Sentry shows | Cause | Fix |
|---|---|---|
| Nothing + the iOS Health sheet appeared | (A) stale profile | Done — toggle categories |
| `adapter unavailable`, `hasNativeInit: false` | (B) bridgeless | Patch/upgrade react-native-health interop, or verify New-Arch exposure |
| Exception w/ an `initHealthKit` error message | entitlement/OS auth | Act on the specific message |

## Other open threads from this session (not HealthKit)
- **GiddyUpp (`~/Projects/GiddyUpp`, zebrastrike/GiddyUpp):** branch
  `fix/stale-chunk-reload` (2 commits) fixes two live Sentry web errors
  (stale-chunk reload + PostFXBoundary around all 6 EffectComposers). **Needs
  merge + deploy.** Direct push to main is guarded.
- **BioThrive (`~/Projects/biothrive`):** go-live audit fixes pushed `867accd`
  (wholesale display==charge, null-qty stock, empty-order guard, unsub
  fail-closed). **Still owed by you:** run `pnpm db:push` (+ `db:seed`) before
  launch — otherwise every checkout fails silently. Open decisions: wholesale +
  auto-promo stacking (business), restock-flag schema change, pending-order
  stock sweeper cron, 2 trivial security niceties.
