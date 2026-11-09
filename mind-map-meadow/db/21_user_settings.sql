-- Per-account preferences that follow you between devices (keyboard shortcuts first).
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
