-- Fix: admin_set_user_tier only wrote profiles.subscription_tier, leaving
-- is_pro=false and NO subscriptions row. Because the client subscription
-- store treats the `subscriptions` table as authoritative on boot, an
-- admin/reviewer-granted user got silently reset to FREE on every launch
-- (the root cause of "workout videos never worked" + the App Review
-- reviewer account reading as not-subscribed). This makes the RPC write
-- all sources atomically + seed an authoritative subscriptions row.

CREATE OR REPLACE FUNCTION public.admin_set_user_tier(p_email text, p_tier text)
 RETURNS TABLE(out_user_id uuid, out_email text, out_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Profile mirror: keep subscription_tier and is_pro in lockstep.
  UPDATE public.profiles
     SET subscription_tier = p_tier,
         is_pro = (p_tier = 'pro'),
         updated_at = NOW()
   WHERE id = target_id;

  -- Authoritative subscriptions row: the client store's boot sync reads
  -- this table; without a row it falls through to the "reset to free" path.
  IF p_tier = 'free' THEN
    UPDATE public.subscriptions SET is_active = false WHERE user_id = target_id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, product_id, tier, platform, is_active, expires_at, last_validated_at)
    VALUES
      (target_id, 'admin_grant', p_tier, 'ios', true, NOW() + INTERVAL '10 years', NOW())
    ON CONFLICT (user_id, product_id)
    DO UPDATE SET tier = EXCLUDED.tier,
                  is_active = true,
                  expires_at = EXCLUDED.expires_at,
                  last_validated_at = NOW();
  END IF;

  RETURN QUERY
    SELECT p.id, u.email::TEXT, p.subscription_tier
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE p.id = target_id;
END;
$function$;
