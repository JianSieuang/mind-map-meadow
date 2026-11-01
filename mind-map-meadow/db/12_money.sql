-- Savings goals: each one is shown in the meadow as a construction project
-- (buildings.asset_key = 'savings_project') that upgrades through stages 0..4
-- as the user saves toward target_cents. stage never decreases.
CREATE TABLE IF NOT EXISTS savings_goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL,
    target_cents INTEGER NOT NULL CHECK (target_cents > 0),
    deadline DATE,
    stage SMALLINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals (user_id);

-- Money log. Amounts are integer cents. occurred_on is when the money moved;
-- logged_on is the user's local day it was entered (drives the daily reward cap).
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('expense', 'income', 'saving')),
    category VARCHAR(30) NOT NULL,
    note VARCHAR(140),
    occurred_on DATE NOT NULL,
    logged_on DATE NOT NULL,
    reward_coins INTEGER NOT NULL DEFAULT 0,
    savings_goal_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred ON transactions (user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_transactions_savings_goal ON transactions (savings_goal_id);
