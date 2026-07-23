-- User-planned recurring goals (e.g. "morning exercise every Mon/Wed/Fri").
-- A daily generation pass turns each active template into a real row in `tasks`
-- for any day it's scheduled on, so completion/rewards/history reuse the same table.
CREATE TABLE IF NOT EXISTS recurring_tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    days_of_week SMALLINT[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6], -- 0=Sunday .. 6=Saturday
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_task_id INTEGER REFERENCES recurring_tasks(id) ON DELETE SET NULL;

-- One generated instance per template per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_recurring_daily ON tasks (recurring_task_id, due_date) WHERE recurring_task_id IS NOT NULL;
