-- Distinguish a subscription that RENEWS from a grant that simply ends.
--
-- WHY
-- resolveEffectiveTier honours a 3-day GRACE window past `expires_at`
-- (_shared/effectiveTier.ts:74). That exists for one reason: at an
-- auto-renewal boundary the row keeps is_active=true while its stored
-- expires_at is still the OLD period end, until DID_RENEW / RTDN lands. A
-- strict `expires_at > now` test would downgrade every renewing payer during
-- that gap.
--
-- A grant does not renew, so it has no webhook lag to absorb — and grace
-- silently extends it. A 7-day trial written as expires_at = now + 7 days
-- would grant Pro for TEN. That is not a rounding error on a trial whose whole
-- length is seven.
--
-- The alternatives were worse. Writing expires_at = now + 4 days to land on
-- seven hides the real date from anyone reading the row. A hardcoded list of
-- non-renewing product_ids in the resolver drifts the moment somebody adds a
-- grant type and does not know the list exists.
--
-- DEFAULT TRUE, deliberately: every existing row is a real IAP or Square
-- subscription that does renew, so the default preserves today's behaviour
-- exactly. Nothing is migrated, nothing changes, until a writer opts out.
--
-- Additive only. No data is read, written or moved.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS renews BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.subscriptions.renews IS
  'FALSE for one-off grants (trials, beta, goodwill) that end on expires_at '
  'with no renewal. The effective-tier resolver skips its renewal-lag grace '
  'window for these, so a 7-day grant is 7 days and not 7 plus grace.';

-- The existing grants are exactly the rows this describes. Named explicitly
-- rather than matched on a pattern, so a future product_id cannot be swept in
-- by accident.
--
-- Both carry far-future expiries (2027-12-31 and 2026-09-27), so this changes
-- nothing about what either user can do today — it makes the row honest about
-- what it is, and means the two are not left as the only grants in the table
-- still claiming to renew.
UPDATE public.subscriptions
   SET renews = FALSE
 WHERE product_id IN ('beta_tester_grant', 'goodwill_grant_2026_08');
