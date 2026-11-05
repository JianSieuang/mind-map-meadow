// Socket events of the Builder Loop (docs/BUILDER_LOOP_CONTRACT.md §5, §6).
import { pool } from "./db.js";
import { withTransaction, lockStatsRow, rollDailyCounters, isNewerDay, afterCommit } from "./tx.js";
import { localDateKey } from "./timezone.js";
import { townLevel } from "./rewards.js";
import { triggerLlamaBrainDecision } from "./aiBrain.js";
import { CFG, ZONES, EARLY_BIRD_COINS, MAX_STARS, assetKeyFor, mergeCostFor, rollSummon } from "./builderRules.js";
import {
    BuilderError,
    roomFor,
    zoneFor,
    settleAll,
    reassignWorkers,
    addTownXp,
    debitCoins,
    creditCoins,
    isSleepy,
    fetchOccupied,
    fetchWorkerRows,
    ownedAbilitiesOf,
    assertPlacement,
    findFreeSpot,
    pixelFor,
    releaseFromPool,
    fetchBuilderState,
} from "./builderState.js";

const MAX_INT4 = 2147483647;
const STAFF_MODES = ["auto", "priority", "off"];
const MAX_TUTORIAL_STEP = 20;

function isId(value) {
    return Number.isInteger(value) && value > 0 && value <= MAX_INT4;
}

// A malformed payload never reaches the database. Tiles only have to be integers here:
// range problems get the more useful OUT_OF_MAP / OUT_OF_ZONE from assertPlacement.
function asPayload(raw) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new BuilderError("BAD_PAYLOAD", "Bad request.");
    return raw;
}

function requireId(value) {
    if (!isId(value)) throw new BuilderError("BAD_PAYLOAD", "Bad request.");
    return value;
}

function requireTile(value) {
    if (!Number.isInteger(value)) throw new BuilderError("BAD_PAYLOAD", "Bad request.");
    return value;
}

function validatePlacementPayload(raw) {
    const { buildingId, tileX, tileY } = asPayload(raw);
    return { buildingId: requireId(buildingId), tileX: requireTile(tileX), tileY: requireTile(tileY) };
}

async function ownedBuilding(client, userId, buildingId) {
    const { rows } = await client.query("SELECT * FROM buildings WHERE id = $1 AND user_id = $2", [buildingId, userId]);
    if (rows.length === 0) throw new BuilderError("NOT_FOUND", "That building doesn't exist.");
    return rows[0];
}

function isInsideZone(row, zone) {
    return row.tile_x >= zone.x && row.tile_x + row.footprint <= zone.x + zone.w && row.tile_y >= zone.y && row.tile_y + row.footprint <= zone.y + zone.h;
}

function assertProducer(row) {
    if (row.state !== "placed") throw new BuilderError("NOT_PLACED", "Place that building first.");
    if (row.kind !== "line" || row.line === "habit") throw new BuilderError("MISMATCH", "That building doesn't need a worker.");
}

// Takes `k = floor(stored/1000)` coins out of the given rows. Returns [{ id, coins }] for rows that paid.
async function collectRows(client, userId, rows) {
    const items = [];
    for (const row of rows) {
        const coins = Math.floor(row.stored_milli / 1000);
        if (coins <= 0) continue;
        await client.query("UPDATE buildings SET stored_milli = stored_milli - $1 WHERE id = $2 AND user_id = $3", [coins * 1000, row.id, userId]);
        items.push({ id: row.id, coins });
    }
    return items;
}

// §5.9: a visit. Also the moment freshly migrated or otherwise stale towns get staffed,
// since a player who only looks at their town wouldn't trigger any other reassign.
export async function runVisit(io, userId, timeZone) {
    const now = new Date();
    const today = localDateKey(now, timeZone);
    const releasedId = await withTransaction(async (client) => {
        const stats = await lockStatsRow(client, userId);
        await rollDailyCounters(client, stats, today);
        await settleAll(client, userId, now);
        const released = await releaseFromPool(client, stats, userId, stats.counters_day);
        await reassignWorkers(client, userId);
        return released;
    });

    const state = await fetchBuilderState(pool, userId, timeZone);
    if (releasedId) {
        const room = io.to(roomFor(userId));
        room.emit("building_generated", { building: state.inventory.find((b) => b.id === releasedId), reason: "catch_up" });
        room.emit("builder_state", state);
    }
    return state;
}

