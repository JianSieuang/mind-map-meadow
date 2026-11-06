import { changeCoins } from "./tx.js";
// The Builder Loop's rules engine: settling storage, staffing, placement and the `builder`
// payload (docs/BUILDER_LOOP_CONTRACT.md §4, §5). Functions taking a `client` expect to run
// inside a transaction that already holds the user's stats-row lock.
import { pool } from "./db.js";
import { isNewerDay } from "./tx.js";
import { localDateKey } from "./timezone.js";
import { townLevel, xpBounds } from "./rewards.js";
import { CFG, ZONES, RULES, RARITIES, SPEED, SKILL_LINE, MAX_STARS, assetKeyFor, catalogWorker, mergeCostFor } from "./builderRules.js";

export class BuilderError extends Error {
    constructor(code, message) {
        super(message || code);
        this.code = code;
    }
}

const HOUR_MS = 3_600_000;
const SLEEPY_AFTER_MS = CFG.SLEEPY_AFTER_HOURS * HOUR_MS;

export function roomFor(userId) {
    return `user:${userId}`;
}

export function zoneFor(step) {
    return ZONES[Math.min(Math.max(step, 0), ZONES.length - 1)];
}

function isInsideRect(rect, tileX, tileY, footprint) {
    return tileX >= rect.x && tileX + footprint <= rect.x + rect.w && tileY >= rect.y && tileY + footprint <= rect.y + rect.h;
}

function isRowInsideZone(row, zone) {
    return row.tile_x !== null && row.tile_y !== null && isInsideRect(zone, row.tile_x, row.tile_y, row.footprint);
}

function isProducerRow(row) {
    return row.kind === "line" && row.line !== "habit";
}

// ---------------------------------------------------------------------------
// The one place a building's rate and cap are computed from speed_bp / cap_bp.
// ---------------------------------------------------------------------------
export function rateMilliFor(level, speedBp) {
    return Math.floor((CFG.RATE_MILLI[level] * speedBp) / 10000);
}

