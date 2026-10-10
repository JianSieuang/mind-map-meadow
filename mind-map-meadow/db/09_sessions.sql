-- Session store for connect-pg-simple (login sessions), schema fixed by that
-- library — created explicitly here rather than via its createTableIfMissing
-- option, so the DB schema stays fully migration-driven like the rest of db/.
CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
