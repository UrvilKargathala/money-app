-- 010: covering + trigram indexes for Phase-2 hot paths (search branches,
-- report date predicates, notification feed, SIP/investment lists, transfer
-- joins, cron generator scans). All IF NOT EXISTS - safe to re-run.
CREATE INDEX IF NOT EXISTS idx_txn_user_created ON transactions(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_txn_user_type_date ON transactions(user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_user_merchant_created ON transactions(user_id, merchant_clean, created_at DESC) WHERE merchant_clean IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_gen ON bills(is_active, current_period_status) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_sub_renewal_global ON subscriptions(status, next_renewal_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sip_user_status_next ON sip_trackers(user_id, status, next_date);
CREATE INDEX IF NOT EXISTS idx_inv_user_active_name ON investments(user_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications(user_id, created_at DESC) WHERE is_dismissed = 0;
CREATE INDEX IF NOT EXISTS idx_notif_archive_search ON notifications USING GIN (title gin_trgm_ops, message gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm ON accounts USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bills_name_trgm ON bills USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sub_service_trgm ON subscriptions USING GIN (service_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gs_user_goal_date ON goal_snapshots(user_id, goal_id, date);
CREATE INDEX IF NOT EXISTS idx_at_from_txn ON account_transfers(from_transaction_id);
CREATE INDEX IF NOT EXISTS idx_at_to_txn ON account_transfers(to_transaction_id);
