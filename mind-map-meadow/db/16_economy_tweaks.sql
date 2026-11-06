-- Local day of the last paid savings milestone (at most one a day) and of the
-- last habit that built a home (first habit of the day; the rest follow their category).
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS savings_paid_on DATE;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS habit_built_on DATE;
