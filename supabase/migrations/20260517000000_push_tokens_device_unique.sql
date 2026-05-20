-- Cross-user push-token leak fix (2026-05-17 round-8 audit P0 #3).
--
-- Before: push_tokens had UNIQUE (user_id, expo_push_token). On a
-- shared device, user A could log in + sync, then quit the app
-- without logging out. User B logs in: their token is the same
-- physical Expo token, but the unique constraint allowed BOTH
-- rows to coexist (different user_ids). The community-push-fanout
-- + apple-notifications fanout then routed user A's pushes to
-- this device until DeviceNotRegistered pruning eventually
-- caught up — potentially days.
--
-- After: UNIQUE (expo_push_token). A given Expo token can map to
-- exactly one user. `syncPushToken` upserts with onConflict =
-- 'expo_push_token', atomically reassigning the row to user B
-- on first sync.
--
-- Migration plan:
--   1. Dedupe any existing duplicate-token rows by keeping the
--      most-recently-seen row.
--   2. Drop the old composite unique constraint.
--   3. Add the new token-only unique constraint.

BEGIN;

-- 1. Dedupe — keep the newest row per token.
DELETE FROM public.push_tokens a
USING public.push_tokens b
WHERE a.expo_push_token = b.expo_push_token
  AND a.id <> b.id
  AND COALESCE(a.last_seen_at, a.created_at, 'epoch'::timestamptz)
    < COALESCE(b.last_seen_at, b.created_at, 'epoch'::timestamptz);

-- 2. Drop the old composite unique constraint.
-- (Postgres auto-names the unique constraint based on column list. If
-- this fails, run `\d public.push_tokens` to find the actual name and
-- replace it here.)
ALTER TABLE public.push_tokens
  DROP CONSTRAINT IF EXISTS push_tokens_user_id_expo_push_token_key;

-- 3. Add the new token-only unique constraint.
ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_expo_push_token_key
    UNIQUE (expo_push_token);

COMMIT;
