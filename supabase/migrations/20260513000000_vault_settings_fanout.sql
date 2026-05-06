-- Wave 61: switch trigger fan-out functions from app.settings.*
--          → Supabase Vault decrypted secrets.
--
-- Why: ALTER DATABASE postgres SET app.settings.* is not permitted on
-- Supabase managed instances (postgres role lacks the privilege). Vault
-- is the official Supabase pattern for secrets pg_net triggers need.
--
-- Operator setup (one-time, run in SQL Editor):
--   SELECT vault.create_secret(
--     'https://zniucpbeepxysvkshpir.supabase.co',
--     'app_supabase_url'
--   );
--   SELECT vault.create_secret(
--     '<service-role-key from Settings → API>',
--     'app_service_role_key'
--   );
--
-- Read pattern in each trigger:
--   SELECT decrypted_secret INTO ... FROM vault.decrypted_secrets WHERE name = '...';
--
-- The vault extension is enabled by default on Supabase projects;
-- decrypted_secrets is a SECURITY DEFINER view available to the postgres
-- role.

-- ─── Push fanout ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;  -- Fail-open: insert succeeds, fanout skipped.
  END IF;

  fn_url := base_url || '/functions/v1/community-push-fanout';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('notificationId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_push_fanout failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─── Image moderation fanout ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_image_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
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

  IF base_url IS NULL OR service_key IS NULL THEN
    -- Fail-open: auto-approve so the post still renders.
    NEW.moderation_status := 'approved';
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/community-moderate-image';

  IF TG_TABLE_NAME = 'community_posts' THEN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
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
        'Authorization', 'Bearer ' || service_key
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

-- ─── CRM subscription-events fanout ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_crm_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
  event_kind TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;

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
      'Authorization', 'Bearer ' || service_key
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

-- ─── CRM referral-redemption fanout ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_crm_redemption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  fn_url := base_url || '/functions/v1/crm-event-fanout';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
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
