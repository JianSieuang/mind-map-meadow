-- Each user's IANA timezone (e.g. 'Asia/Kuala_Lumpur'), reported by their browser on
-- connect. Used to decide what "today" means for daily habits and on-time rewards.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';
