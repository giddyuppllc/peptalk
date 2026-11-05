-- Re-sync profiles.subscription_tier / is_pro / is_plus to the subscriptions rows.
--
-- square-webhook never updated the mirror, so web subscriptions that ended left
-- profiles saying 'plus' (6 in production on 2026-11-05). Same rule as
-- _shared/effectiveTier.ts: the highest tier among is_active rows whose
-- expires_at is within the 3-day renewal grace; else 'free'.
-- Beta testers (BETA_TESTER_EMAILS) have no row and are not touched here only
-- if they already read 'pro' with a live grant — review the preview first.
--
-- NOT RUN. Preview, then apply:
--   supabase db query --linked -f scripts/sql/2026-11-05-resync-profile-tier-mirror.sql
-- Reversible from the preview output (old values are listed).

WITH live AS (
  SELECT user_id,
         CASE MAX(CASE tier WHEN 'pro' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END)
           WHEN 2 THEN 'pro' WHEN 1 THEN 'plus' ELSE 'free' END AS tier
    FROM public.subscriptions
   WHERE is_active AND expires_at > now() - interval '3 days'
   GROUP BY user_id
),
want AS (
  SELECT p.id, p.subscription_tier AS old_tier, p.is_pro AS old_is_pro, p.is_plus AS old_is_plus,
         COALESCE(l.tier, 'free') AS new_tier
    FROM public.profiles p
    LEFT JOIN live l ON l.user_id = p.id
)
-- 1) Preview: every profile that would change.
SELECT id, old_tier, old_is_pro, old_is_plus, new_tier
  FROM want
 WHERE old_tier IS DISTINCT FROM new_tier
    OR old_is_pro IS DISTINCT FROM (new_tier = 'pro')
    OR old_is_plus IS DISTINCT FROM (new_tier = 'plus');

-- 2) Apply (uncomment after reviewing the preview):
-- WITH live AS (... same as above ...), want AS (... same as above ...)
-- UPDATE public.profiles p
--    SET subscription_tier = w.new_tier, is_pro = (w.new_tier = 'pro'), is_plus = (w.new_tier = 'plus')
--   FROM want w
--  WHERE p.id = w.id
--    AND (w.old_tier IS DISTINCT FROM w.new_tier
--         OR w.old_is_pro IS DISTINCT FROM (w.new_tier = 'pro')
--         OR w.old_is_plus IS DISTINCT FROM (w.new_tier = 'plus'));
