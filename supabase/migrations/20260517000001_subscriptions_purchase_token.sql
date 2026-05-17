-- Google RTDN purchaseToken collision fix (2026-05-17 round-5 IAP audit P1 #5).
--
-- Before: validate-purchase wrote `body.receipt.substring(0, 500)` into
-- `subscriptions.receipt_data`. google-rtdn looked up users by
-- `.eq('receipt_data', purchaseToken.substring(0, 500))`. Two
-- vulnerabilities:
--   1. Truncated lookup risks collisions across refunds/regrants where
--      different purchaseTokens share the first 500 chars (unlikely but
--      possible — Play tokens are not domain-prefixed).
--   2. `receipt_data` mixes Apple base64 receipts with Google
--      purchaseTokens, making the column polymorphic and hard to index
--      for lookups.
--
-- After: dedicated `purchase_token` column for Android lookups, indexed
-- for fast equality. Apple keeps writing `receipt_data` (full Base64
-- transactionReceipt) — that column is no longer the lookup key.
--
-- Backfill: copy the existing `receipt_data` value into `purchase_token`
-- for Android rows so google-rtdn keeps working during the cutover.
-- (Apple rows have base64 transactionReceipts in receipt_data — leave
-- those alone, they wouldn't match a purchaseToken anyway.)

BEGIN;

-- 1. Add the dedicated column.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS purchase_token TEXT;

-- 2. Backfill from existing Android rows.
UPDATE public.subscriptions
SET    purchase_token = receipt_data
WHERE  platform = 'android'
  AND  receipt_data IS NOT NULL
  AND  purchase_token IS NULL;

-- 3. Index for the google-rtdn lookup. UNIQUE catches the rare
--    collision case where two users somehow share a purchase token
--    (Play normally rotates them; an attempted second user upsert
--    becomes a constraint violation rather than a silent miswrite).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_purchase_token_uidx
  ON public.subscriptions (purchase_token)
  WHERE purchase_token IS NOT NULL;

COMMIT;
