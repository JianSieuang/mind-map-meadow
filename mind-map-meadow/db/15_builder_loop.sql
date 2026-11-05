-- Builder Loop v1 (docs/BUILDER_LOOP_CONTRACT.md §3, §5.12, §5.13).
-- Idempotent: every statement is guarded, and nothing is deleted. runMigrations sends this
-- file as one multi-statement query, so Postgres applies all of it or none of it.

-- ---------------------------------------------------------------------------
-- player_stats
-- ---------------------------------------------------------------------------
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS town_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS zone_step SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;          -- last task completion / money log
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS counters_day DATE;                   -- user-local day the counters below belong to
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tasks_paid_today SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS buildings_today SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pool_released_on DATE;               -- last local day a catch-up release happened
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS legacy_level INTEGER;                -- old player level at migration (audit)
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS builder_migrated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pending_summons SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS summons_since_epic SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS early_bird_on DATE;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tutorial_step SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tutorial_done BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- buildings
-- ---------------------------------------------------------------------------
ALTER TABLE buildings ALTER COLUMN x DROP NOT NULL;     -- inventory/pooled/merged rows have no position
ALTER TABLE buildings ALTER COLUMN y DROP NOT NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS kind VARCHAR(12);          -- 'line' | 'decoration' | 'savings' | 'legacy'
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS line VARCHAR(10);          -- fitness|coding|finance|habit (kind='line' only)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS level SMALLINT;            -- 1..3 (kind='line' only)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS state VARCHAR(10) NOT NULL DEFAULT 'placed'; -- pooled|inventory|placed|merged
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS tile_x SMALLINT;           -- top-left tile of the footprint
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS tile_y SMALLINT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS footprint SMALLINT NOT NULL DEFAULT 1; -- 1 or 2 (square)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS heritage BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS staff_mode VARCHAR(8) NOT NULL DEFAULT 'auto'; -- auto|priority|off
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS staffed BOOLEAN NOT NULL DEFAULT false;        -- written only by reassignWorkers()
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS stored_milli INTEGER NOT NULL DEFAULT 0;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS source VARCHAR(12);        -- task|money_log|merge|purchase|heritage|savings
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS source_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS generated_on DATE;         -- local day it was generated (or pooled)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS released_on DATE;          -- local day a pooled row became inventory
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS merged_into INTEGER REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS worker_id INTEGER;         -- written only by reassignWorkers(); NULL + staffed = generic Villager
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS speed_bp INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS cap_bp INTEGER NOT NULL DEFAULT 10000;

-- ---------------------------------------------------------------------------
-- workers: one row per opened summon. Rarity, skill and ability come from
-- WORKER_CATALOG by worker_key and are never stored per row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_key VARCHAR(30) NOT NULL,
    assigned_building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers (user_id);

-- ---------------------------------------------------------------------------
-- Heritage and grandfather backfill
-- ---------------------------------------------------------------------------
-- The original asset_key is preserved before any rewrite.
UPDATE buildings SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('legacy_asset_key', asset_key)
 WHERE kind IS NULL AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'legacy_asset_key');

UPDATE buildings SET kind = 'line', line = 'habit',   level = 1, asset_key = 'habit_1',   footprint = 2, heritage = true, source = 'heritage' WHERE kind IS NULL AND asset_key = 'house';
UPDATE buildings SET kind = 'line', line = 'finance', level = 2, asset_key = 'finance_2', footprint = 2, heritage = true, source = 'heritage' WHERE kind IS NULL AND asset_key = 'supermarket';
UPDATE buildings SET kind = 'decoration', footprint = 1, heritage = true, source = 'heritage' WHERE kind IS NULL AND asset_key IN ('cozy_bench', 'garden_fountain');
UPDATE buildings SET kind = 'savings',    footprint = 2, source = 'savings'                   WHERE kind IS NULL AND asset_key = 'savings_project';
UPDATE buildings SET kind = 'legacy',     footprint = 1, heritage = true, source = 'heritage' WHERE kind IS NULL;   -- anything unknown: render only

-- Old x,y were pixel centres of a 1x1 tile (gx*48+24). Anchor the footprint's top-left there, clamped to the map.
UPDATE buildings SET tile_x = LEAST(GREATEST(FLOOR(x / 48)::int, 0), 70 - footprint),
                     tile_y = LEAST(GREATEST(FLOOR(y / 48)::int, 0), 50 - footprint),
                     state = 'placed', accrued_at = NOW()
 WHERE tile_x IS NULL AND state = 'placed' AND x IS NOT NULL;

-- Old level -> starting town level (capped at 8), plus one pending summon per town level
-- above 1. townLevel(5*(L-1)*L) = L, so that's L - 1. Runs once per stats row.
UPDATE player_stats
   SET legacy_level = level,
       town_xp = GREATEST(town_xp, 5 * (LEAST(GREATEST(COALESCE(level, 1), 1), 8) - 1) * LEAST(GREATEST(COALESCE(level, 1), 1), 8)),
       pending_summons = LEAST(GREATEST(COALESCE(level, 1), 1), 8) - 1,
       last_active_at = COALESCE(last_active_at, NOW()),
       builder_migrated = true
 WHERE builder_migrated = false;

-- Rows created from now on (by any inserter) are already on the new system. If one were
-- left at false, a later boot would run the grandfather update over a live town.
ALTER TABLE player_stats ALTER COLUMN builder_migrated SET DEFAULT true;
ALTER TABLE player_stats ALTER COLUMN last_active_at SET DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- Constraints (after the backfill)
-- ---------------------------------------------------------------------------
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_stats_town_xp') THEN
    ALTER TABLE player_stats ADD CONSTRAINT chk_player_stats_town_xp CHECK (town_xp >= 0);
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_stats_zone_step') THEN
    ALTER TABLE player_stats ADD CONSTRAINT chk_player_stats_zone_step CHECK (zone_step BETWEEN 0 AND 7);
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_stats_coins') THEN
    ALTER TABLE player_stats ADD CONSTRAINT chk_player_stats_coins CHECK (coins >= 0);
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_stats_pending_summons') THEN
    ALTER TABLE player_stats ADD CONSTRAINT chk_player_stats_pending_summons CHECK (pending_summons >= 0);
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_state') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_state CHECK (state IN ('pooled', 'inventory', 'placed', 'merged'));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_kind') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_kind CHECK (kind IN ('line', 'decoration', 'savings', 'legacy'));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_line') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_line CHECK (
        (kind = 'line') = (line IS NOT NULL AND level IS NOT NULL)
        AND line IN ('fitness', 'coding', 'finance', 'habit')
        AND level BETWEEN 1 AND 3
    );
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_placed_has_tile') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_placed_has_tile CHECK ((state = 'placed') = (tile_x IS NOT NULL AND tile_y IS NOT NULL));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_staff_mode') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_staff_mode CHECK (staff_mode IN ('auto', 'priority', 'off'));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_footprint') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_footprint CHECK (footprint IN (1, 2));
END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buildings_stored') THEN
    ALTER TABLE buildings ADD CONSTRAINT chk_buildings_stored CHECK (stored_milli >= 0);
END IF; END $$;

ALTER TABLE buildings ALTER COLUMN kind SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Indexes. Overlaps are not constrained: heritage buildings may already overlap,
-- so the server enforces them in code under the stats-row lock.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_buildings_user_state ON buildings (user_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_source_task ON buildings (source_task_id) WHERE source_task_id IS NOT NULL;      -- one building per task, ever
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_daily_log_stall ON buildings (user_id, generated_on) WHERE source = 'money_log'; -- one stall per day
