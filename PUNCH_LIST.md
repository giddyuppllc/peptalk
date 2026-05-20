# PepTalk app — punch list

Compiled 2026-05-15 from a read-only audit of this repo against the marketing site claims at `giddyuppllc/Peptalk.biowebcontainer`. Items are ranked by App Review impact.

---

## CRITICAL — marketing/legal mismatch (fix before App Store submit)

- [ ] **`src/services/integrations/healthKitAdapter.ts` (around the `connect()` permission call)** — Marketing claims PepTalk writes daily check-ins, body weight, and mindful minutes back to HealthKit. The actual auth call passes a write permission array that doesn't include them. Append `bodyMass`, `mindfulSession`, and `sleepAnalysis` to the write scopes; add a `scopeToHKWritePerms()` helper if a clean mapping doesn't exist yet. Note: `src/services/healthKitService.ts` is the *deprecated* path — comment at line 39 (`const HKModule: any = null`) confirms it's inactive — but its read permission list (lines 67-89) is still the authoritative list of what the app *intends* to request. Cross-check that `healthKitAdapter.ts` now requests all 15 read categories listed there.

- [ ] **`src/services/healthConnectService.ts` + `src/services/integrations/healthConnectAdapter.ts`** — Health Connect (Android) is stubbed. The adapter returns empty arrays and a note "Health Connect read paths land in 1.9.x". The marketing site lists Google Health Connect as a supported integration. Either ship real read paths in this release, or gate the Android Health Connect feature behind "coming soon" copy and remove `/integrations/google-health-connect` from the marketing site footer until ready.

- [ ] **`src/data/videos.ts` lines 16, 30, 44, 58, 72, 85, 98, 111, 124** — Eight Learn Hub video entries have `videoUrl: '…/PLACEHOLDER_*'`. Tapping any of them opens an invalid URL. Either replace with real YouTube/Vimeo URLs or remove the entries (and the empty-state copy if the Learn category goes empty).

- [x] **`src/services/adService.ts` — REMOVE ENTIRELY** — User confirmed AdMob is being pulled from the app; PepTalk will not run ads at launch. Delete `src/services/adService.ts`, any AdMob-related dependencies in `package.json` (e.g. `react-native-google-mobile-ads`), the iOS `Info.plist` SKAdNetworkItems / NSUserTrackingUsageDescription if AdMob was the only reason for them, and any UI surfaces that render the ad banner/interstitial. Marketing site has been updated to reflect "no ads in app."

- [ ] **`tester-feedback.md` lines 5-8** — Four unfixed bugs reported by testers, any of which is plausibly an App Review reject: back button broken on video screen, video playback failure, AI Recipe Generator → blank page, MOTSC in Dosing Calculator → freeze. Reproduce + fix each in the submit build.

---

## HIGH — feature shipped-but-incomplete

- [ ] **`docs/WORKOUT_VIDEOS.md:5-14`** — 311 workout videos uploaded to R2 (`peptalktraining` bucket → `videos.peptalkapp.com`), **zero** tagged with `exerciseId`. Pro tier currently shows "Video coming soon" on every exercise. Auto-tagger script exists at `scripts/ai-tag-videos.mjs` — run it, then Jamie reviews suggestions in the tagger UI and exports the manifest. This unblocks the Pro tier's core marketing promise.

- [ ] **`VIDEO_CONTENT_TODO.md`** — Confirms Tasks 1 + 2 (replace 8 Learn placeholders, populate exercise demo manifest for 308 remaining videos) still outstanding.

- [ ] **`src/data/howToGuides.ts`** — Only 3-4 guides exist (reconstitution, subq injection, read COA). If the Learn UI surfaces "guides" as a category expecting more, either add more or update the UI copy to match what's shipped.

- [ ] **`src/services/integrations/whoopAdapter.ts:31, 36, 43`** — Whoop OAuth marked `TODO(1.9.x)`; status returns "not yet implemented". Either implement or hide from the integrations menu so users don't see a connect button that does nothing.

