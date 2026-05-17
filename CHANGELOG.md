# PepTalk — branch `fix/jamie-feedback-round-1` changelog

2026-05-17. Audit + hardening pass across security, correctness,
performance, accessibility, and IAP. Scope: **118 files changed,
+7,834 / -4,301 LOC.** Test infrastructure went from 0 → **8 verify
harnesses, 363 assertions, all passing.**

This file documents every shipped change. For the deploy steps, see
`memory/peptalk-pending-edge-fn-deploy.md` (3 schema migrations + 1
internal secret + 1 env flag + 4 trigger SQL updates + ~20 edge fn
deployments — **run those before promoting this branch**).

## Security

- **PostgREST filter injection** in `community-search` fallback path —
  crafted `q` could inject arbitrary filters and leak other users'
  drafts/blocked posts. Replaced `.or(\`title.ilike.%${escaped}%,…\`)`
  interpolation with per-column `.ilike()` + dedup.
- **Unauthenticated fanout fns × 4** — `community-live-broadcast`,
  `community-push-fanout`, `community-moderate-image`,
  `crm-event-fanout` accepted any POST. Anyone could spam pushes,
  force-approve flagged posts, or tamper attribution. Added
  `INTERNAL_FUNCTION_SECRET` shared-secret gate; pg_net triggers
  must now send `x-internal-key` header.
- **`aimee-chat` non-atomic rate limit** — last hold-out using
  read-then-write tier limit. Migrated to atomic `bump_ai_usage` RPC.
- **Pre-parse size guards** on `aimee-pantry-scan`, `food-scan`,
  `lab-scan` — 100MB body could OOM worker before 6MB base64 check
  fired. Now reject on `Content-Length > 10MB` before parsing.
- **Server-side LLM-output clamps** in `aimee-action-confirm`:
  `commitMealTemplate` now clamps title (≤120), per-row item macros,
  meal-type enum, totals, notes; pins `source: 'aimee'` against
  override.
- **`aimee-report-rewrite`** 8KB cap + tag-strip on LLM rewrite output
  persisted to SecureStore.
- **Client-side LLM-output sanitize** across 7 surfaces — extracted to
  pure module `src/utils/aimeeActionSanitize.ts`. Chat apply\* handlers,
  pantry-suggestions, meal-plan, recipe-generator, food-scanner,
  pantry/scan, pantry/add, labs/entry pre-fill all now route through
  clamped helpers.
- **Sandbox receipt rejection in prod** (`validate-purchase`) —
  anyone with a sandbox-signed receipt could self-grant Pro tier in
  the released app. Now reads `EXPO_PUBLIC_ENV` + receipt environment;
  rejects sandbox in prod runtime.
- **Apple notification out-of-order ordering** — late `EXPIRED` for
  period N arriving after `DID_RENEW` for N+1 silently downgraded
  paid users. Now compares incoming `expires_at` against stored row;
  ignores stale non-terminal events.
- **Push-token cross-user leak** — `UNIQUE (user_id, expo_push_token)`
  allowed user A's row to persist after a shared-device user switch,
  forwarding pushes to the wrong user. Migration to
  `UNIQUE (expo_push_token)` + client upsert switched to
  `onConflict: 'expo_push_token'`.
- **IAP listener cross-user** — Ask-to-Buy approval delivered after a
  logout/login cycle could credit user B with user A's purchase.
  Now captures boot-time uid in closure + tears down & re-inits IAP
  listener on user change.

## Correctness

- **NaN poison in `getDailyTotals`** — primary macros lacked `?? 0`
  guards. Legacy or AI-emitted meal row with undefined calories
  NaN-poisoned every macro percentage downstream.
- **`consumeQuantity` NaN guard** — pantry row could be poisoned to
  NaN by a hostile decrement amount.
- **`logWater` NaN guard** — same defense.
- **`addDays` UTC/local off-by-one** in `aimeeReports.ts` —
  weekly-report date windows shifted by 1 day in Western TZs. Local
  noon anchor + Date→string compare for date-only fields.
- **`addDays` UTC off-by-one** in `milestones.ts` — cycle-complete
  + PR timestamps off-by-one in negative-offset TZs. Added
  `dateOnlyToIsoLocal()` helper.
- **`generateCycleDates` UTC bug** in `calculatorV2.ts` — users west
  of UTC got cycles starting one day early.
- **`doseAdherence.resolveActiveCycle` UTC bug** — `new Date('YYYY-MM-DD').setHours(0,0,0,0)` in PDT silently shifted dates,
  inflating `daysElapsed` and deflating every user's adherence
  percent by ~14% on a daily 7-day cycle. **Caught by the
  harness.** Fixed.
