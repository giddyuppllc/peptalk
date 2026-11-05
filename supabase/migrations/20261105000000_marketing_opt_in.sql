-- Email-marketing consent, captured at sign-up (2026-11-05).
--
-- PepTalk had no record of anyone agreeing to marketing email, so its users
-- could not be mailed offers (PepTalk's own, or Science Based Body's) without
-- assuming consent nobody gave. Sign-up now has an UNCHECKED opt-in; the app
-- passes the answer in the auth sign-up metadata and handle_new_user copies it
-- here, which also covers the email-confirmation flow where the client has no
-- session yet. Existing users stay false: no one is opted in by this migration.
--
-- Reversible:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS marketing_opt_in,
--     DROP COLUMN IF EXISTS marketing_opt_in_at, DROP COLUMN IF EXISTS marketing_opt_in_source;
--   and re-run the previous handle_new_user (20260420000000_initial_schema.sql).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT;

COMMENT ON COLUMN public.profiles.marketing_opt_in IS
  'User ticked "email me offers and news from PepTalk and Science Based Body". Default false.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  opted BOOLEAN := COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false);
BEGIN
  INSERT INTO public.profiles (
    id, email, name, first_name, last_name,
    marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    opted,
    CASE WHEN opted THEN NOW() END,
    CASE WHEN opted THEN LEFT(COALESCE(NEW.raw_user_meta_data->>'marketing_opt_in_source', 'signup'), 40) END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
