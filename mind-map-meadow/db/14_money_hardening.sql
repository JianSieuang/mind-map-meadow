-- Money hardening (anti-farming):
--  * savings_goals.created_on: the user's local day a goal was created; drives the
--    "2 new goals per day" cap. Backfilled from created_at for existing rows.
--  * savings_goals.deleted_at / transactions.deleted_at: soft deletes, so deleted rows
--    still count toward the daily caps. All normal reads filter deleted_at IS NULL.
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS created_on DATE;
UPDATE savings_goals SET created_on = COALESCE(created_at, NOW())::date WHERE created_on IS NULL;
ALTER TABLE savings_goals ALTER COLUMN created_on SET NOT NULL;

ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_created_on ON savings_goals (user_id, created_on);
CREATE INDEX IF NOT EXISTS idx_transactions_user_logged_on ON transactions (user_id, logged_on);
