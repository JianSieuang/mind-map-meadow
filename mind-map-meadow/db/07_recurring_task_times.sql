-- Daily tasks/habits are scheduled as a clock time block (e.g. 7:00 AM - 8:00 AM)
-- rather than a generic duration amount, so the UI can display/edit the actual times.
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS start_time TIME NOT NULL DEFAULT '07:00';
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS end_time TIME NOT NULL DEFAULT '08:00';
