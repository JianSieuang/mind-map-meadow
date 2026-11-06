# Builder Loop v1 — Build Contract

Status: **draft for build** · Date: 2026-11-02 · Source of numbers: `scratchpad/builder-loop/sim_v1.js` (CFG block)
Scope: the MVP slice in `docs/PLAN.md` → Phase 2. **Not in v1:** villagers, world landmarks, decoration boosts, weekly effort tiers.

Three devs build this in parallel. The server is the single source of truth for every rule and number. It sends the numbers to the client in `builder.rules`, so the client never hardcodes a cost, rate or cap.

---

## 1. Final numbers (CFG)

| Key | Value | Notes |
|---|---|---|
| `DAILY_BUILDING_CAP` | 5 | Generated Lv1 buildings per **user-local day**: tasks plus the first money log of the day. Catch-up releases don't count toward it. |
| `TASK_COINS` / `TASK_COINS_PER_DAY` | 10 / 5 | A flat 10 coins for each of the first 5 completed tasks of the local day, and 0 after that. Replaces `minutes × 1.5` and the +20 on-time bonus. |
| `LOG_COINS` / `LOG_COINS_PER_DAY` | 5 / 3 | Lowered from the current 6/day in `moneyHandlers.js`. |
| `SAVINGS_MILESTONE_COINS` | 40 per stage | Unchanged. |
| `RATE_MILLI` (millicoins per hour, staffed producer) | Lv1 150 · Lv2 400 · Lv3 1000 | That is 0.15 / 0.4 / 1.0 coins/h. |
| `STORAGE_HOURS` | 20 | Per-building cap = `RATE_MILLI[lvl] × 20` → 3 / 8 / 20 coins. |
| `SLEEPY_AFTER_HOURS` | 72 | No completed task or money log for 72 h → production stops. Nothing is lost. |
| `MERGE_COST` | Lv1→2: 25 · Lv2→3: 150 | |
| `MERGE_TOWN_LEVEL` | Lv1→2: 1 · Lv2→3: 5 | |
| `BASE_WORKERS` | 3 | Town hall. |
| `SUMMONS_PER_TOWN_LEVEL` | 1 | Each town level gained grants one **mystery summon** (§5.12). Total workers = `BASE_WORKERS + beds + opened summons`, so a new town starts at 3 and nobody gets permanently stuck. Workers are a separate scarce resource: most towns have more buildings than workers. |
| `RARITIES` | Normal 60% ×1.0 · Rare 25% ×1.1 · Epic 12% ×1.25 · Legendary 3% ×1.5 | Summon odds and work speed. Base and bed workers are generic "Villagers": Normal, no skill, no ability. Roster, skills and abilities: `docs/WORKER_DESIGN.md`, §5.12. |
| `BEDS` (habit line) | Cottage 1 · House 2 · Manor 4 | Manor is 4 so merging two Houses never loses a bed. Houses need no worker and produce no coins. |
| `POOL_MAX` | 10 | Most overflow buildings that can wait in the catch-up pool. |
| `POOL_RELEASE_PER_DAY` | 1 | Released on the first **visit** of a later local day (§5.9). |
| `TOWN_XP` | +1 per Lv1 that enters the inventory · +1 per merge to Lv2 · +3 per merge to Lv3 | Town XP only goes up. |
| `townLevel(xp)` | smallest L with `xp < 5·L·(L+1)` | TL2@10 · TL3@30 · TL4@60 · TL5@100 · TL6@150 · TL7@210 · TL8@280 · TL9@360 · TL10@450 … |
| `GRANDFATHER_LEVEL_CAP` | 8 | Starting `town_xp = 5·(L−1)·L` with `L = min(old level, 8)` (§3.3). |
| `FOOTPRINT` | Line buildings and savings projects 2×2 · decorations and legacy 1×1 | `TILE_SIZE` = 48, map 70×50 tiles (3360×2400). |
| Decoration shop | `cozy_bench` 50 · `garden_fountain` 150 | `supermarket` is removed from the shop (it's now Market Lv2). No boost in v1. |

### Zone steps (tile rectangles, each one contains the step before it)
| Step | x | y | w × h | Plots (2×2) | Town level | Cost |
|---|---|---|---|---|---|---|
| 0 (start) | 4 | 3 | 12 × 10 | 30 | — | — |
| 1 | 3 | 2 | 16 × 12 | 48 | 2 | 200 |
| 2 | 2 | 2 | 20 × 16 | 80 | 3 | 500 |
| 3 | 2 | 1 | 26 × 20 | 130 | 5 | 1000 |
| 4 | 1 | 1 | 34 × 26 | 221 | 7 | 2000 |
| 5 | 0 | 0 | 44 × 32 | 352 | 9 | 3500 |
| 6 | 0 | 0 | 56 × 40 | 560 | 11 | 5500 |
| 7 | 0 | 0 | 70 × 50 | 875 | 13 | 8000 |

Step 0 contains the player spawn point (400,300 px = tile 8,6). Step 3 covers the old random-spawn area (tiles 4–24 × 4–17), so most heritage buildings come back into production by step 3.

### Lines (category → line) and asset keys
| Line | From | Lv1 | Lv2 | Lv3 | asset_key |
|---|---|---|---|---|---|
| `fitness` | one-off task, category `Fitness` | Training Yard | Gym | Sports Arena | `fitness_1..3` |
| `coding` | one-off task, category `Coding` (and any unknown category) | Shed Workshop | Library | Academy | `coding_1..3` |
| `finance` | one-off task, category `Finance` · first money log of the day | Stall | Market | Bank | `finance_1..3` |
| `habit` | **any recurring-task instance** (`tasks.recurring_task_id IS NOT NULL`), whatever its category | Cottage | House | Manor | `habit_1..3` |

---

## 2. Simulation results (sim_v1.js, 12 weeks, collect-all once a day)

| Profile | Behaviour | First Lv2 | 1st expansion | 2nd | First Lv3 |
|---|---|---|---|---|---|
| **Steady** | 4 tasks + 2 logs, 7 days a week | day 1 | **day 7** | day 13 | **day 21** |
| Light | 2 tasks + 1 log, weekdays | day 2 | day 11 | day 23 | day 37 |
| **Burst** | 15 tasks on Saturdays, opens the app daily | day 7 | day 24 | day 43 | day 58 |
| Burst (no visits) | 15 tasks on Saturdays only | day 7 | day 49 | never | never |
| Focused | 4 coding tasks a day, no habits | day 1 | day 15 | day 30 | never (3 workers forever) |

The targets hold. Steady gets its first expansion in week 1 and its first Lv3 in week 3, and landmarks aren't in v1. Steady's first Lv2 comes on day 1, because the money-log stall plus a Finance task make a pair. Burst progresses, at about 3× slower than Steady; the catch-up pool is what moves it. Full tables are in `out_v1.txt` and, with 1 worker per town level, in `out_v1_wptl1.txt`.

---

## 3. DB migration — `db/15_builder_loop.sql` (add it to the list in `db/index.js`)

Every statement is idempotent and nothing is deleted. Legacy columns (`player_stats.level`, `xp`, `buildings.x/y`, `asset_key` history) are kept.

### 3.1 `player_stats`
```sql
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS town_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS zone_step SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;          -- last task completion / money log
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS counters_day DATE;                   -- user-local day the counters below belong to
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tasks_paid_today SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS buildings_today SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pool_released_on DATE;               -- last local day a catch-up release happened
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS legacy_level INTEGER;                -- old player level at migration (audit)
ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS builder_migrated BOOLEAN NOT NULL DEFAULT false;
-- CHECKs (added via DO-block guarded by pg_constraint lookup):
--   town_xp >= 0, zone_step BETWEEN 0 AND 7, coins >= 0
```
The daily counters live on the locked stats row, so deleting a task or a log can never free up a paid slot.

### 3.2 `buildings`
```sql
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
```
Constraints. Add each one in a `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='…') THEN ALTER TABLE … ADD CONSTRAINT …; END IF; END $$;` block, **after** the backfill in §3.3:
- `chk_buildings_state`: `state IN ('pooled','inventory','placed','merged')`
- `chk_buildings_kind`: `kind IN ('line','decoration','savings','legacy')`
- `chk_buildings_line`: `(kind = 'line') = (line IS NOT NULL AND level IS NOT NULL)` and `line IN ('fitness','coding','finance','habit')` and `level BETWEEN 1 AND 3`
- `chk_buildings_placed_has_tile`: `(state = 'placed') = (tile_x IS NOT NULL AND tile_y IS NOT NULL)`
- `chk_buildings_staff_mode`: `staff_mode IN ('auto','priority','off')`; `chk_buildings_footprint`: `footprint IN (1,2)`; `chk_buildings_stored`: `stored_milli >= 0`
- `ALTER TABLE buildings ALTER COLUMN kind SET NOT NULL;` (after the backfill)

Indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_buildings_user_state ON buildings (user_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_source_task ON buildings (source_task_id) WHERE source_task_id IS NOT NULL;      -- one building per task, ever
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_daily_log_stall ON buildings (user_id, generated_on) WHERE source = 'money_log'; -- one stall per day
```
Overlaps are **not** enforced by a constraint, because heritage buildings may already overlap. The server enforces them in code while holding the stats-row lock (§5.2).

### 3.3 Heritage and grandfather backfill (same file, guarded so it is idempotent)
```sql
-- original asset_key is preserved in metadata.legacy_asset_key before any rewrite
UPDATE buildings SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('legacy_asset_key', asset_key)
 WHERE kind IS NULL AND NOT (COALESCE(metadata,'{}'::jsonb) ? 'legacy_asset_key');

UPDATE buildings SET kind='line', line='habit',   level=1, asset_key='habit_1',   footprint=2, heritage=true, source='heritage' WHERE kind IS NULL AND asset_key='house';
UPDATE buildings SET kind='line', line='finance', level=2, asset_key='finance_2', footprint=2, heritage=true, source='heritage' WHERE kind IS NULL AND asset_key='supermarket';
UPDATE buildings SET kind='decoration', footprint=1, heritage=true, source='heritage' WHERE kind IS NULL AND asset_key IN ('cozy_bench','garden_fountain');
UPDATE buildings SET kind='savings',    footprint=2, source='savings'             WHERE kind IS NULL AND asset_key='savings_project';
UPDATE buildings SET kind='legacy',     footprint=1, heritage=true, source='heritage' WHERE kind IS NULL;   -- anything unknown: render only

-- position: old x,y were pixel centres of a 1x1 tile (gx*48+24). Anchor footprint top-left there, clamp to the map.
UPDATE buildings SET tile_x = LEAST(GREATEST(FLOOR(x/48)::int, 0), 70 - footprint),
                     tile_y = LEAST(GREATEST(FLOOR(y/48)::int, 0), 50 - footprint),
                     state = 'placed', accrued_at = NOW()
 WHERE tile_x IS NULL AND state = 'placed' AND x IS NOT NULL;

-- grandfather: old level -> starting town level (capped at 8). Runs once per stats row.
UPDATE player_stats
   SET legacy_level = level,
       town_xp = GREATEST(town_xp, 5 * (LEAST(GREATEST(level,1), 8) - 1) * LEAST(GREATEST(level,1), 8)),
       last_active_at = COALESCE(last_active_at, NOW()),
       builder_migrated = true
 WHERE builder_migrated = false;
```
- Old level 1 → TL1 (xp 0). Level 3 → xp 30 = TL3. Level 8 or higher → xp 280 = TL8. Coins and buildings aren't granted for the old level.
- Rows created after the migration (new users) get picked up on the next boot with level 1 → xp 0, which does nothing. New stats rows must be inserted with `builder_migrated = true, last_active_at = NOW()` (see `lockStatsRow`).
- Heritage buildings add no town XP, because the old level already counts that history.
- `player_stats.level` / `xp` are frozen from now on. Nothing writes them after this release.

### 3.4 `tasks`
No schema change is needed: the daily counters are on `player_stats`. `tasks.coins_earned` keeps being written (10 or 0).

---

## 4. Shared server state shape — `builder` (sent in `init_state` and `builder_state`)

```js
builder = {
  serverNow: "2026-11-02T09:00:00.000Z",     // ISO; the client extrapolates storage from this
  today: "2026-11-02",                        // user-local day key
  coins: 123,
  town: { level: 3, xp: 42, xpForThis: 30, xpForNext: 60 },
  zone: { step: 1, x: 3, y: 2, w: 16, h: 12,
          next: { step: 2, x: 2, y: 2, w: 20, h: 16, townLevel: 3, cost: 500 } | null },
  workers: { total: 9, used: 6, base: 3, beds: 4, recruiterBonus: 0,
             summoned: [ { id, key, name, rarity, skill, ability, stars, assignedBuildingId|null } ],
             pendingSummons: 1, pityIn: 7 },
  sleepy: false, sleepyAt: "ISO",             // when production stops if no activity (last_active_at + 72h)
  today_counts: { buildings: 3, buildingCap: 5, tasksPaid: 2, tasksPaidCap: 5, logsPaid: 1, logsPaidCap: 3 },
  pool: { count: 4, max: 10, nextReleaseAvailable: true },
  placed: [ Building ],                       // state='placed' (every kind)
  inventory: [ Building ],                    // state='inventory', ordered level DESC, id ASC
  rules: { DAILY_BUILDING_CAP, TASK_COINS, TASK_COINS_PER_DAY, LOG_COINS, LOG_COINS_PER_DAY,
           RATE_MILLI, STORAGE_HOURS, MERGE_COST, MERGE_TOWN_LEVEL, BASE_WORKERS, BEDS,
           POOL_MAX, SLEEPY_AFTER_HOURS, SHOP: { cozy_bench: 50, garden_fountain: 150 },
           ZONES: [...], NAMES: { fitness: ["Training Yard","Gym","Sports Arena"], ... } }
}

Building = {
  id, kind, line|null, level|null, asset_key, state, heritage,
  tileX|null, tileY|null, footprint,               // 1 or 2
  insideZone: bool,                                // full footprint inside the current zone
  staffMode: "auto"|"priority"|"off", staffed: bool, workerId: null|int, speedBp: int, needsWorker: bool,  // workerId null + staffed = generic Villager; speedBp 10000 = ×1.0; needsWorker = kind='line' && line!='habit'
  beds: 0..3,                                      // habit line only, counted only if placed && insideZone
  storedMilli: int,                                // settled to serverNow
  rateMilliPerHour: int,                           // 0 if not producing right now (unstaffed/outside/sleepy/habit/non-line)
  capMilli: int,
  metadata: {...}                                  // savings stage etc. (already filtered for friends)
}
```
The client may animate storage locally with `min(cap, storedMilli + rate × (now − serverNow))`. **Only the server's numbers are paid out.**

`init_state` changes: `buildings` now holds only `state='placed'` rows, with the new columns mapped as above, and a new `builder` key is added. Everything else stays the same. `stats.level`/`stats.xp` are still sent but the UI must show `builder.town` instead.

---

## 5. Server rules (backend)

### 5.1 Common rules for every builder mutation
1. Validate the payload at the boundary. Ids are `Number.isInteger(n) && n > 0`, tiles are integers in range, and string enums are checked against a whitelist. On a bad payload, emit `builder_error` to the emitting socket only.
2. `withTransaction` → `lockStatsRow(client, userId)` (`SELECT … FOR UPDATE`). Move both helpers from `moneyHandlers.js` into `server/tx.js` and reuse them. Then `rollDailyCounters` resets the counters when `counters_day IS DISTINCT FROM today`.
3. `settleAll(client, userId, now)` runs **before** anything that changes staffing, zone, level or sleep state. For each placed building with `staffed = true`:
   `end = min(now, last_active_at + 72h)`, `ms = max(0, end − accrued_at)`, `stored_milli = min(cap, stored_milli + floor(rate × ms / 3_600_000))`. Then set `accrued_at = now` on **all** placed rows. There's no ticking loop.
4. `reassignWorkers(client, userId)`. Workers = `BASE_WORKERS + Σ BEDS[level]` over placed, inside-zone habit buildings + 1 if Recruiter is owned (all generic Villagers) + the user's rows in `workers`. Pinned workers (`assigned_building_id`) staff their building first if it is still a candidate. Then, for each remaining candidate in order, take the available worker with the highest speed for that building, using generic Villagers last. Write `staffed`, `worker_id`, `speed_bp` and `cap_bp` on each building. The rate in step 3 becomes `floor(RATE_MILLI[level] × speed_bp / 10000)`, and the cap becomes `floor(RATE_MILLI[level] × 20 × cap_bp / 10000)`. `speed_bp` and `cap_bp` hold every ability effect (§5.12), so nothing else computes them. Candidates are placed, inside-zone line buildings with `line <> 'habit'` and `staff_mode <> 'off'`, ordered by `staff_mode='priority'` DESC, `level` DESC, `id` ASC. The first N get `staffed=true` and the rest `false`. Non-candidates are always `false`. Order of operations: **settle, mutate, reassign**.
5. Coins only change with `UPDATE player_stats SET coins = coins ± $n … WHERE user_id=$u [AND coins >= $n] RETURNING coins` inside the transaction. Coins are integers, and `stored_milli` is the only fractional value, kept as integer millicoins.
6. After COMMIT, emit `builder_state` (the full `builder` object) to the room `user:<id>`, plus any fx event. The existing `refresh_data` / `refresh_money` keep firing where they do now.
7. "Today" is always `localDateKey(new Date(), socket.data.timezone)`.

### 5.2 Placement validation (`place_building`, `move_building`, `purchase_building`, auto-place)
- `0 ≤ tileX`, `tileX + fp ≤ 70`, `0 ≤ tileY`, `tileY + fp ≤ 50`
- The footprint is **fully inside the current zone rect**: `zone.x ≤ tileX`, `tileX + fp ≤ zone.x + zone.w`, and the same for y.
- No overlap with any other `state='placed'` row of this user (any kind, heritage included; the moving row is excluded). Overlap test: `a.x < b.x + b.fp && b.x < a.x + fp && a.y < b.y + b.fp && b.y < a.y + fp`.
- On success, write `tile_x`, `tile_y`, and the legacy pixel `x = tile_x*48 + fp*24`, `y = tile_y*48 + fp*24`.
- **Auto-place** scans `y` from zone.y to zone.y+h−fp, and `x` within each row, and takes the first free spot.

### 5.3 `complete_task` (rewrite)
In one transaction: lock, roll counters, atomically claim the task (`UPDATE … WHERE status='pending' RETURNING *`, as now).
- Coins: `coins = tasks_paid_today < 5 ? 10 : 0`. If 10, increment `tasks_paid_today`. Write `tasks.coins_earned`.
- Line: `recurring_task_id` set → `habit`. Otherwise Fitness/Coding/Finance → that line, and anything else → `coding`.
- Building:
  - If `buildings_today < 5`: INSERT `kind='line', level=1, state='inventory', source='task', source_task_id, generated_on=today`, increment `buildings_today`, `town_xp += 1`, and emit `building_generated {reason:'task'}`.
  - Else, if the pooled count is below 10: INSERT with `state='pooled'` and emit `building_pooled`.
  - Else: no building (`pool_full: true` in `task_reward`).
- Wake: if the town is sleepy, run `settleAll` first. Then set `last_active_at = now`.
- Keep `calories_burned`. **Stop** writing `level`/`xp`, and remove the random-position building insert and the `building_spawned` emit.
- Emit `task_reward { taskId, coins, paidToday, building: "inventory"|"pooled"|"none", line }`. This replaces `{baseCoins, bonusCoins, totalCoins, isOnTime}`.
- `server/rewards.js`: replace `computeTaskReward` / `applyLevelUp` with `townLevel(xp)` and `xpBounds(level)`.

### 5.4 Money logs (`add_transaction`, small change)
- `REWARDED_LOGS_PER_DAY` = 3.
- In the same transaction, if this is the first log of the local day and `buildings_today < 5`: INSERT a Finance Stall (`line='finance', level=1, state='inventory', source='money_log', generated_on=today`) with `ON CONFLICT DO NOTHING` (unique index). If a row was inserted, increment `buildings_today` and add `town_xp += 1`.
- Set `last_active_at` (settle first if sleepy).
- Savings milestones are unchanged (+40 per stage).
- `delete_transaction` revokes the log coins as it does today, but **never** removes the stall.

### 5.5 `delete_task`
It must no longer delete the building. Delete the task row only; `source_task_id` falls to NULL through the FK. Coins and counters aren't touched.

### 5.6 `merge_buildings { targetId, sourceId }`
Validation, under the lock:
- Both ids are integers and different from each other.
- Both rows are `user_id = me`, `state='placed'`, and `kind='line'`.
- Same `line`, same `level`, and `level < 3`.
- `townLevel(town_xp) ≥ MERGE_TOWN_LEVEL[level]`.
- The conditional debit of `MERGE_COST[level]` succeeds.

Effect: settle all, then:
- target: `level+1`, `asset_key = line_<level+1>`, `stored_milli += source.stored_milli` (the new cap is always larger).
- source: `state='merged'`, `merged_into = target.id`, and tiles and x/y set to NULL.
- `town_xp += (level+1 === 2 ? 1 : 3)`.
- `heritage` on the target stays as it was (a heritage merge keeps its badge).

Then reassign workers and emit `merge_done { building, retiredId, cost }`. Error codes: `NOT_FOUND`, `NOT_PLACED`, `MISMATCH`, `MAX_LEVEL`, `TOWN_LEVEL`, `COINS`.

### 5.7 `collect { buildingId }` / `collect_all {}`
Settle all, then for the chosen rows take `k = floor(stored_milli/1000)`, credit `Σk` coins, and set `stored_milli -= k*1000`. Emit `coins_collected { total, items:[{id, coins}] }`. A `total` of 0 is fine (no error). `collect_all` also counts as a visit (§5.9).

### 5.8 `expand_zone {}`
The next step must exist, `townLevel ≥ step.townLevel` must hold, and the conditional debit must succeed. Then settle all, `zone_step += 1`, reassign workers (outside heritage may now be inside), and emit `zone_expanded { step, zone }`. Errors: `MAX_ZONE`, `TOWN_LEVEL`, `COINS`.

### 5.9 Catch-up release (a "visit")
A visit is `request_init_state` or `collect_all`. In a transaction, run the release if `pool_released_on IS DISTINCT FROM today` and there is a pooled row with `generated_on < today`:
- the oldest pooled row (`generated_on`, `id`) gets `state='inventory', released_on=today`
- `town_xp += 1`
- `pool_released_on = today`

Emit `building_generated {reason:'catch_up'}`. A release does not count toward `buildings_today`, pays no coins, and does not wake a sleepy town. For `request_init_state`, run the release before building the `builder` payload.

### 5.10 `place_building`, `auto_place`, `move_building`, `set_staff_mode`, `purchase_building`
- `place_building { buildingId, tileX, tileY }`: the row must be `state='inventory'` and owned. Run §5.2, then `state='placed', accrued_at=now`, then reassign.
- `auto_place {}`: place every inventory row (level DESC, id ASC) with the §5.2 scan and stop at the first one that doesn't fit. Emit `auto_place_done { placed: n, remaining: m }`.
- `move_building { buildingId, tileX, tileY }` (**the payload changes** from `{id,x,y}`): owned and `state='placed'`, any kind. Run §5.2; heritage rows outside the zone can only move to a valid spot inside it. Settle, move, reassign. Emit `builder_state` to the room. `building_moved` is no longer sent.
- `set_staff_mode { buildingId, mode }`: mode in `auto|priority|off`, and the row is an owned placed producer. Settle, update, reassign.
- `purchase_building { assetKey, tileX, tileY }`: `assetKey` must be in `SHOP`, footprint 1, §5.2 applies, conditional debit. INSERT `kind='decoration', state='placed', source='purchase'`.
- Savings goals (`add_savings_goal`): the project row is created with `kind='savings', footprint=2, source='savings'` at the first free auto-place spot inside the zone. If the zone is full, it uses the first free spot on the whole map. It is never refused.

### 5.12 Mystery summons
Every `town_xp` change goes through one helper, `addTownXp(client, userId, n)`, which compares `townLevel` before and after and does `pending_summons += levels gained`. Level-ups change no staffing by themselves.

`open_summon {}`: lock, require `pending_summons > 0` (else `builder_error` code `NO_SUMMON`). Roll on the **server** with `crypto.randomInt`: pick a rarity by `RARITIES` odds, then a uniform worker of that rarity from `WORKER_CATALOG`. **Pity:** `summons_since_epic` counts pulls since the last Epic or better; when it reaches 9, the next pull only rolls Epic/Legendary (12:3). Insert a row in `workers`, `pending_summons -= 1`. Settle before, reassign after. Emit `summon_result { worker, isDuplicate, stars, remaining }` to the room, then `builder_state`.

`assign_worker { workerId, buildingId|null }`: both owned; building must be a placed, inside-zone producer. Sets `assigned_building_id` (null = back to auto), clearing any other worker pinned there. Settle, update, reassign. Errors: `NOT_FOUND`, `NOT_PLACED`, `OUT_OF_ZONE`.

**`WORKER_CATALOG`** lives in `server/builderRules.js` as data, copied exactly from `docs/WORKER_DESIGN.md` §4 (12 workers: `key, name, rarity, skill, ability`). Sent in `builder.rules` with `RARITIES`, so the UI can show the odds.

**Speed**, additive, in basis points from 10000 for a Villager: rarity (Rare +1000, Epic +2500, Legendary +5000) · skill match +2000 (Trainer=fitness, Scholar=coding, Merchant=finance) · All-rounder +500 anywhere · each star +500 · own Quick Hands +500 · Cheerleader +500 per staffed Cheerleader on a building whose footprint touches this one (max +1500) · Town Hero +500.

**Duplicates:** every pull adds a worker row, so it always adds one worker. `stars = min(3, copies of that key − 1)`, shared by all copies. Effects of the same global ability don't stack.

**Abilities (v1):**
- While that worker is staffed: Deep Pockets (`cap_bp` 12500), Quick Hands (self), Cheerleader (neighbours).
- While owned: Early Bird (first `collect_all` of the local day with total > 0 pays +3 coins, tracked by `early_bird_on`) · Bargainer (merge cost −10%) · Master Builder (merge cost −25%; takes priority over Bargainer; floor the cost) · Recruiter (+1 generic worker) · Town Hero (speed, all staffed buildings).
- Lucky Star is not in the roster, so it isn't built in v1.
- Abilities never produce coins while the town is asleep.

Rules: summons are never sold for real money; odds are always shown; every result is a useful worker; workers can't be dismissed or lost; workers don't level up in v1.

Add to migration §3: `player_stats.pending_summons SMALLINT NOT NULL DEFAULT 0 CHECK (>= 0)`, `player_stats.summons_since_epic SMALLINT NOT NULL DEFAULT 0`, `player_stats.early_bird_on DATE`, `buildings.worker_id INTEGER`, `buildings.speed_bp INTEGER NOT NULL DEFAULT 10000`, `buildings.cap_bp INTEGER NOT NULL DEFAULT 10000`, table `workers (id SERIAL PK, user_id INT NOT NULL FK users ON DELETE CASCADE, worker_key VARCHAR(30) NOT NULL, assigned_building_id INT REFERENCES buildings(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW())` with an index on `user_id`. Rarity, skill and ability come from the catalog by `worker_key`, never stored per row. Grandfather in §3.3: `pending_summons = townLevel(town_xp) − 1`, inside the same once-only `builder_migrated` update.

### 5.13 Guided first day
Backend: add `player_stats.tutorial_step SMALLINT NOT NULL DEFAULT 0` and `player_stats.tutorial_done BOOLEAN NOT NULL DEFAULT false` to the migration. Send `tutorial: { step, done }` in `builder`. `set_tutorial { step:int 0..20, done:bool }` validates and saves; it pays nothing and changes nothing else. Existing users start at step 0 too, since the whole loop is new to them.

Frontend only, no game changes: one small, non-blocking coach bubble in the HUD. It never covers the game with a modal, and it has a visible **Skip guide**. Steps advance by watching real `builder` and task state, not by "Next" clicks, and use the player's real tasks. No extra rewards, because the loop's own rewards are the point.
1. Add a task you'd really do today.
2. Finish it. You earn 10 coins and your first building.
3. Place it from your inventory (or Auto-place).
4. A worker is on it, and it fills with coins. Log something you spent today with 💸 (you get a free Stall).
5. Done for today. "Come back tomorrow to collect your coins." Points at Collect all.
6. Shown when the player first owns two identical buildings and 25 coins: "Drag one onto the other to merge."
7. Shown the first time `pendingSummons > 0`: "You levelled up! Open your summon."

After step 5 the bubble only appears for steps 6 and 7, when they become true, so the guide is finished by real play, not forced. Skip sets `done`. Add a "Replay guide" link in `ProfilePanel`. Copy is short and friendly.

### 5.11 Other readers to update (backend)
- `aiBrain.js`: buildings query gets `AND state='placed'`, and the prompt uses `Town level` instead of `Level`.
- `friendHandlers.visit_friend_map`: only `state='placed'`. Return `id, kind, line, level, asset_key, tile_x, tile_y, footprint, heritage, metadata(filtered)`. No storage and no staffing.
- `inspect_building`: also answer for line buildings (name, level, line, staffed), with HTML escaped.

---

## 6. Socket events

### Client → server
| Event | Payload | Validation |
|---|---|---|
| `request_init_state` | — | (existing) also triggers §5.9 |
| `request_builder_state` | — | responds with `builder_state` to the socket |
| `place_building` | `{ buildingId:int, tileX:int, tileY:int }` | §5.2, inventory row |
| `auto_place` | `{}` | — |
| `move_building` | `{ buildingId:int, tileX:int, tileY:int }` | §5.2, placed row (**breaking change**) |
| `merge_buildings` | `{ targetId:int, sourceId:int }` | §5.6 |
| `collect` | `{ buildingId:int }` | placed, owned |
| `collect_all` | `{}` | — |
| `set_staff_mode` | `{ buildingId:int, mode:"auto"\|"priority"\|"off" }` | placed producer |
| `expand_zone` | `{}` | §5.8 |
| `open_summon` | `{}` | §5.12 |
| `assign_worker` | `{ workerId:int, buildingId:int\|null }` | §5.12 |
| `set_tutorial` | `{ step:int, done:bool }` | §5.13 |
| `purchase_building` | `{ assetKey:"cozy_bench"\|"garden_fountain", tileX:int, tileY:int }` | §5.2 + coins (**breaking change**) |
| `complete_task`, `add_transaction` | unchanged | rules §5.3 / §5.4 |

### Server → client
| Event | To | Payload |
|---|---|---|
| `init_state` | socket | existing keys + `builder` (§4); `buildings` = placed only |
| `builder_state` | room | `builder` (§4). This is the full refresh: the client replaces its state and the game diffs `placed` by id. |
| `building_generated` | room | `{ building: Building, reason: "task"\|"money_log"\|"catch_up" }` |
| `building_pooled` | room | `{ line, poolCount, poolMax }` |
| `task_reward` | room | `{ taskId, coins, paidToday, building:"inventory"\|"pooled"\|"none", line }` |
| `merge_done` | room | `{ building: Building, retiredId, cost }` |
| `coins_collected` | room | `{ total, items:[{ id, coins }] }` |
| `zone_expanded` | room | `{ step, zone:{x,y,w,h} }` |
| `auto_place_done` | room | `{ placed, remaining }` |
| `summon_result` | room | `{ worker: { id, key, name, rarity, skill, ability, stars }, isDuplicate, stars, remaining }` |
| `builder_error` | **emitting socket** | `{ code, message }`; code ∈ `BAD_PAYLOAD, NOT_FOUND, NOT_PLACED, NOT_IN_INVENTORY, OUT_OF_ZONE, OUT_OF_MAP, OVERLAP, MISMATCH, MAX_LEVEL, TOWN_LEVEL, COINS, MAX_ZONE, UNKNOWN_ITEM, SERVER` |
| Retired | — | `building_spawned` (tasks/purchases), `building_moved`, `purchase_failed` → use `builder_state` / `builder_error`. `building_removed` and `building_updated` (savings stage) stay. |

---

## 7. File ownership (no two devs touch the same file)

| Dev | Owns | Builds |
|---|---|---|
| **Backend** | `server.js`, `server/**`, `db/**` | New `server/tx.js` (withTransaction, lockStatsRow, rollDailyCounters), `server/builderRules.js` (CFG, `townLevel`, zones, names), `server/builderState.js` (settleAll, reassignWorkers, findFreeSpot, fetchBuilderState), `server/builderHandlers.js` (§6 events, registered in `server.js`). Edits to `socketHandlers.js`, `moneyHandlers.js`, `rewards.js`, `aiBrain.js`, `friendHandlers.js`. Also `db/15_builder_loop.sql` and `db/index.js`. |
| **Frontend** | `src/App.jsx`, `src/pages/**`, `src/components/**`, `src/utils/**` | `builder` state in App (from `init_state`/`builder_state`). New `InventoryPanel.jsx` (items, "Place" → starts game placement, "Auto-place"). A Builder HUD with coins, a **Collect all** button with a total badge, Town Level ring (replaces LevelRing in `ProfilePanel`), workers `used/total`, pool count, today `buildings x/5`, and an Expand button showing the requirement. `BuildingCard` is built from `Building` data (name, level, staffed, storage, staff-mode toggle, Collect) instead of HTML for line buildings. Toasts for every fx event and `builder_error`. `utils/rewards.js` → flat-10 preview (`10 coins · 2/5 paid today`). The shop sends `{assetKey,tileX,tileY}` through game placement. |
| **Game** | `src/game/**`, `src/assets/**` | 2×2 footprints rendered from `tileX/tileY/footprint` (not x/y), sprite bottom-aligned to the footprint. Approved art is in the scratchpad `builder-art/v2/sprites/` (27 PNGs): copy into `src/assets/`, add `ASSET_REGISTRY` entries for `fitness_1..3`, `coding_1..3` (Learning sprites), `finance_1..3`, `habit_1..3` (Homes sprites), `savings_project_0..4`, `cozy_bench`, `garden_fountain`, and swap the player/AI to the new 24×32 sprites with matching physics bodies. Zone overlay (dimmed outside, border, next-step outline). Placement ghost (green/red) driven by `scene.beginPlacement({ buildingId, footprint, mode:"place"\|"purchase", assetKey? })` / `scene.cancelPlacement()`, which emits `place_building`/`purchase_building`. Dragging a placed building to a spot emits `move_building`, and dropping it on an identical one (same line+level) emits `merge_buildings`. Storage bubble when ≥1 coin (tap → `collect`). Unstaffed and outside-zone tint. Sleepy overlay (rain, closed shutters). `scene.syncBuildings(placed)` diffs by id; `scene.setZone(zone)`. Snapping is to the tile grid, using the client copy of §5.2 for the ghost colour only. |

Interface between frontend and game: App calls `scene.syncBuildings`, `scene.setZone`, `scene.setSleepy(bool)`, `scene.beginPlacement`, `scene.cancelPlacement`. The scene calls back `onBuildingInspect(building)` (existing) and `onPlacementEnd({ok})`. The scene emits builder socket events directly through the socket it already has.

---

## 8. Acceptance criteria / test checklist

Backend (scripted with a socket.io-client script or psql, plus `node --check` on every touched file):
- [ ] Migration runs twice on a copy of the current DB with no error and no change on the second run. Row count in `buildings` doesn't change, and every old row has `kind`, `tile_x/y` and `metadata.legacy_asset_key`.
- [ ] house → `habit_1` heritage, supermarket → `finance_2` heritage, bench/fountain → decoration, savings unchanged (`kind='savings'`, stage kept).
- [ ] Old level 3 → `town_xp=30` (TL3), level 12 → 280 (TL8), level 1 → 0. A second boot doesn't change it.
- [ ] 7 tasks completed in one local day → coins +50, 5 inventory buildings, 2 pooled, `town_xp +5`. Deleting and re-adding tasks doesn't reset the paid count.
- [ ] Double-emit `complete_task` → one building only (unique `source_task_id`).
- [ ] First money log of the day → a stall plus 5 coins. 4 logs → 15 coins and 1 stall. Deleting the log keeps the stall. If 5 tasks already happened that day, no stall.
- [ ] Next local day: open the app → exactly 1 pooled row becomes inventory. A reload the same day releases nothing more. A row pooled today is not released today.
- [ ] `place_building` is rejected for out-of-zone, out-of-map, overlapping (heritage included), wrong-state and other-user ids, each with the right `builder_error.code`.
- [ ] Merge is rejected for a different line, a different level, Lv3, an unplaced row, the same id twice, another user's building, TL < 5 for Lv2→3, and not enough coins. On success the coins drop by exactly the cost and the source row stays with `state='merged'`.
- [ ] Workers: 3 base and 5 placed Lv1 producers → 3 staffed (lowest ids). Place a Cottage → 4. Set one to `off` → another one takes the worker. `priority` wins over a higher level.
- [ ] Production: staffed Lv1, 10 h → `collect` pays 1 coin (1500 milli, keeps 500). After 30 h it pays 3 (cap 3000). Unstaffed → 0.
- [ ] Sleepy: `last_active_at` 100 h ago and staffed since then → collect pays at most 72 h worth. Completing a task afterwards doesn't pay for the sleeping gap.
- [ ] Expand: rejected below TL or coins. Success → `zone_step+1`, and heritage now inside the zone gets staffed if workers allow.
- [ ] Concurrent `collect_all` ×2 and merge + expand racing on one coin balance → coins never go negative and nothing pays twice.
- [ ] Friend visit shows only placed buildings, with no storage or staffing fields.

Frontend and game (manual, in the browser):
- [ ] Fresh login shows the start zone with the outside dimmed, heritage buildings where they were (outside ones dimmed), and the Town Level ring.
- [ ] Complete a task → a toast, the inventory badge goes up, Place → ghost → valid click places it (the server confirms with `builder_state`), and an invalid spot shows red and nothing is sent.
- [ ] Auto-place fills the zone. Drag onto an identical building → merge animation and coins go down. Drag onto a mismatching one → it bounces back with the error toast.
- [ ] Collect all shows the total and storage bubbles clear. Unstaffed buildings show the "no worker" icon, and workers read `used/total`.
- [ ] Expand button disabled with the reason ("Town Lv 2 + 200 coins") → after expanding, the zone border grows.
- [ ] Sleepy town (set `last_active_at` back 4 days in Adminer) → rain overlay and no storage growth; completing one task clears it.
- [ ] Task form preview shows a flat 10 coins and stops promising coins after 5 a day. No UI still shows XP or the old level.
- [ ] Phone width: the HUD, inventory and Collect all are usable, and nothing overlaps the minimap toggle.

---

> **Later changes (see `docs/PLAN.md` Decisions, item 5):** savings milestones pay once a day, the first habit of the day builds a home, `MAX_BEDS` 20, zone costs 7000/11000/16000, cap scales with speed. `server/builderRules.js` is the source of truth for numbers.

## 9. Resolved questions
1. **Workers for players who skip habits:** each town level gives one mystery summon (owner's idea), so nobody gets permanently stuck. UI: a "🎁 Summon" button with a count opens a reveal showing the worker's name, rarity, skill and ability. A Workers panel lists every worker with stars and their building, shows the odds and pity count, and lets you assign by hand; building cards show the worker and speed. Art: 12 roster sprites and a mystery-summon icon (generic Villagers use the approved villager sprite). Paying coins for extra summons is a v1.1 option for the coin sink, and needs its own balance check.
2. **Manor beds:** 4.
3. **Habit line source:** every recurring-task instance maps to the habit line, whatever its category.
4. **Grandfather cap:** TL8.
5. **Late-game coin sink:** still open for v1.1. Steady banks about 15k coins by week 12; decorations, boosts and landmarks have to absorb this.
