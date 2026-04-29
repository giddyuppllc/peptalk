-- Cross-user IAP dedup
--
-- Adds the column the validate-purchase edge function persists, and a
-- partial unique index so the same Apple original_transaction_id (or
-- Google base orderId) cannot be bound to two different user_ids
-- simultaneously. The index is partial (WHERE original_transaction_id IS
-- NOT NULL) so legacy rows with NULL don't all collide on each other.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS original_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_original_transaction_id_unique
  ON subscriptions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

-- Index for the dedup lookup the edge function performs on every purchase.
-- Partial again so it stays small.
CREATE INDEX IF NOT EXISTS subscriptions_txn_lookup_idx
  ON subscriptions (original_transaction_id, user_id)
  WHERE original_transaction_id IS NOT NULL;
