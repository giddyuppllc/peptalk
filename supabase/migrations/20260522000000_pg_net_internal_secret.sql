-- Wave 76 audit: 4 fanout edge functions (community-push-fanout,
-- community-moderate-image, community-live-broadcast, crm-event-fanout)
-- now require an x-internal-key header matching INTERNAL_FUNCTION_SECRET.
-- Without it they 401-reject the request before any work happens.
--
-- pg_net triggers in our DB are the legitimate callers, so each of the
-- 5 trigger functions below is updated to inject the header. The secret
-- is read from Supabase Vault under name 'app_internal_function_secret'
-- to match the existing app_supabase_url / app_service_role_key pattern
-- from migration 20260513000000.
--
-- Operator setup (one-time, run in SQL Editor on this DB AFTER
-- generating the secret via `openssl rand -hex 32`):
--   SELECT vault.create_secret(
--     '<64-char hex string — same value as supabase secrets set INTERNAL_FUNCTION_SECRET>',
--     'app_internal_function_secret'
--   );
--
-- If the vault entry is missing, triggers fall through with the empty
-- header — the edge functions will 401 and the fanout drops silently
-- (matching their existing fail-open semantics for missing settings).

-- ─── Push fanout (community_notifications insert) ───────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  internal_secret TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets
    WHERE name = 'app_internal_function_secret' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/community-push-fanout';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-internal-key', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object('notificationId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_push_fanout failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─── Image moderation fanout (community_posts / community_comments) ─────
CREATE OR REPLACE FUNCTION public.notify_image_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  internal_secret TEXT;
BEGIN
  IF NEW.image_urls IS NULL OR array_length(NEW.image_urls, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets
    WHERE name = 'app_internal_function_secret' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    NEW.moderation_status := 'approved';
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/community-moderate-image';

  IF TG_TABLE_NAME = 'community_posts' THEN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key,
        'x-internal-key', COALESCE(internal_secret, '')
      ),
      body := jsonb_build_object(
        'targetType', 'post',
        'targetId', NEW.id::text,
        'imageUrls', to_jsonb(NEW.image_urls)
      )
    );
  ELSE
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key,
        'x-internal-key', COALESCE(internal_secret, '')
      ),
      body := jsonb_build_object(
        'targetType', 'comment',
        'targetId', NEW.id::text,
        'imageUrls', to_jsonb(NEW.image_urls)
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_image_moderation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─── CRM subscription-events fanout (subscription_events insert) ───────
CREATE OR REPLACE FUNCTION public.notify_crm_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  internal_secret TEXT;
  event_kind TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets
    WHERE name = 'app_internal_function_secret' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/crm-event-fanout';

  event_kind := CASE NEW.event_type
    WHEN 'initial_purchase' THEN 'subscription.activated'
    WHEN 'renewal'          THEN 'subscription.renewed'
    WHEN 'cancellation'     THEN 'subscription.cancelled'
    WHEN 'expiration'       THEN 'subscription.expired'
    WHEN 'refund'           THEN 'subscription.refunded'
    WHEN 'revoked'          THEN 'subscription.revoked'
    WHEN 'upgraded'         THEN 'subscription.upgraded'
    WHEN 'downgraded'       THEN 'subscription.downgraded'
    ELSE 'subscription.' || NEW.event_type
  END;

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-internal-key', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object(
      'eventKind', event_kind,
      'subscriptionEventId', NEW.id::text
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_fanout failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─── CRM referral-redemption fanout (referral_redemptions insert) ──────
CREATE OR REPLACE FUNCTION public.notify_crm_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  internal_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets
    WHERE name = 'app_internal_function_secret' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/crm-event-fanout';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-internal-key', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object(
      'eventKind', 'referral.redeemed',
      'redemptionId', NEW.id::text
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_redemption failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─── Live-event broadcast fanout (community_live_events status flip) ───
CREATE OR REPLACE FUNCTION public.notify_live_event_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  internal_secret TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status <> 'live') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.status = 'live') THEN
    RETURN NEW;
  END IF;
  IF (NEW.status <> 'live') THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets
    WHERE name = 'app_internal_function_secret' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/community-live-broadcast';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-internal-key', COALESCE(internal_secret, '')
    ),
    body := jsonb_build_object('eventId', NEW.id::text)
  );

  IF NEW.started_at IS NULL THEN
    NEW.started_at := NOW();
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_live_event_broadcast failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
