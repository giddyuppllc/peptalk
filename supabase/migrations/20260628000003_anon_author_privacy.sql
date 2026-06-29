-- ─────────────────────────────────────────────────────────────────────────
-- P1.6 — Anonymous author privacy for community posts + comments
-- ─────────────────────────────────────────────────────────────────────────
--
-- Problem: the feed/detail reads SELECT user_id straight off
-- community_posts / community_comments. The "Anyone can read non-deleted
-- rows" RLS policy happily returns user_id for is_anonymous rows too, so
-- even though the client cosmetically swaps the display name to
-- "Anonymous member", the *real* author user_id is still on the wire and
-- in client state (post.userId). Anyone with the network tab or a patched
-- client can de-anonymise every "anonymous" post + comment. That defeats
-- the entire point of the anonymous-posting feature.
--
-- Fix: read the feed/detail through SECURITY INVOKER views that mask
-- user_id for anonymous rows. The author still sees their own id (so the
-- edit/delete affordances keep working); everyone else gets NULL.
--
--   security_invoker = ON  ⟹  the view runs as the *querying* role, so:
--     1. the base-table RLS ("Anyone can read non-deleted rows",
--        soft-delete + pending-image policies) still applies — the view
--        does NOT widen visibility, it only narrows the user_id column;
--     2. auth.uid() inside the CASE resolves to the caller, so the
--        "author sees their own id" carve-out is correct per-request.
--
-- Writes (insert/update/soft-delete) continue to hit the base tables via
-- the community-* edge functions. These views are SELECT-only surfaces.

-- 1. Posts feed view — same columns the client already selects, with
--    user_id masked for other people's anonymous rows.
CREATE OR REPLACE VIEW public.community_posts_feed
WITH (security_invoker = on) AS
SELECT
  id,
  CASE
    WHEN is_anonymous AND user_id <> auth.uid() THEN NULL
    ELSE user_id
  END AS user_id,
  topic_slug,
  title,
  body,
  reaction_count,
  comment_count,
  is_deleted,
  is_anonymous,
  image_urls,
  last_edited_at,
  moderation_status,
  created_at,
  updated_at
FROM public.community_posts;

-- 2. Comments view — the client reads comment user_id the same way, so it
--    needs the same masking.
CREATE OR REPLACE VIEW public.community_comments_feed
WITH (security_invoker = on) AS
SELECT
  id,
  post_id,
  CASE
    WHEN is_anonymous AND user_id <> auth.uid() THEN NULL
    ELSE user_id
  END AS user_id,
  parent_comment_id,
  body,
  reaction_count,
  is_deleted,
  is_anonymous,
  image_urls,
  last_edited_at,
  moderation_status,
  created_at
FROM public.community_comments;

-- 3. Grants. Community is auth-gated; only authenticated may read. anon
--    gets nothing (no value in leaking even masked rows to the bare
--    project key). PUBLIC is revoked to be explicit.
GRANT SELECT ON public.community_posts_feed    TO authenticated;
GRANT SELECT ON public.community_comments_feed TO authenticated;
REVOKE ALL  ON public.community_posts_feed    FROM anon;
REVOKE ALL  ON public.community_comments_feed FROM anon;
REVOKE ALL  ON public.community_posts_feed    FROM PUBLIC;
REVOKE ALL  ON public.community_comments_feed FROM PUBLIC;

COMMENT ON VIEW public.community_posts_feed IS
  'Read surface for the community feed/detail. security_invoker=on so base '
  'community_posts RLS still applies; user_id is masked to NULL for other '
  'users'' is_anonymous rows. Author still sees own id for edit/delete. '
  'Writes go to community_posts via the community-* edge functions.';
COMMENT ON VIEW public.community_comments_feed IS
  'Read surface for community comment threads. security_invoker=on; user_id '
  'masked to NULL for other users'' is_anonymous rows. Writes go to '
  'community_comments via the community-* edge functions.';

-- ───────────── Rollback ─────────────
-- DROP VIEW IF EXISTS public.community_comments_feed;
-- DROP VIEW IF EXISTS public.community_posts_feed;
