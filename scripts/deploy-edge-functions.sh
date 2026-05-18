#!/usr/bin/env bash
#
# deploy-edge-functions.sh — deploy the critical-path Supabase functions
# needed for v1.9.x App Store launch.
#
# Run from the repo root:
#     bash scripts/deploy-edge-functions.sh
#
# Prerequisites:
#   - Supabase CLI installed + linked: `supabase link --project-ref <ref>`
#   - All secrets in supabase/.env.example set in the live project
#   - Most-recent migrations pushed: `supabase db push`
#
# Functions are deployed sequentially (not in parallel) so a failure
# stops the run and prints a clear message. Re-running is idempotent —
# Supabase replaces the prior version atomically.

set -euo pipefail

FUNCTIONS=(
  # Subscription / payments
  validate-purchase
  apple-notifications
  google-rtdn

  # Account lifecycle
  delete-user

  # AI / Aimee
  aimee-chat
  aimee-chat-stream
  aimee-action-confirm
  aimee-lab-interpret
  aimee-pantry-meal
  aimee-pantry-parse
  aimee-pantry-scan
  aimee-plan
  aimee-recipe
  aimee-report-rewrite
  aimee-voice

  # Vision (scan endpoints)
  food-scan
  lab-scan

  # Referrals
  redeem-referral-code

  # Community moderation
  community-moderate
  community-moderate-image
  community-report
  community-block
  community-live-report-message

  # Community CRUD
  community-create-post
  community-edit-post
  community-delete-post
  community-create-comment
  community-edit-comment
  community-delete-comment
  community-react
  community-follow
  community-search
  community-set-username
  community-suggest-topic
  community-upload-image

  # Community live chat
  community-live-start
  community-live-end
  community-live-send-message
  community-live-edit-message
  community-live-delete-message
  community-live-broadcast

  # Workout video (transcription + storage)
  get-workout-video
  transcribe-workout-video

  # Push + CRM fanout (called by pg_net triggers w/ x-internal-key)
  community-push-fanout
  crm-event-fanout
)

echo "Deploying ${#FUNCTIONS[@]} edge functions..."

# Functions that must deploy WITH --no-verify-jwt because they're called
# by external services that don't carry a Supabase Bearer:
#   - apple-notifications: Apple's S2S webhook (auth = JWS signature in body)
#   - google-rtdn: Google Cloud Pub/Sub (auth = OIDC token in body)
# Without this flag, Supabase rejects the call with 401 BEFORE the function
# code runs — webhooks die silently. Verified production-critical 2026-05-14.
NO_VERIFY_JWT_FUNCTIONS=(apple-notifications google-rtdn)

is_no_verify_jwt() {
  local target="$1"
  for f in "${NO_VERIFY_JWT_FUNCTIONS[@]}"; do
    [[ "$f" == "$target" ]] && return 0
  done
  return 1
}

for fn in "${FUNCTIONS[@]}"; do
  echo ""
  if is_no_verify_jwt "$fn"; then
    echo "→ $fn  (--no-verify-jwt: external webhook)"
    supabase functions deploy "$fn" --no-verify-jwt
  else
    echo "→ $fn"
    supabase functions deploy "$fn"
  fi
done

echo ""
echo "All functions deployed."
echo ""
echo "Next manual steps in App Store Connect:"
echo "  1. App Information → App Store Server Notifications →"
echo "     Production URL: https://<project>.supabase.co/functions/v1/apple-notifications"
echo "  2. Confirm peptalk_plus_monthly + peptalk_pro_monthly show 'Ready to Submit'"
echo "  3. Set age rating to 17+; paste the App Review Notes from"
echo "     docs/app-store-review-notes.md"
