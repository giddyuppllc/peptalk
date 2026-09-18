-- A new account starts with seven days of Pro.
--
-- Edward, 2026-09-18: "can new users ... have ... a free trail week of pro? and
-- then the free acc has none of the ai features otherwise -- that makes most
-- sense to me."
--
-- WHY IT IS A SUBSCRIPTIONS ROW AND NOT A FLAG
-- `subscriptions` is already the server's source of truth for entitlement
-- (_shared/effectiveTier.ts), and grants already live there:
-- `beta_tester_grant` and `goodwill_grant_2026_08` are the same shape. A second
-- mechanism would be a second answer to "what tier is this user", which is the
-- failure this branch has spent its time removing everywhere else.
--
-- renews = FALSE, which is the whole reason that column exists. The resolver
-- honours a 3-day grace past `expires_at` to absorb renewal-webhook lag; a
-- trial has no renewal, and without the flag a seven-day trial entitles for
-- ten. See 20260918120000_subscriptions_renews.sql.
--
-- platform = 'web' because `subscriptions_platform_check` permits only
-- ios / android / web. It is not where the trial came from — there is nowhere
-- honest to put that today — and both existing grants already use 'web'.
--
-- ONE TRIAL PER USER, enforced by the database rather than by this function
-- remembering: UNIQUE (user_id, product_id) means the ON CONFLICT below can
-- never grant a second `launch_trial_pro_7d` to the same user id. A deleted and
-- re-registered account is a NEW user id and would get another; policing that
-- needs a record of former emails, which does not exist and is not invented
-- here.
--
-- THE TRIAL MUST NEVER BLOCK A SIGNUP
-- This trigger runs AFTER INSERT ON auth.users, inside the same transaction as
-- the account itself. An unhandled error here does not fail the trial — it
-- fails the registration, for everybody, until someone notices. So the grant is
-- wrapped: if it cannot be written, the account is still created and a warning
-- is raised. A user with no trial can be granted one later; a user who could
-- not sign up is gone.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- Empty search_path: every object below is schema-qualified, so nothing
-- resolves through a caller-controlled path. The previous definition of this
-- function was SECURITY DEFINER with no search_path set.
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, product_id, tier, platform, expires_at, is_active, renews
    )
    VALUES (
      NEW.id,
      'launch_trial_pro_7d',
      'pro',
      'web',
      NOW() + INTERVAL '7 days',
      TRUE,
      FALSE
    )
    ON CONFLICT (user_id, product_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Deliberately swallowed. See the header: a failed grant must not cost the
    -- user their account. RAISE WARNING reaches the Postgres log without
    -- touching the transaction.
    RAISE WARNING 'launch trial not granted for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Unchanged, and restated so the trigger is provably still attached to the
-- function above rather than to whatever was there before.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the profile row for a new account and grants the 7-day Pro launch '
  'trial. The trial grant is non-fatal: a failure warns and the account is '
  'still created.';
