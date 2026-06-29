#!/usr/bin/env bash
#
# verify-deploy.sh — post-deploy smoke check for PepTalk.
#
# Run AFTER working DEPLOY_RUNBOOK.md to confirm every edge function is live
# and the critical config is wired. Reads the project URL + anon key from .env.
#
#   bash scripts/verify-deploy.sh
#
# A function endpoint that returns 404 = NOT DEPLOYED. Any other status
# (401 auth-required / 400 bad-body / 405 method / 5xx) = the function is LIVE
# (we send an empty/anon body on purpose, so a non-404 means it's reachable).
#
# This does NOT prove a function runs the LATEST code or that its secrets are
# set — it proves reachability. Pair it with the on-device checks in the runbook.

set -uo pipefail
cd "$(dirname "$0")/.."

URL=$(grep -E '^EXPO_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2)
ANON=$(grep -E '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2)
if [ -z "${URL:-}" ] || [ -z "${ANON:-}" ]; then
  echo "✗ Could not read EXPO_PUBLIC_SUPABASE_URL / ANON_KEY from .env"; exit 1
fi
echo "Project: $URL"
echo "Probing edge functions (404 = NOT DEPLOYED) ..."
echo ""

FUNCS=$(ls -1 supabase/functions/ | grep -v '^_shared$')
NOTLIVE=0; LIVE=0
for fn in $FUNCS; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/functions/v1/$fn" \
    -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
    -d '{}' --max-time 30)
  case "$code" in
    404) printf "  \033[31m✗ %-30s 404 NOT DEPLOYED\033[0m\n" "$fn"; NOTLIVE=$((NOTLIVE+1));;
    000) printf "  \033[33m⚠ %-30s no response / timeout\033[0m\n" "$fn"; NOTLIVE=$((NOTLIVE+1));;
    *)   LIVE=$((LIVE+1));;
  esac
done

echo ""
echo "Live: $LIVE   Not-live: $NOTLIVE"
echo ""
echo "── Manual config to confirm (CLI-side) ──"
echo "  supabase migration list     # all 20260628*/20260629* applied?"
echo "  supabase secrets list       # GROK_API_KEY, GROK_MODEL, OPENAI_TRANSCRIBE_API_KEY,"
echo "                              # GOOGLE_SERVICE_ACCOUNT_JSON, ANDROID_PACKAGE_NAME,"
echo "                              # GOOGLE_RTDN_AUDIENCE, INTERNAL_FUNCTION_SECRET, EXPO_PUBLIC_ENV"
echo "  Dashboard → Auth → Email 'Confirm email' OFF (or SMTP) + redirect URL peptalk://auth/callback"
echo ""
if [ "$NOTLIVE" -eq 0 ]; then
  echo "✅ All $LIVE functions reachable. Now run the on-device checks in DEPLOY_RUNBOOK.md step 10."
else
  echo "❌ $NOTLIVE function(s) not deployed — re-run: supabase functions deploy <name>"
  exit 1
fi
