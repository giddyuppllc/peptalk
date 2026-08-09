# PepTalk app — punch list

Compiled 2026-05-15 from a read-only audit of this repo against the marketing
site claims at `giddyuppllc/Peptalk.biowebcontainer`.

> **RE-VERIFIED 2026-08-09.** Every item below was checked against the code as
> it stands, not carried forward on trust. Most of the "blocks App Review" list
> was already fixed and the doc had gone stale — which is its own hazard: a
> stale punch list gets acted on, and two of these items were instructions to
> change things that are now correct.
>
> Status legend: **DONE** verified fixed · **OPEN** verified still true ·
> **WAS WRONG** the item itself was inaccurate · **NEEDS YOU** content or
> credentials only Edward/Jamie can supply.

---

## CRITICAL — marketing/legal mismatch (fix before App Store submit)

- **WAS WRONG** — **HealthKit write permissions.** The item said marketing
  claims writes of Body Mass, Mindful Session and Sleep Analysis while the app
  requests none. Checked: `getWriteScope()` requests Weight + MindfulSession,
  and BOTH are exercised — `writeWeightToHealth` from the check-in flow,
  `writeCheckInToHealth` (check-in) and `writeSymptomToHealth` (side-effect
  log) for MindfulSession. Sleep is not claimed to users: app.json's
  `NSHealthUpdateUsageDescription` reads "PepTalk writes your check-ins and
  weight back to Apple Health". Scope, plist and behaviour all agree. The stale
  comment in healthKitAdapter that repeated the sleep claim has been corrected,
  because it read as an instruction to widen a write scope that does not need
  widening.

- **OPEN / NEEDS YOU** — **Health Connect (Android) is stubbed.** The adapter
  still returns empty arrays. Either ship read paths or keep it marked "coming
  soon". The in-app integrations screen already labels it correctly; the
  marketing site is outside this repo.

- **DONE** — **8 Learn Hub videos with PLACEHOLDER URLs.** No longer reachable:
  `isRealVideo` filters on `comingSoon !== true && !/PLACEHOLDER/`, and every
  list/gallery/deep-link surface goes through it. All 9 entries are currently
  placeholders, so the Learn video screen shows an honest "Coming Soon" state
  rather than broken links.

- **DONE** — `src/services/adService.ts` removed.

- **DONE** — **4 tester bugs.** Back button, video playback (`19fccf7` — HLS
  with no HLS player on web), AI Recipe Generator, and the MOTSC dosing-calculator
  freeze (the memoisation note in `app/peptide/[id].tsx` documents the fix).

---

## HIGH — feature shipped-but-incomplete

- **DONE** — **311 workout videos, zero tagged.** Now 264 tagged and 251
  reaching a real exercise; 122 of 384 exercises have at least one clip. 53 of
  those were recovered on 2026-08-09 by tolerant id resolution — the tags were
  present but one character off (`plank-289` → `plank`).

- **NEEDS YOU** — 5 clips still resolve to no exercise because the exercise is
  missing from the catalog: `dumbbell-pullover`, `dumbbell-skull-crusher`,
  `narrow-grip-seated-cable-row`, `ball-straight-leg-bridge`, `dumbbell-fly`.
  Add the exercises or retag the clips. Reported every run by `verify:videos`.

- **NEEDS YOU** — **2 duplicate exercises** (same words, different order; only
  one of each pair carries clips): `bent-over-cable-bar-row` /
  `cable-bar-bent-over-row`, and `overhead-tricep-barbell-extensions` /
  `barbell-overhead-tricep-extensions`. Not auto-merged: deduplicating means
  choosing which id survives and moving every clip, program and saved workout
  that points at the loser.

- **OPEN** — `src/data/howToGuides.ts` still has 3 guides. All 3 resolve and
  render; it is a content gap, not a defect.

- **DONE** — **Whoop / Oura connect buttons.** Both render as "coming soon"
  cards with copy ("partnership in progress", "approval in progress") and no
  connect button, so nothing does nothing.

- **NEEDS YOU** — `community-moderate-image` auto-approve-on-error path and the
  `lab-scan` `BETA_TESTER_EMAILS` secret both need checking against live
  Supabase; not verifiable from the repo.

---

## MEDIUM — polish / accessibility / tests

- **DONE** — **Accessibility labels on back/close buttons.** The item estimated
  ~60 missing. Measured 2026-08-09: 118 back/close icons, 5 without a label.
  All 5 fixed (food-scanner ×2, FullScreenVideo, DaySummarySheet,
  ChatHistoryDrawer). Now 0 of 118.

- **DONE** — **Hardcoded test accounts.** No `@test.com` bypass exists anywhere
  in `src/` or `app/`. `TEST_PROFILES` is an empty map, so no test data ships.

- **NEEDS YOU** — `SUPABASE_RLS_CHECKLIST.md` needs running against prod.

---

## LOW — nice-to-have / future

- **WAS WRONG** — Sentry is not "commented out". The DSN is an EAS server-side
  environment variable, invisible to a repo grep, and the Expo plugin
  registration was fixed in `2a2f5c9`.

- **OPEN** — `docs/WORKOUT_VIDEOS.md` future work (server-side overrides table,
  bucket sync script).

- **OPEN / NEEDS YOU** — tester feature requests. Two are now built: weight
  per set (multi-set logging) and Apple Health sleep is read (not written, and
  not claimed). "Remove Trainerize videos" still wants a copyright check on the
  bundle.

- **OPEN** — confirm `meal_scan` / `ai_food_scanner` gating matches the Plus
  pricing call at every feature-check call site.

---

## Summary — what actually blocks App Review now

Nothing in this file, on the evidence above. The remaining items are content
(5 unmatched clips, 2 duplicate exercises, 3 guides, 48 peptides with no
safety profile), live-infrastructure checks that need Supabase credentials, or
decisions only you can make.