export function registerBuilderEvents(io, socket, gameContext) {
    const userId = socket.data.userId;
    const room = roomFor(userId);
    const timeZone = () => socket.data.timezone || "UTC";

    const sendError = (err) => {
        if (err instanceof BuilderError) {
            socket.emit("builder_error", { code: err.code, message: err.message });
            return;
        }
        console.error("❌ [Builder Error]:", err.message);
        socket.emit("builder_error", { code: "SERVER", message: "Something went wrong. Please try again." });
    };

    // Every mutation has the same shape (§5.1): validate, lock, roll counters, settle,
    // mutate, reassign, commit, then fx events followed by the full builder_state.
    // `apply` returns a function that turns the fresh state into [event, payload] pairs.
    const mutation = (event, validate, apply) => {
        socket.on(event, async (raw) => {
            try {
                const payload = validate(raw);
                const now = new Date();
                const today = localDateKey(now, timeZone());

                const fx = await withTransaction(async (client) => {
                    const stats = await lockStatsRow(client, userId);
                    await rollDailyCounters(client, stats, today);
                    await settleAll(client, userId, now);
                    // stats.counters_day, not the raw local date: it only moves forward, so
                    // reconnecting in a west timezone can't reopen a day's caps.
                    const out = await apply(client, stats, payload, { now, today: stats.counters_day });
                    await reassignWorkers(client, userId);
                    return out;
                });

                await afterCommit(event, async () => {
                    const state = await fetchBuilderState(pool, userId, timeZone());
                    const target = io.to(room);
                    if (fx) for (const [name, data] of fx(state)) target.emit(name, data);
                    target.emit("builder_state", state);
                });
            } catch (err) {
                sendError(err);
            }
        });
    };

    const noPayload = () => ({});

    socket.on("request_builder_state", async () => {
        try {
            socket.emit("builder_state", await fetchBuilderState(pool, userId, timeZone()));
        } catch (err) {
            sendError(err);
        }
    });

    mutation("place_building", validatePlacementPayload, async (client, stats, { buildingId, tileX, tileY }, { now }) => {
        const row = await ownedBuilding(client, userId, buildingId);
        if (row.state !== "inventory") throw new BuilderError("NOT_IN_INVENTORY", "That building isn't in your inventory.");
        assertPlacement(await fetchOccupied(client, userId), zoneFor(stats.zone_step), tileX, tileY, row.footprint);
        await client.query(`UPDATE buildings SET state = 'placed', tile_x = $1, tile_y = $2, x = $3, y = $4, accrued_at = $5 WHERE id = $6 AND user_id = $7`, [
            tileX,
            tileY,
            pixelFor(tileX, row.footprint),
            pixelFor(tileY, row.footprint),
            now,
            buildingId,
            userId,
        ]);
    });

    mutation("auto_place", noPayload, async (client, stats, _payload, { now }) => {
        const { rows: inventory } = await client.query(`SELECT id, footprint FROM buildings WHERE user_id = $1 AND state = 'inventory' ORDER BY level DESC NULLS LAST, id ASC`, [userId]);
        const occupied = await fetchOccupied(client, userId);
        const zone = zoneFor(stats.zone_step);

        let placed = 0;
        for (const row of inventory) {
            const spot = findFreeSpot(occupied, zone, row.footprint);
            if (!spot) break;
            await client.query(`UPDATE buildings SET state = 'placed', tile_x = $1, tile_y = $2, x = $3, y = $4, accrued_at = $5 WHERE id = $6 AND user_id = $7`, [
                spot.tileX,
                spot.tileY,
                pixelFor(spot.tileX, row.footprint),
                pixelFor(spot.tileY, row.footprint),
                now,
                row.id,
                userId,
            ]);
            occupied.push({ id: row.id, tile_x: spot.tileX, tile_y: spot.tileY, footprint: row.footprint });
            placed += 1;
        }

        return () => [["auto_place_done", { placed, remaining: inventory.length - placed }]];
    });

    mutation("move_building", validatePlacementPayload, async (client, stats, { buildingId, tileX, tileY }) => {
        const row = await ownedBuilding(client, userId, buildingId);
        if (row.state !== "placed") throw new BuilderError("NOT_PLACED", "That building isn't on the map.");
        assertPlacement(await fetchOccupied(client, userId, buildingId), zoneFor(stats.zone_step), tileX, tileY, row.footprint);
        await client.query(`UPDATE buildings SET tile_x = $1, tile_y = $2, x = $3, y = $4 WHERE id = $5 AND user_id = $6`, [
            tileX,
            tileY,
            pixelFor(tileX, row.footprint),
            pixelFor(tileY, row.footprint),
            buildingId,
            userId,
        ]);
    });

    mutation(
        "merge_buildings",
        (raw) => {
            const { targetId, sourceId } = asPayload(raw);
            requireId(targetId);
            requireId(sourceId);
            if (targetId === sourceId) throw new BuilderError("BAD_PAYLOAD", "Pick two different buildings.");
            return { targetId, sourceId };
        },
        async (client, stats, { targetId, sourceId }) => {
            const target = await ownedBuilding(client, userId, targetId);
            const source = await ownedBuilding(client, userId, sourceId);

            if (target.state !== "placed" || source.state !== "placed") throw new BuilderError("NOT_PLACED", "Both buildings must be on the map.");
            if (target.kind !== "line" || source.kind !== "line" || target.line !== source.line || target.level !== source.level) throw new BuilderError("MISMATCH", "Only two of the same building can merge.");
            if (target.level >= 3) throw new BuilderError("MAX_LEVEL", "That building is already at its top level.");

            const level = target.level;
            if (townLevel(stats.town_xp) < CFG.MERGE_TOWN_LEVEL[level]) throw new BuilderError("TOWN_LEVEL", `That merge needs town level ${CFG.MERGE_TOWN_LEVEL[level]}.`);

            const cost = mergeCostFor(level, ownedAbilitiesOf(await fetchWorkerRows(client, userId)));
            await debitCoins(client, userId, cost);

            await client.query(`UPDATE buildings SET level = $1, asset_key = $2, stored_milli = stored_milli + $3 WHERE id = $4 AND user_id = $5`, [
                level + 1,
                assetKeyFor(target.line, level + 1),
                source.stored_milli,
                targetId,
                userId,
            ]);
            await client.query(
                `UPDATE buildings SET state = 'merged', merged_into = $1, tile_x = NULL, tile_y = NULL, x = NULL, y = NULL,
                        stored_milli = 0, staffed = false, worker_id = NULL, speed_bp = 10000, cap_bp = 10000
                 WHERE id = $2 AND user_id = $3`,
                [targetId, sourceId, userId],
            );
            // The retired building can never be a candidate again, so its pin would only linger.
            await client.query("UPDATE workers SET assigned_building_id = NULL WHERE user_id = $1 AND assigned_building_id = $2", [userId, sourceId]);
            await addTownXp(client, userId, CFG.MERGE_TOWN_XP[level]);

            return (state) => [["merge_done", { building: state.placed.find((b) => b.id === targetId), retiredId: sourceId, cost }]];
        },
    );

    mutation(
        "collect",
        (raw) => ({ buildingId: requireId(asPayload(raw).buildingId) }),
        async (client, _stats, { buildingId }) => {
            const row = await ownedBuilding(client, userId, buildingId);
            if (row.state !== "placed") throw new BuilderError("NOT_PLACED", "That building isn't on the map.");
            const items = await collectRows(client, userId, [row]);
            const total = items.reduce((sum, item) => sum + item.coins, 0);
            await creditCoins(client, userId, total);
            return () => [["coins_collected", { total, items }]];
        },
    );

    mutation("collect_all", noPayload, async (client, stats, _payload, { now, today }) => {
        const { rows } = await client.query(`SELECT id, stored_milli FROM buildings WHERE user_id = $1 AND state = 'placed' AND stored_milli >= 1000 ORDER BY id`, [userId]);
        const items = await collectRows(client, userId, rows);
        let total = items.reduce((sum, item) => sum + item.coins, 0);

        // Early Bird: abilities never produce coins while the town is asleep.
        let bonus = 0;
        if (total > 0 && !isSleepy(stats, now) && isNewerDay(today, stats.early_bird_on) && ownedAbilitiesOf(await fetchWorkerRows(client, userId)).has("Early Bird")) {
            bonus = EARLY_BIRD_COINS;
            total += bonus;
            await client.query("UPDATE player_stats SET early_bird_on = $1 WHERE user_id = $2", [today, userId]);
        }
        await creditCoins(client, userId, total);

        const releasedId = await releaseFromPool(client, stats, userId, today);

        return (state) => {
            const events = [["coins_collected", { total, items, bonus }]];
            if (releasedId) events.push(["building_generated", { building: state.inventory.find((b) => b.id === releasedId), reason: "catch_up" }]);
            return events;
        };
    });

    mutation(
        "set_staff_mode",
        (raw) => {
            const { buildingId, mode } = asPayload(raw);
            if (typeof mode !== "string" || !STAFF_MODES.includes(mode)) throw new BuilderError("BAD_PAYLOAD", "Bad request.");
            return { buildingId: requireId(buildingId), mode };
        },
        async (client, _stats, { buildingId, mode }) => {
            assertProducer(await ownedBuilding(client, userId, buildingId));
            await client.query("UPDATE buildings SET staff_mode = $1 WHERE id = $2 AND user_id = $3", [mode, buildingId, userId]);
        },
    );

    mutation("expand_zone", noPayload, async (client, stats) => {
        const next = ZONES[stats.zone_step + 1];
        if (!next) throw new BuilderError("MAX_ZONE", "You've unlocked all the land there is.");
        if (townLevel(stats.town_xp) < next.townLevel) throw new BuilderError("TOWN_LEVEL", `Expanding needs town level ${next.townLevel}.`);
        await debitCoins(client, userId, next.cost);
        await client.query("UPDATE player_stats SET zone_step = $1 WHERE user_id = $2", [next.step, userId]);
        return () => [["zone_expanded", { step: next.step, zone: { x: next.x, y: next.y, w: next.w, h: next.h } }]];
    });

    mutation("open_summon", noPayload, async (client, stats) => {
        if (stats.pending_summons <= 0) throw new BuilderError("NO_SUMMON", "No summons to open.");

        const rolled = rollSummon(stats.summons_since_epic);
        const before = await client.query("SELECT COUNT(*)::int AS n FROM workers WHERE user_id = $1 AND worker_key = $2", [userId, rolled.key]);
        const copiesBefore = before.rows[0].n;

        const inserted = await client.query("INSERT INTO workers (user_id, worker_key) VALUES ($1, $2) RETURNING id", [userId, rolled.key]);
        const isEpicOrBetter = rolled.rarity === "Epic" || rolled.rarity === "Legendary";
        const remaining = stats.pending_summons - 1;
        await client.query("UPDATE player_stats SET pending_summons = $1, summons_since_epic = $2 WHERE user_id = $3", [remaining, isEpicOrBetter ? 0 : stats.summons_since_epic + 1, userId]);

        const stars = Math.min(MAX_STARS, copiesBefore);
        const worker = { id: inserted.rows[0].id, key: rolled.key, name: rolled.name, rarity: rolled.rarity, skill: rolled.skill, ability: rolled.ability, stars };
        return () => [["summon_result", { worker, isDuplicate: copiesBefore > 0, stars, remaining }]];
    });

    mutation(
        "assign_worker",
        (raw) => {
            const { workerId, buildingId } = asPayload(raw);
            requireId(workerId);
            if (buildingId !== null) requireId(buildingId);
            return { workerId, buildingId };
        },
        async (client, stats, { workerId, buildingId }) => {
            const worker = await client.query("SELECT id FROM workers WHERE id = $1 AND user_id = $2", [workerId, userId]);
            if (worker.rows.length === 0) throw new BuilderError("NOT_FOUND", "That worker doesn't exist.");

            if (buildingId !== null) {
                const row = await ownedBuilding(client, userId, buildingId);
                assertProducer(row);
                if (!isInsideZone(row, zoneFor(stats.zone_step))) throw new BuilderError("OUT_OF_ZONE", "That building is outside your land.");
                await client.query("UPDATE workers SET assigned_building_id = NULL WHERE user_id = $1 AND assigned_building_id = $2", [userId, buildingId]);
            }
            await client.query("UPDATE workers SET assigned_building_id = $1 WHERE id = $2 AND user_id = $3", [buildingId, workerId, userId]);
        },
    );

    mutation(
        "purchase_building",
        (raw) => {
            const { assetKey, tileX, tileY } = asPayload(raw);
            if (typeof assetKey !== "string" || !Object.hasOwn(CFG.SHOP, assetKey)) throw new BuilderError("UNKNOWN_ITEM", "That item isn't in the shop.");
            return { assetKey, tileX: requireTile(tileX), tileY: requireTile(tileY) };
        },
        async (client, stats, { assetKey, tileX, tileY }, { now }) => {
            const footprint = CFG.FOOTPRINT.decoration;
            assertPlacement(await fetchOccupied(client, userId), zoneFor(stats.zone_step), tileX, tileY, footprint);
            const price = CFG.SHOP[assetKey];
            await debitCoins(client, userId, price);
            await client.query(
                `INSERT INTO buildings (type, asset_key, x, y, content, metadata, user_id, kind, state, tile_x, tile_y, footprint, source, accrued_at)
                 VALUES ('Decoration', $1, $2, $3, $4, $5, $6, 'decoration', 'placed', $7, $8, $9, 'purchase', $10)`,
                [assetKey, pixelFor(tileX, footprint), pixelFor(tileY, footprint), `Purchased ${assetKey}`, JSON.stringify({ purchase_price: price, purchased_at: now }), userId, tileX, tileY, footprint, now],
            );
            // Runs after COMMIT, so the AI sees the new decoration.
            return () => {
                triggerLlamaBrainDecision(io.to(room), gameContext, userId);
                return [];
            };
        },
    );

    // Pays nothing and changes nothing else, so it skips the settle/reassign path.
    socket.on("set_tutorial", async (raw) => {
        try {
            const { step, done } = asPayload(raw);
            if (!Number.isInteger(step) || step < 0 || step > MAX_TUTORIAL_STEP || typeof done !== "boolean") throw new BuilderError("BAD_PAYLOAD", "Bad request.");
            await pool.query("UPDATE player_stats SET tutorial_step = $1, tutorial_done = $2 WHERE user_id = $3", [step, done, userId]);
            io.to(room).emit("builder_state", await fetchBuilderState(pool, userId, timeZone()));
        } catch (err) {
            sendError(err);
        }
    });
}
