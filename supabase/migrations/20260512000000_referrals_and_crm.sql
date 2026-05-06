-- Wave 57: referral codes + CRM event fanout
--
-- Three concerns wired together:
--
--   1. referral_codes — codes Edward (or his sales agents) generate in
--      his external CRM. He copies code+agent metadata into this table
--      via the supabase dashboard or a future admin endpoint.
--
--   2. referral_redemptions — when a user types a code at signup, we
--      record (code_id, user_id, applied_at). One redemption per user
--      lifetime. Used for sale attribution + first-month discount UI.
--
--   3. crm_webhook_endpoints — outbound webhook URLs Edward configures
--      so subscription / redemption events flow back to his CRM. HMAC
--      signature on every request so the CRM can verify authenticity.
--
-- The actual discount delivery (free / reduced first month) uses Apple
-- App Store Connect Offer Codes in production. This DB layer purely
-- handles attribution + analytics so Edward can answer "how much did
-- agent X drive?" without a separate datastore.

-- ─── referral_codes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Uppercased + alphanumeric only, 4-12 chars (validated app-side). */
  code TEXT NOT NULL UNIQUE,
  /** Agent's external CRM id — opaque to PepTalk, just a passthrough. */
  agent_id TEXT NOT NULL,
  agent_email TEXT,
  agent_name TEXT,
  /** Discount % applied to first month, 0-100. UI display only — actual
   *  discount comes via Apple Offer Codes set up in App Store Connect. */
  discount_percent INT NOT NULL DEFAULT 0
    CHECK (discount_percent BETWEEN 0 AND 100),
  /** Apple Offer Code that pairs with this referral code. When the user
   *  upgrades to Pro/Plus, the client passes this to StoreKit so Apple
   *  applies the discount. Optional — codes can exist for attribution
   *  without a price discount. */
  apple_offer_code TEXT,
  /** Hard cap on lifetime uses. NULL = unlimited. */
  max_uses INT,
  /** Number of redemptions so far. Maintained by trigger below. */
  uses_count INT NOT NULL DEFAULT 0,
  /** Optional expiry. NULL = never expires. */
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_active
  ON public.referral_codes (is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_referral_codes_agent
  ON public.referral_codes (agent_id, created_at DESC);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read active codes (so the redemption flow can
-- validate without exposing the agent's identity to clients via SELECT
-- from the table directly — that's done via RPC instead). For safety
-- we don't grant SELECT here; the redemption edge function uses service
-- role to look up codes.
-- (No SELECT policy = locked down to service role only.)

-- ─── referral_redemptions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** State machine for CRM attribution:
   *    pending     — redemption created, no purchase yet
   *    attributed  — user converted to a paid tier
   *    expired     — never converted before code expiry
   */
  attribution_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (attribution_state IN ('pending', 'attributed', 'expired')),
  attributed_at TIMESTAMPTZ,
  /** Apple/Google product id of the eventual purchase. */
  attributed_product_id TEXT,
  /** Server-side attribution amount in cents (USD). */
  attributed_amount_cents INT,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code
  ON public.referral_redemptions (code_id, attribution_state);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_user
  ON public.referral_redemptions (user_id);

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own redemption (so the UI can show "Code X
-- applied · 20% off first month").
CREATE POLICY referral_redemptions_self_read
  ON public.referral_redemptions FOR SELECT
  USING (auth.uid() = user_id);
-- Inserts/updates done only by the redeem-referral-code edge function.

-- Trigger: when a redemption inserts, bump the parent code's uses_count.
CREATE OR REPLACE FUNCTION public.bump_referral_uses()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.referral_codes
    SET uses_count = uses_count + 1
    WHERE id = NEW.code_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS referral_redemptions_bump
  ON public.referral_redemptions;
CREATE TRIGGER referral_redemptions_bump
  AFTER INSERT ON public.referral_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.bump_referral_uses();

-- ─── crm_webhook_endpoints ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Friendly label so Edward can recognize his endpoints. */
  label TEXT NOT NULL,
  /** Outbound URL we POST to. HTTPS only enforced in the edge function. */
  url TEXT NOT NULL,
  /** Shared secret used to compute the X-PepTalk-Signature HMAC-SHA256
   *  the receiving CRM should verify. */
  secret TEXT NOT NULL,
  /** Which event types fan out here. NULL or empty = all.
   *  Known types: 'referral.redeemed', 'referral.attributed',
   *               'subscription.activated', 'subscription.renewed',
   *               'subscription.cancelled', 'subscription.refunded' */
  event_types TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_webhook_endpoints ENABLE ROW LEVEL SECURITY;
-- Locked to service role only — admin tooling reads/writes via the
-- supabase dashboard; clients never see endpoints.

-- ─── Trigger: fan subscription_events out to CRM ─────────────────────────
-- Reuses the same pg_net + Postgres-settings pattern as push fanout.
CREATE OR REPLACE FUNCTION public.notify_crm_fanout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  event_kind TEXT;
BEGIN
  fn_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/crm-event-fanout';
  service_key := current_setting('app.settings.service_role_key', true);
  IF fn_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map subscription_events.event_type → CRM event kind.
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

DROP TRIGGER IF EXISTS subscription_events_crm_fanout
  ON public.subscription_events;
CREATE TRIGGER subscription_events_crm_fanout
  AFTER INSERT ON public.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.notify_crm_fanout();

-- Trigger on referral redemption inserts (covers 'referral.redeemed' event)
CREATE OR REPLACE FUNCTION public.notify_crm_redemption()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
BEGIN
  fn_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/crm-event-fanout';
  service_key := current_setting('app.settings.service_role_key', true);
  IF fn_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;
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

DROP TRIGGER IF EXISTS referral_redemptions_crm_fanout
  ON public.referral_redemptions;
CREATE TRIGGER referral_redemptions_crm_fanout
  AFTER INSERT ON public.referral_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_crm_redemption();
