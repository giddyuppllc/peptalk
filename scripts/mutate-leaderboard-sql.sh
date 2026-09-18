#!/usr/bin/env bash
# Mutation test for test:leaderboard-sql — proves the Docker harness CATCHES
# each security regression rather than passing over it.
#
#   bash scripts/mutate-leaderboard-sql.sh
#
# Each mutation breaks one guard in the migration, runs the harness, and
# restores the original (from a copy under $TMPDIR, never `git checkout`, so
# uncommitted work is not reverted). A mutation that exits 0 is a SURVIVOR:
# the harness is blind to that regression. Exits non-zero if any survive.
set -u
cd "$(dirname "$0")/.." || exit 1
M=supabase/migrations/20260915200000_community_leaderboard.sql
WORK="$(mktemp -d)"
O="$WORK/community_leaderboard.orig.sql"
cp "$M" "$O"
trap 'cp "$O" "$M"' EXIT
survivors=0

run() {
  local name="$1"
  if cmp -s "$O" "$M"; then
    echo "  ?? $name: mutation did not change the file — sed pattern is stale"
    survivors=$((survivors + 1))
    return
  fi
  npx tsx scripts/test-leaderboard-sql.ts > "$WORK/$name.txt" 2>&1
  local code=$?
  local fails
  fails=$(grep -c '  FAIL' "$WORK/$name.txt")
  if [ "$code" -eq 0 ]; then
    echo "  SURVIVED  $name (harness exited 0)"
    survivors=$((survivors + 1))
  else
    echo "  killed    $name (exit $code, $fails failing checks)"
    grep '  FAIL' "$WORK/$name.txt" | head -3 | sed 's/^/              /'
  fi
  cp "$O" "$M"
}

# 1. the opt-in gate removed from the leaderboard
awk 'BEGIN{d=0} /p.leaderboard_opt_in IS TRUE/ && d==0 {sub(/p.leaderboard_opt_in IS TRUE/,"TRUE"); d=1} {print}' "$O" > "$M"
run gate_removed_from_board

# 2. the opt-in gate removed from shout-outs
awk 'BEGIN{d=0} /p.leaderboard_opt_in IS TRUE/ {d++; if(d==2) sub(/p.leaderboard_opt_in IS TRUE/,"TRUE")} {print}' "$O" > "$M"
run gate_removed_from_shoutouts

# 3. the Supabase trap: REVOKE ... FROM PUBLIC only
sed 's/FROM PUBLIC, anon, authenticated;/FROM PUBLIC;/' "$O" > "$M"
run revoke_from_public_only

# 4. a private value smuggled into an allowed column (leaderboard function only;
#    the query still runs, so only the sentinel scan can catch it)
awk 'BEGIN{d=0} /^         pp.display_name,$/ && d==0 {print "         (SELECT u.email FROM auth.users u WHERE u.id = m.user_id),"; d=1; next} {print}' "$O" > "$M"
run email_in_display_name

# 5. an extra sensitive column added to the result
sed 's/^  is_self      boolean$/  is_self      boolean, peptide_name text/' "$O" > "$M"
run extra_result_column

# 6. blocks ignored
sed 's/^     AND NOT EXISTS ($/     AND (TRUE OR NOT EXISTS (/; s/^     );$/     ));/' "$O" > "$M"
run blocks_ignored

# 7. planned doses counted as taken
sed "s/AND coalesce(dl.source, 'user') <> 'planned'/AND TRUE/" "$O" > "$M"
run planned_doses_counted

echo
if [ "$survivors" -eq 0 ]; then echo "all mutations killed"; else echo "$survivors mutation(s) survived"; fi
[ "$survivors" -eq 0 ]
