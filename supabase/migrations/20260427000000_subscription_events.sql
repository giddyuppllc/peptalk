-- ============================================================================
-- subscription_events — append-only audit log of every subscription lifecycle
-- event we learn about: initial validation, renewals, cancellations, refunds,
-- grace-period transitions, failed-payment retries, etc.
--
-- Why a separate table (rather than just fields on `subscriptions`):
--   - Preserves history: the `subscriptions` row is a rollup; this table
--     keeps the evidence trail for ops / support / legal disputes.
--   - Supports reconciliation: if a webhook fires before validate-purchase
--     (e.g. server-to-server renewal notification), we can still record
--     what happened even if there's no subscription row yet.
--   - Idempotency: notification_uuid from Apple / event_id from Google
--     let us dedupe redeliveries without complex app logic.
--
-- Writes happen from edge functions (validate-purchase, apple-notifications,
-- google-rtdn) using service_role. Reads allowed to the owning user so the
-- app can show a "payment history" screen later if we build one.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  -- Canonical event names. We translate store-specific event types into
  -- these on write so downstream queries don't have to know about Apple's
  -- NOTIFICATION_TYPE strings vs Google's subscription notification ints.
  event_type TEXT NOT NULL CHECK (event_type IN (
    'initial_purchase',
    'renewal',
    'renewal_failed',
    'grace_period_started',
    'grace_period_ended',
    'cancellation',            -- user cancelled; still entitled until expires_at
    'expiration',              -- subscription actually ended
    'refund',
    'revoked',                 -- family sharing removal, chargeback, etc.
    'upgraded',                -- tier change up (plus→pro)
    'downgraded',              -- tier change down (pro→plus at next period)
    'on_hold',                 -- payment problem, Google-specific
    'paused',                  -- user-initiated pause, Google-specific
    'unknown'                  -- always keep so we can ingest new types
  )),
  -- Store-supplied idempotency keys. Apple: notificationUUID. Google:
  -- (subscriptionNotification.purchaseToken, eventTimeMillis) combo or
  -- the RTDN messageId. Dedupe via the unique index below.
  external_event_id TEXT,
  -- Raw event body for forensics. Cap at 16KB to avoid unbounded growth
  -- on pathological inputs. Stored as JSONB so ad-hoc queries work.
  raw_payload JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (platform, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_created
  ON public.subscription_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type
  ON public.subscription_events(event_type, created_at DESC);

-- RLS: owner can read their own event history; mutations are service_role
-- only (the anon/authenticated role has no INSERT/UPDATE/DELETE policy).
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own subscription events" ON public.subscription_events;
CREATE POLICY "Read own subscription events" ON public.subscription_events
  FOR SELECT USING (auth.uid() = user_id);
