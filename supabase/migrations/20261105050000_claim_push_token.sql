-- A device's push token moves to whoever is signed in on it.
--
-- push_tokens is UNIQUE (expo_push_token) since 20260517000000, and the client
-- upserts onConflict 'expo_push_token' expecting the row to be reassigned when
-- user B signs in on a device user A used. It never was: the UPDATE policy's
-- USING clause is auth.uid() = user_id, so B cannot touch A's row, the upsert
-- fails (silently, in a __DEV__-only warning), and pushes for B's activity keep
-- going to A — or nowhere.
--
-- Rather than loosen the table policy, the reassignment goes through one
-- SECURITY DEFINER function that can only ever write the CALLER's id: it
-- cannot assign a token to anyone else, and only a holder of the token (the
-- device that minted it) can present it.
--
-- Reversible: DROP FUNCTION IF EXISTS public.claim_push_token(text, text);

CREATE OR REPLACE FUNCTION public.claim_push_token(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' THEN
    RAISE EXCEPTION 'invalid push token' USING ERRCODE = '22023';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid platform' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_tokens (user_id, expo_push_token, platform, last_seen_at)
  VALUES (uid, p_token, p_platform, now())
  ON CONFLICT (expo_push_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = EXCLUDED.last_seen_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_token(text, text) TO authenticated;