export function capMilliFor(level, capBp) {
    return Math.floor((CFG.RATE_MILLI[level] * CFG.STORAGE_HOURS * capBp) / 10000);
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------
export function sleepyAtFor(stats, now) {
    const lastActive = stats.last_active_at ? new Date(stats.last_active_at) : now;
    return new Date(lastActive.getTime() + SLEEPY_AFTER_MS);
}

export function isSleepy(stats, now) {
    return now.getTime() >= sleepyAtFor(stats, now).getTime();
}

// Storage of a staffed row at `now`, without writing anything. Storage already above the
// cap (a Deep Pockets worker moved away) stays there: earned coins are never taken back.
function settledMilli(row, sleepyAt, now) {
    const end = Math.min(now.getTime(), sleepyAt.getTime());
    const ms = Math.max(0, end - new Date(row.accrued_at).getTime());
    const gained = Math.floor((rateMilliFor(row.level, row.speed_bp) * ms) / HOUR_MS);
    return Math.max(row.stored_milli, Math.min(capMilliFor(row.level, row.cap_bp), row.stored_milli + gained));
}

export async function settleAll(client, userId, now) {
    const statsResult = await client.query("SELECT last_active_at FROM player_stats WHERE user_id = $1", [userId]);
    const sleepyAt = sleepyAtFor(statsResult.rows[0], now);

    const { rows } = await client.query(
        `SELECT id, level, stored_milli, accrued_at, speed_bp, cap_bp FROM buildings
         WHERE user_id = $1 AND state = 'placed' AND staffed = true AND kind = 'line' AND line <> 'habit'`,
        [userId],
    );

    const ids = [];
    const stored = [];
    for (const row of rows) {
        const next = settledMilli(row, sleepyAt, now);
        if (next !== row.stored_milli) {
            ids.push(row.id);
            stored.push(next);
        }
    }
    if (ids.length > 0) {
        await client.query(
            `UPDATE buildings b SET stored_milli = v.stored
             FROM unnest($1::int[], $2::int[]) AS v(id, stored)
             WHERE b.id = v.id AND b.user_id = $3`,
            [ids, stored, userId],
        );
    }
    await client.query("UPDATE buildings SET accrued_at = $2 WHERE user_id = $1 AND state = 'placed'", [userId, now]);
}

// Real activity keeps the town awake. The sleeping gap must be closed off first, or moving
// last_active_at forward would pay for it on the next settle.
export async function touchActivity(client, stats, userId, now) {
    if (isSleepy(stats, now)) await settleAll(client, userId, now);
    await client.query("UPDATE player_stats SET last_active_at = $1 WHERE user_id = $2", [now, userId]);
    stats.last_active_at = now;
}

// ---------------------------------------------------------------------------
// Town XP: every change goes through here, so every level gained grants a summon.
// ---------------------------------------------------------------------------
export async function addTownXp(client, userId, n) {
    const before = await client.query("SELECT town_xp FROM player_stats WHERE user_id = $1", [userId]);
    const oldXp = before.rows[0].town_xp;
    const newXp = oldXp + n;
    const gained = Math.max(0, townLevel(newXp) - townLevel(oldXp));
    await client.query("UPDATE player_stats SET town_xp = $1, pending_summons = pending_summons + $2 WHERE user_id = $3", [newXp, gained * CFG.SUMMONS_PER_TOWN_LEVEL, userId]);
    return { townXp: newXp, levelsGained: gained };
}

// ---------------------------------------------------------------------------
// Coins
// ---------------------------------------------------------------------------
export async function debitCoins(client, userId, amount, reason) {
    const balance = await changeCoins(client, userId, -amount, reason);
    if (balance === null) throw new BuilderError("COINS", "Not enough coins.");
    return balance;
}

export async function creditCoins(client, userId, amount, reason) {
    if (amount <= 0) return;
    await changeCoins(client, userId, amount, reason);
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------
function starsFor(key, copies) {
    return Math.min(MAX_STARS, Math.max(0, (copies.get(key) || 0) - 1));
}

function countCopies(workerRows) {
    const copies = new Map();
    for (const row of workerRows) copies.set(row.worker_key, (copies.get(row.worker_key) || 0) + 1);
    return copies;
}

export function ownedAbilitiesOf(workerRows) {
    const owned = new Set();
    for (const row of workerRows) {
        const ability = catalogWorker(row.worker_key)?.ability;
        if (ability) owned.add(ability);
    }
    return owned;
}

// Generic Villagers: town hall + beds in placed, inside-zone homes + Recruiter's one extra.
function workerCounts(placedRows, ownedAbilities, zone) {
    let beds = 0;
    for (const row of placedRows) {
        if (row.kind === "line" && row.line === "habit" && isRowInsideZone(row, zone)) beds += CFG.BEDS[row.level];
    }
    beds = Math.min(beds, CFG.MAX_BEDS);
    const recruiterBonus = ownedAbilities.has("Recruiter") ? 1 : 0;
    return { base: CFG.BASE_WORKERS, beds, recruiterBonus, generic: CFG.BASE_WORKERS + beds + recruiterBonus };
}

// What a worker brings to a building on their own, before neighbours and Town Hero.
function personalSpeedBp(worker, line, copies) {
    const info = catalogWorker(worker.worker_key);
    if (!info) return SPEED.BASE_BP;
    let speed = SPEED.BASE_BP + RARITIES[info.rarity].speedBonusBp + starsFor(worker.worker_key, copies) * SPEED.STAR_BP;
    if (SKILL_LINE[info.skill] === line) speed += SPEED.SKILL_MATCH_BP;
    if (info.skill === "All-rounder") speed += SPEED.ALL_ROUNDER_BP;
    if (info.ability === "Quick Hands") speed += SPEED.QUICK_HANDS_BP;
    return speed;
}

// Footprints share an edge or a corner.
function footprintsTouch(a, b) {
    return a.tile_x <= b.tile_x + b.footprint && b.tile_x <= a.tile_x + a.footprint && a.tile_y <= b.tile_y + b.footprint && b.tile_y <= a.tile_y + a.footprint;
}

// Pure staffing decision: returns Map(buildingId -> { staffed, workerId, speedBp, capBp })
// holding every placed row. All ability effects on speed and cap are computed here.
function computeStaffing(placedRows, workerRows, zone) {
    const copies = countCopies(workerRows);
    const owned = ownedAbilitiesOf(workerRows);
    const { generic } = workerCounts(placedRows, owned, zone);

    const candidates = placedRows
        .filter((row) => isProducerRow(row) && row.staff_mode !== "off" && isRowInsideZone(row, zone))
        .sort((a, b) => Number(b.staff_mode === "priority") - Number(a.staff_mode === "priority") || b.level - a.level || a.id - b.id);
    const candidateIds = new Set(candidates.map((row) => row.id));

    // buildingId -> worker row, or null for a generic Villager
    const assignment = new Map();
    const free = [...workerRows].sort((a, b) => a.id - b.id);

    for (const worker of [...free]) {
        const pin = worker.assigned_building_id;
        if (pin !== null && candidateIds.has(pin) && !assignment.has(pin)) {
            assignment.set(pin, worker);
            free.splice(free.indexOf(worker), 1);
        }
    }

    let villagersLeft = generic;
    for (const building of candidates) {
        if (assignment.has(building.id)) continue;
        if (free.length > 0) {
            let best = free[0];
            let bestSpeed = personalSpeedBp(best, building.line, copies);
            for (const worker of free) {
                const speed = personalSpeedBp(worker, building.line, copies);
                if (speed > bestSpeed) {
                    best = worker;
                    bestSpeed = speed;
                }
            }
            assignment.set(building.id, best);
            free.splice(free.indexOf(best), 1);
        } else if (villagersLeft > 0) {
            assignment.set(building.id, null);
            villagersLeft -= 1;
        }
    }

    const cheerleaderSpots = candidates.filter((row) => {
        const worker = assignment.get(row.id);
        return worker && catalogWorker(worker.worker_key)?.ability === "Cheerleader";
    });
    const heroBp = owned.has("Town Hero") ? SPEED.TOWN_HERO_BP : 0;

    const result = new Map();
    for (const row of placedRows) {
        if (!assignment.has(row.id)) {
            result.set(row.id, { staffed: false, workerId: null, speedBp: SPEED.BASE_BP, capBp: 10000 });
            continue;
        }
        const worker = assignment.get(row.id);
        let speedBp = worker ? personalSpeedBp(worker, row.line, copies) : SPEED.BASE_BP;
        speedBp += heroBp;
        const cheering = cheerleaderSpots.filter((spot) => spot.id !== row.id && footprintsTouch(spot, row)).length;
        speedBp += Math.min(SPEED.CHEERLEADER_MAX_BP, cheering * SPEED.CHEERLEADER_BP);
        // Storage grows with speed, so a faster worker pays off even with one collect a day.
        const baseCapBp = worker && catalogWorker(worker.worker_key)?.ability === "Deep Pockets" ? SPEED.DEEP_POCKETS_CAP_BP : 10000;
        const capBp = Math.floor((baseCapBp * speedBp) / 10000);
        result.set(row.id, { staffed: true, workerId: worker ? worker.id : null, speedBp, capBp });
    }
    return result;
}

export async function fetchWorkerRows(db, userId) {
    const { rows } = await db.query("SELECT id, worker_key, assigned_building_id FROM workers WHERE user_id = $1 ORDER BY id", [userId]);
    return rows;
}

export async function reassignWorkers(client, userId) {
    const statsResult = await client.query("SELECT zone_step FROM player_stats WHERE user_id = $1", [userId]);
    const zone = zoneFor(statsResult.rows[0].zone_step);
    const placed = await client.query(`SELECT id, kind, line, level, tile_x, tile_y, footprint, staff_mode FROM buildings WHERE user_id = $1 AND state = 'placed'`, [userId]);
    if (placed.rows.length === 0) return;

    const staffing = computeStaffing(placed.rows, await fetchWorkerRows(client, userId), zone);

    const ids = [];
    const staffed = [];
    const workerIds = [];
    const speeds = [];
    const caps = [];
    for (const [id, staff] of staffing) {
        ids.push(id);
        staffed.push(staff.staffed);
        workerIds.push(staff.workerId);
        speeds.push(staff.speedBp);
        caps.push(staff.capBp);
    }
    await client.query(
        `UPDATE buildings b SET staffed = v.staffed, worker_id = v.worker_id, speed_bp = v.speed_bp, cap_bp = v.cap_bp
         FROM unnest($1::int[], $2::bool[], $3::int[], $4::int[], $5::int[]) AS v(id, staffed, worker_id, speed_bp, cap_bp)
         WHERE b.id = v.id AND b.user_id = $6`,
        [ids, staffed, workerIds, speeds, caps, userId],
    );
}

// ---------------------------------------------------------------------------
// Placement (§5.2)
// ---------------------------------------------------------------------------
export async function fetchOccupied(client, userId, excludeId = null) {
    const { rows } = await client.query(
        `SELECT id, tile_x, tile_y, footprint FROM buildings
         WHERE user_id = $1 AND state = 'placed' AND ($2::int IS NULL OR id <> $2)`,
        [userId, excludeId],
    );
    return rows;
}

function overlapsAny(occupied, tileX, tileY, footprint) {
    return occupied.some((b) => tileX < b.tile_x + b.footprint && b.tile_x < tileX + footprint && tileY < b.tile_y + b.footprint && b.tile_y < tileY + footprint);
}

export function assertPlacement(occupied, zone, tileX, tileY, footprint) {
    if (!isInsideRect({ x: 0, y: 0, w: CFG.MAP_W, h: CFG.MAP_H }, tileX, tileY, footprint)) throw new BuilderError("OUT_OF_MAP", "That spot is off the map.");
    if (!isInsideRect(zone, tileX, tileY, footprint)) throw new BuilderError("OUT_OF_ZONE", "That spot is outside your land.");
    if (overlapsAny(occupied, tileX, tileY, footprint)) throw new BuilderError("OVERLAP", "Something is already there.");
}

export function findFreeSpot(occupied, rect, footprint) {
    for (let tileY = rect.y; tileY <= rect.y + rect.h - footprint; tileY += 1) {
        for (let tileX = rect.x; tileX <= rect.x + rect.w - footprint; tileX += 1) {
            if (!overlapsAny(occupied, tileX, tileY, footprint)) return { tileX, tileY };
        }
    }
    return null;
}

// Legacy pixel x,y that go with a tile position.
export function pixelFor(tile, footprint) {
    return tile * CFG.TILE_SIZE + footprint * (CFG.TILE_SIZE / 2);
}

// ---------------------------------------------------------------------------
// Generating buildings
// ---------------------------------------------------------------------------
// Inserts a Lv1 line building. Returns the row, or null when a unique index (one building
// per task, one stall per day) says it already exists.
export async function insertLineBuilding(client, { userId, line, state, source, sourceTaskId = null, today, content }) {
    const result = await client.query(
        `INSERT INTO buildings (type, asset_key, content, metadata, user_id, kind, line, level, state, footprint, source, source_task_id, generated_on)
         VALUES ('Building', $1, $2, '{}'::jsonb, $3, 'line', $4, 1, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING RETURNING *`,
        [assetKeyFor(line, 1), content, userId, line, state, CFG.FOOTPRINT.line, source, sourceTaskId, today],
    );
    return result.rows[0] || null;
}

export async function countPooled(client, userId) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM buildings WHERE user_id = $1 AND state = 'pooled'`, [userId]);
    return rows[0].n;
}

// §5.9: one pooled row from an earlier local day moves to the inventory. Returns its id, or null.
export async function releaseFromPool(client, stats, userId, today) {
    if (!isNewerDay(today, stats.pool_released_on)) return null;
    const { rows } = await client.query(
        `SELECT id FROM buildings WHERE user_id = $1 AND state = 'pooled' AND generated_on < $2
         ORDER BY generated_on, id LIMIT 1`,
        [userId, today],
    );
    if (rows.length === 0) return null;

    const id = rows[0].id;
    await client.query(`UPDATE buildings SET state = 'inventory', released_on = $1 WHERE id = $2 AND user_id = $3`, [today, id, userId]);
    await addTownXp(client, userId, 1);
    await client.query("UPDATE player_stats SET pool_released_on = $1 WHERE user_id = $2", [today, userId]);
    stats.pool_released_on = today;
    return id;
}

// ---------------------------------------------------------------------------
// The `builder` payload (§4)
// ---------------------------------------------------------------------------
function toBuilding(row, { zone, sleepy, sleepyAt, now }) {
    const isPlaced = row.state === "placed";
    const insideZone = isPlaced && isRowInsideZone(row, zone);
    const needsWorker = isProducerRow(row);
    const isHome = row.kind === "line" && row.line === "habit";
    const earning = needsWorker && isPlaced && row.staffed;

    return {
        id: row.id,
        kind: row.kind,
        line: row.line,
        level: row.level,
        asset_key: row.asset_key,
        state: row.state,
        heritage: row.heritage,
        tileX: row.tile_x,
        tileY: row.tile_y,
        x: row.x,
        y: row.y,
        footprint: row.footprint,
        insideZone,
        staffMode: row.staff_mode,
        staffed: row.staffed,
        workerId: row.worker_id,
        speedBp: row.speed_bp,
        needsWorker,
        beds: isHome && insideZone ? CFG.BEDS[row.level] : 0,
        storedMilli: earning ? settledMilli(row, sleepyAt, now) : row.stored_milli,
        rateMilliPerHour: earning && insideZone && !sleepy ? rateMilliFor(row.level, row.speed_bp) : 0,
        capMilli: needsWorker ? capMilliFor(row.level, row.cap_bp) : 0,
        metadata: row.metadata || {},
    };
}

// Payloads can reach a client out of order, so each carries a number and the client ignores
// any lower than the last one it applied. Same scale as Date.now()*1000 + a counter, but it
// keeps rising if the clock steps back, and a restarted server still starts above the old one.
let lastRev = 0;
function nextRev() {
    lastRev = Math.max(lastRev + 1, Date.now() * 1000);
    return lastRev;
}

export async function fetchBuilderState(db, userId, timeZone = "UTC") {
    // Taken before any read: whichever fetch starts after the latest commit has the highest
    // rev and sees that commit, so the payload a client ends up keeping is never stale.
    const rev = nextRev();
    const now = new Date();
    const today = localDateKey(now, timeZone);

    let statsResult = await db.query("SELECT * FROM player_stats WHERE user_id = $1", [userId]);
    if (statsResult.rows.length === 0) {
        await db.query(`INSERT INTO player_stats (user_id, builder_migrated, last_active_at) VALUES ($1, true, NOW()) ON CONFLICT (user_id) DO NOTHING`, [userId]);
        statsResult = await db.query("SELECT * FROM player_stats WHERE user_id = $1", [userId]);
    }
    const stats = statsResult.rows[0];
    // Same forward-only day the caps are charged against (see rollDailyCounters).
    const capDay = isNewerDay(today, stats.counters_day) ? today : stats.counters_day;

    const buildings = await db.query(`SELECT * FROM buildings WHERE user_id = $1 AND state IN ('placed', 'inventory') ORDER BY id`, [userId]);
    const workerRows = await fetchWorkerRows(db, userId);
    const poolInfo = await db.query(`SELECT COUNT(*)::int AS n, MIN(generated_on) AS oldest FROM buildings WHERE user_id = $1 AND state = 'pooled'`, [userId]);
    const logs = await db.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND reward_coins > 0 AND logged_on = $2`, [userId, capDay]);

    const zone = zoneFor(stats.zone_step);
    const nextZone = ZONES[stats.zone_step + 1] || null;
    const sleepyAt = sleepyAtFor(stats, now);
    const sleepy = now.getTime() >= sleepyAt.getTime();
    const ctx = { zone, sleepy, sleepyAt, now };

    const placedRows = buildings.rows.filter((row) => row.state === "placed");
    const inventoryRows = buildings.rows.filter((row) => row.state === "inventory").sort((a, b) => b.level - a.level || a.id - b.id);

    const placed = placedRows.map((row) => toBuilding(row, ctx));
    const inventory = inventoryRows.map((row) => toBuilding(row, ctx));

    const owned = ownedAbilitiesOf(workerRows);
    const counts = workerCounts(placedRows, owned, zone);
    const copies = countCopies(workerRows);
    const staffedByWorker = new Map();
    for (const row of placedRows) if (row.staffed && row.worker_id !== null) staffedByWorker.set(row.worker_id, row.id);

    const summoned = workerRows.map((row) => {
        const info = catalogWorker(row.worker_key);
        return {
            id: row.id,
            key: row.worker_key,
            name: info?.name ?? row.worker_key,
            rarity: info?.rarity ?? "Normal",
            skill: info?.skill ?? null,
            ability: info?.ability ?? null,
            stars: starsFor(row.worker_key, copies),
            assignedBuildingId: row.assigned_building_id, // the player's pin; null = auto
            buildingId: staffedByWorker.get(row.id) ?? null, // where they're working right now
        };
    });

    const countersAreToday = !isNewerDay(today, stats.counters_day);
    const level = townLevel(stats.town_xp);

    return {
        rev,
        serverNow: now.toISOString(),
        today,
        coins: stats.coins,
        town: { level, xp: stats.town_xp, ...xpBounds(level) },
        zone: {
            step: zone.step,
            x: zone.x,
            y: zone.y,
            w: zone.w,
            h: zone.h,
            next: nextZone ? { step: nextZone.step, x: nextZone.x, y: nextZone.y, w: nextZone.w, h: nextZone.h, townLevel: nextZone.townLevel, cost: nextZone.cost } : null,
        },
        workers: {
            total: counts.generic + workerRows.length,
            used: placedRows.filter((row) => row.staffed).length,
            base: counts.base,
            beds: counts.beds,
            recruiterBonus: counts.recruiterBonus,
            summoned,
            pendingSummons: stats.pending_summons,
            pityIn: Math.max(1, CFG.PITY_AFTER + 1 - stats.summons_since_epic),
        },
        sleepy,
        sleepyAt: sleepyAt.toISOString(),
        today_counts: {
            buildings: countersAreToday ? stats.buildings_today : 0,
            buildingCap: CFG.DAILY_BUILDING_CAP,
            tasksPaid: countersAreToday ? stats.tasks_paid_today : 0,
            tasksPaidCap: CFG.TASK_COINS_PER_DAY,
            logsPaid: logs.rows[0].n,
            logsPaidCap: CFG.LOG_COINS_PER_DAY,
        },
        pool: {
            count: poolInfo.rows[0].n,
            max: CFG.POOL_MAX,
            nextReleaseAvailable: isNewerDay(capDay, stats.pool_released_on) && poolInfo.rows[0].oldest !== null && poolInfo.rows[0].oldest < capDay,
        },
        // What a merge costs this player right now, with Bargainer / Master Builder applied.
        mergeCost: { 1: mergeCostFor(1, owned), 2: mergeCostFor(2, owned) },
        tutorial: { step: stats.tutorial_step, done: stats.tutorial_done },
        placed,
        inventory,
        rules: RULES,
    };
}

export async function emitBuilderState(io, userId, timeZone = "UTC") {
    const state = await fetchBuilderState(pool, userId, timeZone);
    io.to(roomFor(userId)).emit("builder_state", state);
    return state;
}
