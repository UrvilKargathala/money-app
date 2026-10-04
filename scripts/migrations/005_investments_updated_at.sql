-- Staleness tracking for holdings. Safe to run repeatedly.
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
-- Backfill from each holding's latest price-history entry (falls back to now
-- when no history exists), so pre-migration rows don't all read "updated now".
UPDATE investments i
SET updated_at = COALESCE(
  (SELECT MAX(date) FROM investment_price_history h WHERE h.investment_id = i.id),
  CURRENT_TIMESTAMP
)
WHERE updated_at IS NULL;
