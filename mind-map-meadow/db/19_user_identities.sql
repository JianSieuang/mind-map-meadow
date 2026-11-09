-- One row per way a person signs in (Google today; Facebook, Apple ... later), all pointing at
-- the same account. users keeps the profile; this table keeps the logins.
CREATE TABLE IF NOT EXISTS user_identities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    -- A provider account belongs to exactly one user ...
    UNIQUE (provider, provider_user_id),
    -- ... and a user links at most one account per provider.
    UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities (user_id);

-- Every existing Google login becomes an identity row.
INSERT INTO user_identities (user_id, provider, provider_user_id, email)
SELECT id, 'google', google_id, email FROM users WHERE google_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- users.google_id is kept for now but no longer read; accounts made through another provider
-- won't have one, and some providers can withhold the email.
ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
