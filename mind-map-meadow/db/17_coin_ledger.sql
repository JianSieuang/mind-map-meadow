-- Append-only record of every coin change, for balance tuning and "where did my coins go?".
-- Reasons and numbers only: never transaction notes or other free text.
CREATE TABLE IF NOT EXISTS coin_ledger (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger (user_id, id);

INSERT INTO coin_ledger (user_id, delta, balance_after, reason)
SELECT user_id, coins, coins, 'opening_balance' FROM player_stats WHERE user_id IS NOT NULL;
