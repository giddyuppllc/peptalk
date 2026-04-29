-- subscription_events: allow null user_id for reconciliation
--
-- The original migration's design intent (see its block comment) explicitly
-- says we want to log webhook events even when we can't identify the user
-- yet — e.g. an Apple renewal notification arriving before the client has
-- run validate-purchase, or a Google RTDN with a purchaseToken that doesn't
-- match any subscriptions row. The NOT NULL constraint contradicted that
-- and would have caused both webhook handlers to throw on those events.
--
-- Trade-off: orphan rows accumulate. Acceptable because (a) they're rare,
-- (b) the audit log is the *purpose* of this table, (c) ops can backfill
-- user_id when validate-purchase eventually runs.

ALTER TABLE public.subscription_events
  ALTER COLUMN user_id DROP NOT NULL;

-- The original FK ON DELETE CASCADE still applies; null is just allowed.
