-- ─────────────────────────────────────────────────────────────────────────
-- Wave 76.10 — close P0 RLS gap on community_moderation_log
-- ─────────────────────────────────────────────────────────────────────────
--
-- The table was created without ENABLE ROW LEVEL SECURITY and without any
-- policy. PostgREST auto-exposes it to `anon` + `authenticated`, so any
-- caller with the project anon key could read the FULL AI-vision audit
-- trail: every post/comment id, every flagged URL, every category list,
-- and the raw Grok response JSONB (which can include verbatim post
-- content + a reasoning trace about user-submitted images).
--
-- The table is a service-role-only admin audit log; it should NEVER be
-- exposed to client roles. Enable RLS and ship zero policies — locks
-- access to service-role only. The community-moderate edge function
-- already runs as service-role, so the existing read path keeps working.

ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;

-- No policy = no access for anon/authenticated/anyone except the
-- service role (which bypasses RLS by design). This is the intended
-- posture for an internal moderation audit log.

-- Idempotent revoke just in case a previous test grant snuck in.
REVOKE ALL ON public.community_moderation_log FROM anon;
REVOKE ALL ON public.community_moderation_log FROM authenticated;