- **`useWorkoutStore` reduce sums** — `set.reps` unguarded, NaN if
  undefined. Added `?? 0`.
- **Tier-read race in `useJournalStore` + `useStackStore`** — read
  tier without `hasHydrated` check; Pro user's first write after
  launch silently rejected as free. Fall-through during hydration.
- **`commitLogField`** check_ins value range validation at commit.
- **Lab pre-fill bounds** (`labs/entry.tsx`) — vision-emitted markerId
  + value pumped into form state unchecked. 80-marker cap,
  markerId allowlist, value 0–1M, drawDate round-trip.
- **Aimee weekly report tz comparison** — string-key vs Date.

## Reliability / sync

- **Offline retry queues** added on **dose / workout / journal**
  stores (mirroring the existing chat pattern). `pendingSyncs: string[]`
  per store, `flushPendingSyncs()` actions, both syncRecord call
  sites enqueue on failure, persisted across cold launches, wiped on
  logout, wired into boot + reconnect. Previously a dose / workout /
  journal logged offline stayed local-only forever.
- **Chat retry queue boot race** — `flushPendingSyncs` called before
  rehydration ran was a no-op. Added `hasHydrated` flag + wait.
- **Chat cross-user replay on shared device** — pendingSyncs not
  wiped on logout. New `resetForLogout()` action wipes everything.
- **Splash deadlock** — fonts had a timeout fallback but the three
  hydration flags didn't. Corrupt store → splash hangs forever.
  8s ceiling forces splash dismiss + Sentry breadcrumb.
- **Subscription `setTier` stale fields** — `expiresAt`/`productId`
  weren't cleared on tier change, causing win-back banner false fires.
- **Subscription `setTierFromProfileMirror`** — auth path was
  clobbering authoritative `syncFromServer` writes. New method no-ops
  if syncFromServer ran within 5 minutes.
- **iOS/Android dual-platform conflict** — sync picked
  most-recently-validated row, which could pick an expired Android
  sub over a still-valid iOS sub. Now scored: valid-and-non-expired
  always beats expired, regardless of last-validated.
- **`hasFeature` expiry leak** — `tier='pro'` kept unlocking features
  past renewal failure if the webhook hadn't landed. Now requires
  `isActive` + non-expired window.
- **Notification scheduler races** — `Date.now()`-suffixed
  identifiers on 6 schedulers (`scheduleMealSafetyChecks`,
  `scheduleWorkoutReminder`, `scheduleMealReminder`,
  `scheduleCheckInReminder`, `scheduleDailyMotivation`,
  `scheduleGoalReminder`) meant concurrent callers stacked duplicate
  pings. Stable IDs + explicit cancel-by-id.
- **Dose-reminder cancel leak** — `cancelRemindersByTag('dose-${id}-')`
  with trailing dash didn't match single-cadence schedules that use
  `dose-${id}` (no dash). Deactivated protocols kept firing reminders
  forever. Switched to canonical `cancelDoseRemindersFor(peptideId)`.
- **Push-token leak fix** (see Security).
- **Notification cold-tap intent stash** — deep-link from a
  notification tap before auth rehydration was lost. New
  `pendingDeepLinkRef` stashes the route; drained after
  `isAuthenticated` flips.
- **`mountedRef` guards** added to 5 long-running scan screens
  (`meal-scan`, `food-scanner`, `recipe-generator`, `pantry/add`,
  `labs/entry`) — backing out mid-scan no longer leaks state into
  the next mount.
- **Telemetry rate-limit** — per-signature 30s floor prevents Sentry
  quota burn from a runaway `useEffect`.
- **Logout `catch {}` blocks** wrapped in `safeClear` helper that
  captures every failure to telemetry tagged with store name.
- **Supabase noop client misconfig** now fires Sentry `error`
  outside `__DEV__` guard. Subscription sync exhausted retries +
  IAP purchaseErrorListener also now telemetry-surfaced.
- **`secureStorage` plaintext fallback** surfaces once via
  `captureMessage` if encryption native module fails to load.

## Schema

Three migrations land with this branch (see deploy memory for order):

- `20260517000000_push_tokens_device_unique.sql` —
  `UNIQUE (expo_push_token)`.
- `20260517000001_subscriptions_purchase_token.sql` — dedicated
  `purchase_token` column with backfill + UNIQUE index. `google-rtdn`
  + `validate-purchase` updated.
