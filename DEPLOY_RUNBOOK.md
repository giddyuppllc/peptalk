# PepTalk — Production Deploy Runbook

Generated 2026-06-29 after the full audit + e2e systems review. Run these **in order**
from the machine where the Supabase + EAS CLIs are logged in. Everything in the repo
(`origin/master`) is already committed — `git pull` first, then work this list top to bottom.

> Legend: 🟥 = blocks a core flow if skipped · 🟧 = important · 🟨 = polish/optional

---

## 0. Pull latest
```bash
git checkout master && git pull origin master
```

---

## 1. 🟥 Apply DB migrations  (`supabase db push`)
These MUST be applied or the data-sync layer 22P02-fails and the feed 404s on the new views.
`db push` applies them in filename order:

```
20260628000000_client_text_ids            # P0: id UUID→TEXT (restores all cloud sync)
20260628000001_dose_source_planned        # 'planned' dose source
20260628000002_lab_results                # lab cloud-sync table
20260628000003_anon_author_privacy        # ⚠️ masking views — MUST precede the client shipping
20260629000000_checkin_extra_columns      # respiratory_rate + body_measurements
20260629000001_pantry_nutrition           # pantry nutrition JSONB
20260629000002_fix_profiles_protect_trigger   # P1: stop every authed profile UPDATE throwing
20260629000004_reaction_mention_notifications # reaction/@mention notification triggers
20260629000005_reaction_notify_block_guard    # block-evasion fix: reaction notify respects community_blocks
```
```bash
supabase db push
supabase migration list      # confirm ALL of the above show as applied
```

---

## 2. 🟥 Set / verify Supabase secrets  (`supabase secrets`)
Missing any of these silently breaks a money / AI / push flow.

```bash
# AI — Aimee chat (xAI/Grok)
supabase secrets set GROK_API_KEY=<your xAI key>
supabase secrets set GROK_MODEL=<the LIVE xAI model id>   # verify it's valid; code default is grok-4-1-fast-reasoning

# AI — OpenAI vision (food/lab/pantry scans) + Whisper voice
supabase secrets set OPENAI_TRANSCRIBE_API_KEY=<your OpenAI key>   # the code now reads THIS for vision too

# Android IAP validation + lifecycle
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<service-account JSON>'
supabase secrets set ANDROID_PACKAGE_NAME=com.peptalkapp.peptalk
supabase secrets set GOOGLE_RTDN_AUDIENCE=<the google-rtdn function URL>   # see step 6

# Internal fn-to-fn auth (community push + crm fanout). Must match the DB GUC (step 3).
supabase secrets set INTERNAL_FUNCTION_SECRET=$(openssl rand -hex 32)

# Runtime env (sandbox-vs-prod IAP). 'production' for the store build.
supabase secrets set EXPO_PUBLIC_ENV=production

# Food-search proxy (keys moved OUT of the client bundle into the edge fn).
# Until these are set, food-search-proxy returns {unavailable} and those
# providers are skipped (Open Food Facts / UPC DB still work — they're keyless).
supabase secrets set USDA_API_KEY=<usda key>           # falls back to DEMO_KEY if unset
supabase secrets set SPOONACULAR_API_KEY=<spoonacular key>
supabase secrets set CALORIENINJAS_API_KEY=<calorieninjas key>

# Verify
supabase secrets list
```

---

## 3. 🟧 Wire the internal-secret into Supabase **Vault** + pg_net triggers (one-time)
The community-push-fanout / crm-event-fanout / live-broadcast / moderate-image triggers
pass `x-internal-key` via `net.http_post`. The trigger reads that value from **Supabase Vault**
(`vault.decrypted_secrets WHERE name = 'app_internal_function_secret'`) — **NOT** a `current_setting`
GUC. (`ALTER DATABASE … SET app.internal_function_secret` does nothing — the triggers never read it.)
The Vault value MUST equal the `INTERNAL_FUNCTION_SECRET` edge-fn secret from step 2, or every fanout
fn 401/503-drops while in-app notification rows still write (push just never fires).

Because the existing edge-fn secret value can't be read back, regenerate BOTH to one fresh value:
```bash
NEW=$(openssl rand -hex 32); echo "$NEW"          # paste this into the SQL below
supabase secrets set INTERNAL_FUNCTION_SECRET="$NEW"
```
Then in the Supabase **SQL Editor** (create-or-update — handles the case where it already exists):
```sql
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = 'app_internal_function_secret';
  IF sid IS NULL THEN
    PERFORM vault.create_secret('PASTE_NEW_HEX_HERE', 'app_internal_function_secret');
  ELSE
    PERFORM vault.update_secret(sid, 'PASTE_NEW_HEX_HERE');
  END IF;
END $$;
```
Verify it took:
```sql
SELECT name, left(decrypted_secret,6) || '…' AS val FROM vault.decrypted_secrets
  WHERE name IN ('app_internal_function_secret','app_supabase_url','app_service_role_key');
```
(`app_supabase_url` + `app_service_role_key` must also be present — same Vault pattern. If `base_url`
or `service_key` is NULL the trigger returns early and no fanout fires at all.)

---