- [ ] **`src/services/integrations/ouraAdapter.ts:33, 38, 45`** — Same as Whoop. Hide or implement.

- [ ] **`supabase/functions/community-moderate-image/index.ts`** — Grok-Vision-backed moderation is deployed but has a fail-safe "auto-approve on error" path. Verify the function logs in Supabase for recent errors — repeated Grok API failures would let flagged content through. Confirm the Grok API key is set in Supabase secrets.

- [ ] **`supabase/functions/lab-scan/index.ts`** — Pro-tier lab-scan extraction relies on `BETA_TESTER_EMAILS` Supabase secret to gate access. Verify it's actually set (`supabase secrets list`) or the function will 401 everyone.

---

## MEDIUM — polish / accessibility / tests

- [ ] **`ACCESSIBILITY_TODO.md`** — Roughly 30 back buttons + 30 close buttons lack `accessibilityLabel`. Run `grep -rn 'name="chevron-back"\|name="arrow-back"\|name="close"' app/ src/components/` and add labels (or migrate to the `<BackButton />` component if it has them baked in). App Review flags missing VoiceOver labels.

- [ ] **`SUPABASE_RLS_CHECKLIST.md`** — Checklist is entirely unchecked. Run the SQL query in lines 30-40 against the prod DB to confirm `rls_enabled=true` and `policy_count >= 4` for all 11 user-data tables (profiles, check_ins, dose_logs, meal_entries, workout_logs, journal_entries, saved_stacks, health_profiles, active_protocols, consultation_requests, chat_messages). Enable RLS on any tables missing it.

- [ ] **`src/store/useAuthStore.ts:98-102`** — Hardcoded test accounts (`free@test.com`, `plus@test.com`, `pro@test.com`, `jamie@test.com`, `jake@test.com`) bypass Supabase auth and override tiers. Wrap in `__DEV__` guard or remove from the production build path.

- [ ] **`src/constants/testProfiles.ts:19-26`** — Test profile data keyed on `@test.com` emails. Confirm these are not loaded in production.

---

## LOW — nice-to-have / future

- [ ] **`docs/WORKOUT_VIDEOS.md:156-166`** — "Server-side overrides table", "Vision-API auto-tag", "Bucket sync script" are listed as future work. Lower priority unless Pro tier video gripes show up post-launch.

- [ ] **`src/services/telemetry.ts:48, 60, 69, 77`** — Sentry integration commented out with `// TODO(sentry):`. If error tracking is desired, finish the integration; otherwise leave as-is.

- [ ] **`tester-feedback.md:11-24`** — Feature requests (Personalize macros, Greek yogurt measurements, multi-set Military Press, Workouts by category, Remove Trainerize videos, Lab work upload + AI, Apple Health sleep, Autocomplete search bars). The "Remove Trainerize videos" item suggests some third-party content may still be shipping — verify nothing copyrighted is in the bundle.

- [ ] **`src/types/fitness.ts:426-430`** — Comment notes "AI vision food scanner moved into Plus per Edward's pricing call ($9.99 zone)". Confirm `meal_scan` / `ai_food_scanner` features are correctly gated behind Plus tier in `PaywallModal` + all feature-check call sites.

---

## Summary — what blocks App Review

1. **HealthKit write permissions** — marketing claims writes, app requests none. (Top priority — affects credibility + Apple's privacy disclosure checks.)
2. **Health Connect Android** — stubbed. Either ship or temporarily mark "coming soon" in marketing.
3. **8 Learn Hub videos with PLACEHOLDER URLs** — user-facing broken links.
4. **311 untagged Pro-tier videos** — every Pro exercise shows "video coming soon"; the auto-tagger needs to run.
5. **AdMob placeholder unit IDs** — monetization broken.
6. **4 unfixed tester bugs** — back button, video playback, AI Recipe Generator, Dosing Calculator freeze.
