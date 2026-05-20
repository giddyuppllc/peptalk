-- Wave 76.42 — clean admin tier management
--
-- The profiles_protect_tier trigger (from 20260426000000_rls_hardening)
-- only allows the `service_role` JWT to change `subscription_tier`. That's
-- correct for blocking spoofing via client API calls, but it bites when
-- legitimate admin operations run via the Supabase dashboard's SQL editor
-- (which connects as the `postgres` superuser, not `service_role`) or via
-- the MCP / Supabase agent.
--
-- The workaround so far has been "disable trigger → update → re-enable
-- trigger" — fragile and risky if anyone forgets the re-enable step.
--
-- Two changes here:
--   1. Update the trigger function to ALSO allow `session_user = 'postgres'`
--      and `session_user = 'supabase_admin'`. These are the connection-level
--      roles used by direct SQL access; they're already as privileged as
--      service_role at the database layer, so this changes nothing security-
--      wise.
--   2. Add a clean `admin_set_user_tier(p_email text, p_tier text)` RPC
--      that admins can call to flip a user's tier without ever touching the
--      trigger. Uses SECURITY DEFINER + an explicit admin-email allowlist
--      so it can't be invoked by regular users.

CREATE OR REPLACE FUNCTION public.profiles_protect_tier_columns()
RETURNS TRIGGER AS $$
DECLARE
  is_privileged BOOLEAN;
BEGIN
  is_privileged :=
       coalesce(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Anyone else gets their tampering reverted.
  NEW.subscription_tier := OLD.subscription_tier;
  NEW.subscription_started_at := OLD.subscription_started_at;
  NEW.subscription_expires_at := OLD.subscription_expires_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Admin RPC — call this instead of UPDATE-ing profiles directly.
-- Usage from the SQL editor:
--   select public.admin_set_user_tier('reviewer@peptalk.bio', 'pro');
--
-- ADMIN_EMAILS must be set as a database setting. From the SQL editor:
--   alter database postgres set app.admin_emails =
--     'edward@giddyupp.com,jamieespositofit@gmail.com';
-- The setting persists across sessions and is read by current_setting().
CREATE OR REPLACE FUNCTION public.admin_set_user_tier(
  p_email TEXT,
  p_tier TEXT
)
RETURNS TABLE(user_id UUID, email TEXT, subscription_tier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  admin_csv    TEXT;
  admin_emails TEXT[];
  target_id    UUID;
BEGIN
  -- Validate the requested tier first so a typo can't burn through the
  -- authorization check.
  IF p_tier NOT IN ('free', 'plus', 'pro') THEN
    RAISE EXCEPTION 'invalid tier %, expected free/plus/pro', p_tier;
  END IF;

  -- Two acceptable callers:
  --   (a) a connection-level admin (dashboard SQL editor / direct psql)
  --   (b) an authenticated user whose email is in app.admin_emails
  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    admin_csv := coalesce(current_setting('app.admin_emails', true), '');
    admin_emails := string_to_array(lower(admin_csv), ',');
    -- Strip whitespace from each entry for paste-friendliness.
    SELECT array_agg(trim(e)) INTO admin_emails
      FROM unnest(admin_emails) AS e
      WHERE trim(e) <> '';

    IF caller_email = '' OR NOT (caller_email = ANY(admin_emails)) THEN
      RAISE EXCEPTION 'admin_set_user_tier: caller not authorized';
    END IF;
  END IF;

  -- Find the target user. auth.users is in the auth schema and accessible
  -- to SECURITY DEFINER functions owned by postgres.
  SELECT id INTO target_id
    FROM auth.users
   WHERE lower(email) = lower(p_email)
   LIMIT 1;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'no user with email %', p_email;
  END IF;

  UPDATE public.profiles
     SET subscription_tier = p_tier,
         updated_at = NOW()
   WHERE id = target_id;

  -- Return the updated row so the caller can confirm.
  RETURN QUERY
    SELECT p.id, u.email::TEXT, p.subscription_tier
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE p.id = target_id;
END;
$$;

-- Lock execution down to the postgres / service_role / authenticated roles.
-- Anon callers must not be able to call this RPC at all.
REVOKE ALL ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_user_tier(TEXT, TEXT) IS
  'Admin-only RPC for changing a user''s subscription_tier without disabling profiles_protect_tier. Caller must be session_user=postgres/supabase_admin OR authenticated with email in app.admin_emails setting.';
