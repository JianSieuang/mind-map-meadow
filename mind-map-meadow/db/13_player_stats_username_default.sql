-- 02_player_stats.sql gave username a DEFAULT of 'chong' plus a UNIQUE constraint,
-- so every account after the first failed to get a player_stats row. Drop the default
-- (UNIQUE stays; NULL usernames don't conflict). 02's 'chong' seed row is still the
-- one the first account adopts in server/auth.js.
ALTER TABLE player_stats ALTER COLUMN username DROP DEFAULT;