- `20260517000002_schema_audit_fixes.sql` — consolidates 8
  P0/P1 schema fixes:
  - **Creates missing `side_effect_entries` table** — was referenced
    by client store but had no migration. Side-effect logs silently
    never round-tripped.
  - **Live-event BEFORE trigger** — original AFTER trigger silently
    discarded `started_at` mutation.
  - **`purge_expired_aimee_pending_actions()` RPC** — table was
    growing unbounded; expires_at field unused. Call from pg_cron.
  - **CHECK constraints** on `check_ins` mood/energy/stress/recovery/
    sleep_quality/appetite/spo2/weight_lbs/steps/resting_heart_rate +
    `journal_entries.mood` + `workout_logs.rating`. Server now
    refuses out-of-range writes.
  - **5 composite indexes** for stores that `.order('created_at')`.
  - **`chat_messages` thread index**
    `(user_id, chat_id, created_at DESC)`.
  - **`cycle_period_entries` + `contraception_history`** end_date >=
    start_date CHECK.
  - **JSONB array shape CHECK** on `meal_entries.foods` +
    `workout_logs.sets`.

## Performance

- **Deleted `assets/auth-bg.jpg`** — 2.2 MB unused asset.
- **`expo-image-picker` dynamic import** in profile.tsx — saves
  ~80 KB JS + native bridge surface off boot path.
- **Worklet leak fixes** in 6 components — `AimeeFAB`,
  `AimeeCenterpiece`, `PepTalkCharacter`, `BodyModel`, `Confetti`,
  `SkeletonLoader` — `cancelAnimation()` on unmount + Reduce Motion
  honored.
- **FlatList virtualization hints** on `workouts/exercises.tsx` +
  `journal/index.tsx` — `initialNumToRender`, `windowSize`,
  `removeClippedSubviews`.

## Accessibility

- **`accessibilityViewIsModal`** added to 12 modal components — VO
  focus correctly trapped inside every modal.
- **9 TextInput a11y labels** in dose-log dialog, MealBuilder, and
  Calculator `NumericField` (which now accepts the prop and falls
  back to a sensible default for every call site).
- **Calendar day-cell labels** — day cells now announce date +
  event-type summary (dose, check-in, journal, workout, meal) to
  VoiceOver.
- **Peptide detail screen** — 7 elements got role+label (peptide
  pair chips, NCT link, DOI link, related stack/video/guide cards,
  quick action buttons).
- **`BackButton` 40×40 → 44×44 pt** — meets iOS HIG minimum tap
  target on every screen using it.
- **Camera permission `Linking.openSettings()` button** on
  `meal-scan` + `food-scanner` when OS won't re-prompt.
- **MealBuilder mislabeled buttons** — "Close" on remove-ingredient
  / clear-search relabeled to correct actions.

## Test infrastructure

8 verify harnesses runnable via `npm run verify:all`:

| Harness | Surface | Assertions |
|---|---|---|
| `verify:calc` | §14 calculator math | 46 |
| `verify:sanitize` | Aimee action sanitize | 99 |
| `verify:cycle` | Cycle predictor | 39 |
| `verify:adherence` | Dose adherence (caught a real timezone bug) | 31 |
| `verify:labparsers` | LabCorp + Quest parsers | 45 |
| `verify:mealmath` | `computeDailyTotals` (refactored to pure fn) | 35 |
| `verify:dosecalc` | Legacy reconstitution module | 35 |
| `verify:inbody` | InBody parser | 33 |
| **Total** | | **363** |

`npm run verify:all` runs all 8 in sequence. Two real bugs caught
during harness authorship (cycle confidence + adherence TZ).

## New utility / data modules

- `src/utils/aimeeActionSanitize.ts` — single source of truth for
  LLM-output clamping
- `src/utils/mealMath.ts` — `computeDailyTotals` extracted from
  `useMealStore` for testability
- `src/hooks/useTheme.v3Bridge.ts` — v3 theme bridge for legacy
  v2-consumer screens
- `src/hooks/useAimeeVoice.ts` — Whisper voice flow
- `src/components/AimeeVoiceButton.tsx` — voice FAB

## New edge functions

- `aimee-voice` — Whisper STT, 60/day Pro cap (was UNLIMITED)
- `aimee-report-rewrite` — server-side LLM rewrite of templated
  weekly reports
- `aimee-pantry-scan` — vision → pantry items with nutrition
  snapshot

## Deferred (intentionally)

- `peptides.ts` / `protocols.ts` lazy split (touches 32 importers)
- `allowFontScaling` sweep / v3 hard-coded font sizing
- `app/(tabs)/peptalk.tsx` v2→v3 theme JSX migration (originally
  deferred large refactor)
- AsyncStorage encryption hard-block (would block Expo Go + dev)
- Reduce Motion on FadeInDown entry cascades (lower impact —
  one-shot animations)
