-- Who comes back, and how often: one row per user, local day and kind of action, with a
-- count. Only the kind and the day are stored, never what the task or log said.
CREATE TABLE IF NOT EXISTS activity_events (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('open', 'task', 'money', 'collect', 'build', 'summon')),
    count INTEGER NOT NULL DEFAULT 1,
    first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, day, kind)
);
CREATE INDEX IF NOT EXISTS idx_activity_events_day ON activity_events (day);

-- Back-fill what the existing data can prove: completed tasks and money logs.
INSERT INTO activity_events (user_id, day, kind, count, first_at, last_at)
SELECT user_id, (completed_at AT TIME ZONE 'UTC' AT TIME ZONE CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = u.timezone) THEN u.timezone ELSE 'UTC' END)::date, 'task', COUNT(*), MIN(completed_at), MAX(completed_at)
FROM tasks t JOIN users u ON u.id = t.user_id
WHERE t.status = 'completed' AND t.completed_at IS NOT NULL
GROUP BY 1, 2
ON CONFLICT DO NOTHING;
INSERT INTO activity_events (user_id, day, kind, count, first_at, last_at)
SELECT user_id, logged_on, 'money', COUNT(*), MIN(created_at), MAX(created_at)
FROM transactions WHERE logged_on IS NOT NULL AND user_id IS NOT NULL
GROUP BY 1, 2
ON CONFLICT DO NOTHING;
