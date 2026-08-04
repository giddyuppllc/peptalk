-- Allow 'web' (Square PWA checkout) subscriptions alongside ios/android IAP.
--
-- The subscriptions + subscription_events tables constrain `platform` to
-- ('ios','android'). Square web checkout records rows with platform = 'web'.
-- Native IAP is unaffected — this only widens the allowed set.
--
-- Robust against the auto-generated constraint name: find whatever CHECK
-- constraint references `platform` on each table, drop it, re-add with 'web'.

DO $$
DECLARE cname text;
BEGIN
  -- subscriptions.platform (may not have a CHECK; no-op if absent)
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.subscriptions'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%platform%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', cname);
  END IF;
  BEGIN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_platform_check
      CHECK (platform IN ('ios','android','web'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.subscription_events'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%platform%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscription_events DROP CONSTRAINT %I', cname);
  END IF;
  BEGIN
    ALTER TABLE public.subscription_events
      ADD CONSTRAINT subscription_events_platform_check
      CHECK (platform IN ('ios','android','web'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
