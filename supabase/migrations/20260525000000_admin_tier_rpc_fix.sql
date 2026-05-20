-- Wave 76.46 — fix admin_set_user_tier
--
-- The 20260524 version had two issues:
--   1. "column reference 'email' is ambiguous" — RETURNS TABLE declared
--      a column named `email` which collided with `u.email` in the SELECT
--      body. PostgreSQL refused to resolve it.
--   2. The fallback path used a GUC (`current_setting('app.admin_emails')`)
--      to authorize JWT-authenticated admin calls. Supabase's `postgres`
--      role can't `ALTER DATABASE ... SET` because rolsuper=false at the
--      cluster level, so the GUC could never be set from the SQL editor.
--
-- This rewrite:
--   - Renames the OUT columns to non-colliding identifiers (out_user_id,
--     out_email, out_tier) so the column-ambiguity error goes away.
--   - Drops the GUC path. Admin tier flips only happen from the SQL
--     editor (session_user='postgres') or the Supabase MCP / CLI, both
--     of which already pass the session_user check. If we ever need an
--     in-app admin tier flipper, we'll add a small admins table and
--     check membership there.
--
-- PostgreSQL won't let CREATE OR REPLACE change the OUT-parameter
-- signature (SQLSTATE 42P13). DROP the prior definition first.
DROP FUNCTION IF EXISTS public.admin_set_user_tier(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_set_user_tier(
  p_email TEXT,
  p_tier TEXT
)
RETURNS TABLE(out_user_id UUID, out_email TEXT, out_tier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  IF p_tier NOT IN ('free', 'plus', 'pro') THEN
    RAISE EXCEPTION 'invalid tier %, expected free/plus/pro', p_tier;
  END IF;

  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'admin_set_user_tier: caller not authorized (session_user=%)', session_user;
  END IF;

  SELECT u.id INTO target_id
    FROM auth.users u
   WHERE lower(u.email) = lower(p_email)
   LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'no user with email %', p_email;
  END IF;

  UPDATE public.profiles
     SET subscription_tier = p_tier,
         updated_at = NOW()
   WHERE id = target_id;

  RETURN QUERY
    SELECT p.id, u.email::TEXT, p.subscription_tier
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE p.id = target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) IS
  'Admin-only RPC for changing subscription_tier. Caller must be session_user IN (postgres, supabase_admin). Called from the Supabase SQL editor or CLI — not from the client app.';