## 4. 🟥 Deploy edge functions  (`supabase functions deploy`)
~30 functions changed/added this session (the gate-expiry hardening alone touched 18 tier-gate
fns + the shared `_shared/effectiveTier.ts` helper, which ships bundled with each). Two are
external webhooks → `--no-verify-jwt`. Simplest is `supabase functions deploy` (push ALL), then
re-deploy the two webhooks with the flag. The explicit changed-only list:

```bash
# Standard (verify JWT)
supabase functions deploy \
  aimee-chat aimee-chat-stream aimee-lab-interpret aimee-pantry-meal aimee-pantry-parse \
  aimee-pantry-scan aimee-plan aimee-recipe aimee-report-rewrite aimee-voice aimee-workout \
  community-create-comment community-create-post community-live-edit-message \
  community-live-send-message community-moderate-image community-push-fanout community-react \
  community-search community-suggest-topic community-upload-image crm-event-fanout delete-user \
  food-scan food-search-proxy get-workout-video lab-scan transcribe-workout-video validate-purchase

# External webhooks — MUST use --no-verify-jwt
supabase functions deploy apple-notifications --no-verify-jwt
supabase functions deploy google-rtdn        --no-verify-jwt
```
(Or just `supabase functions deploy` to push all, then re-deploy the two webhooks with the flag.)

---

## 5. 🟥 Supabase Auth dashboard (the live login fix)
Dashboard → **Authentication**:
- **Providers → Email → turn "Confirm email" OFF**  ← fixes the live "can't log in / make accounts" outage.
  (Or configure custom SMTP — Resend/SendGrid — if you want verification; the built-in SMTP is rate-limited and not for production.)
- **URL Configuration → Redirect URLs → add** `peptalk://auth/callback`

---

## 6. 🟧 Provision Google RTDN (Android renewals/cancels/refunds)
Without this the Android subscription LIFECYCLE never reaches the backend (function 503s).
1. GCP → Pub/Sub → create a topic (e.g. `peptalk-rtdn`).
2. Play Console → Monetize → **Monetization setup → set the RTDN topic** to that topic.
3. Play Console → Monetization setup → **enable "Voided purchases" notifications** (so refunds revoke).
4. Pub/Sub → add an **authenticated push subscription** targeting the `google-rtdn` function URL.
5. Set `GOOGLE_RTDN_AUDIENCE` (step 2) = that function URL.
6. Confirm the Play service account (from `GOOGLE_SERVICE_ACCOUNT_JSON`) has Android Publisher API + subscription view permission.

---

## 7. 🟧 EAS build config
- Confirm production env vars exist (or are embedded in `eas.json`): `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`
  are already embedded; set `EXPO_PUBLIC_SENTRY_DSN` (+ USDA/analytics if you use them) for the `production` environment, or paste me the DSN to embed.
- Android push: confirm **FCM V1 credentials** are uploaded — `eas credentials` (Android → push). Without it, Android push is silently dead.
- Submit: ensure `keys/google-play-service-account.json` is present locally at `eas submit` time.

---

## 8. 🟧 App Store Connect / Play Console
- IAP: `peptalk_plus_monthly` ($9.99) + `peptalk_pro_monthly` ($49.99) show **"Ready to Submit"**, attached to the version, with a review screenshot.
- **Discount codes:** generate **Apple Offer Codes** (ASC → Subscriptions → Offer Codes) and **Play promo codes**. Then INSERT rows into the `referral_codes` table (`code`, `discount_percent`, `apple_offer_code`) so the in-app redeem works. (Table is empty by design until you do this.)
- ASC → **App Store Server Notifications** Production URL → the `apple-notifications` function URL.
- Age rating **17+**; reviewer account = **Free tier + email-confirmed**.
- Play **Data Safety** form (incl. Audio→voice, health/photos/messages shared to xAI/OpenAI/R2/Sentry) + **Health Connect** declaration; publish the privacy-policy HTTPS URL.

---

## 9. 🟥 Build + submit
```bash
eas build -p ios --profile production
eas build -p android --profile production
eas submit -p ios --latest
eas submit -p android --latest
```

---

## 10. ✅ Post-deploy verification
- `supabase migration list` — all 8 applied · `supabase secrets list` — all set
- Probe a few functions live (anon key): a 401/400 = LIVE, a 404 = NOT deployed.
- **Real iPhone** (the only thing the sim couldn't test):
  - Sign up a fresh account → confirm it lands in the app (no email-confirm wall).
  - Apple Health → Connect → the iOS permission sheet appears → grant → data syncs + check-ins write back.
  - StoreKit **sandbox** purchase Plus, then **upgrade to Pro** → confirm tier flips to Pro (the crossgrade fix).
  - Redeem an offer code → confirm discount applies.
  - Aimee chat streams a reply; a food scan returns macros.

---

### Quick "why each matters" (from the audits)
- Skip **step 1** → every per-user write 22P02-fails (no cloud backup) + feed 404s.
- Skip **OPENAI_TRANSCRIBE_API_KEY** (step 2) → every food/lab/pantry scan 503s.
- Wrong/empty **GROK_MODEL** → all Aimee chat falls back to the local bot.
- Skip **GOOGLE_*** (steps 2/6) → Android revenue + lifecycle silently dead.
- Skip **step 5 email toggle** → new users can't complete signup (the current outage).
- Empty **referral_codes** (step 8) → every discount code returns "not accepted".
