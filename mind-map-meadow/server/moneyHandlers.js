import { pool } from "./db.js";
import { recordActivity } from "./activity.js";
import { localDateKey, isRealDate, addDaysToDateKey } from "./timezone.js";
import { withTransaction, lockStatsRow, rollDailyCounters, afterCommit, changeCoins } from "./tx.js";
import { CFG, MAP_RECT } from "./builderRules.js";
import { MONEY_CATEGORIES, categoryNames, subcategoryNames } from "./moneyCategories.js";
import { addTownXp, emitBuilderState, fetchBuilderState, fetchOccupied, findFreeSpot, insertLineBuilding, pixelFor, touchActivity, zoneFor } from "./builderState.js";

const MAX_AMOUNT_CENTS = 100000000;
const LOG_REWARD_COINS = CFG.LOG_COINS;
const REWARDED_LOGS_PER_DAY = CFG.LOG_COINS_PER_DAY;
const MILESTONE_REWARD_COINS = CFG.SAVINGS_MILESTONE_COINS;
const MAX_STAGE = 4;
const MAX_ACTIVE_GOALS = 5;
const MIN_GOAL_TARGET_CENTS = 1000;
const MAX_NEW_GOALS_PER_DAY = 2;
const MAX_BACKDATE_DAYS = 366;

const CATEGORIES = Object.fromEntries(Object.keys(MONEY_CATEGORIES).map((d) => [d, categoryNames(d)]));

function roomFor(userId) {
    return `user:${userId}`;
}

function isValidCents(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_AMOUNT_CENTS;
}

function normalizeCategory(direction, category) {
    if (CATEGORIES[direction].includes(category)) return category;
    return direction === "saving" ? "Savings" : "Other";
}

// Only a subcategory listed under the (already normalised) category is kept.
function normalizeSubcategory(direction, category, subcategory) {
    return typeof subcategory === "string" && subcategoryNames(direction, category).includes(subcategory) ? subcategory : null;
}

function normalizeNote(note) {
    if (typeof note !== "string") return null;
    const trimmed = note.trim().slice(0, 140);
    return trimmed.length > 0 ? trimmed : null;
}

// Works with either the pool or a checked-out client.
export async function fetchMoneyState(db, userId) {
    const transactions = await db.query(
        `SELECT id, amount_cents, direction, category, subcategory, note, occurred_on, reward_coins, savings_goal_id, created_at
         FROM transactions WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY occurred_on DESC, id DESC LIMIT 300`,
        [userId],
    );
    const savingsGoals = await db.query(
        `SELECT g.id, g.title, g.target_cents,
                COALESCE(SUM(t.amount_cents) FILTER (WHERE t.direction = 'saving'), 0)::int AS saved_cents,
                g.deadline, g.stage, g.status, g.building_id, g.created_at
         FROM savings_goals g LEFT JOIN transactions t ON t.savings_goal_id = g.id AND t.deleted_at IS NULL
         WHERE g.user_id = $1 AND g.deleted_at IS NULL
         GROUP BY g.id
         ORDER BY g.status, g.id`,
        [userId],
    );
    return { transactions: transactions.rows, savingsGoals: savingsGoals.rows };
}

async function emitRefreshMoney(io, userId) {
    const stats = await pool.query("SELECT * FROM player_stats WHERE user_id = $1 LIMIT 1", [userId]);
    const money = await fetchMoneyState(pool, userId);
    io.to(roomFor(userId)).emit("refresh_money", { stats: stats.rows[0], ...money });
}

class MoneyValidationError extends Error {}

export function registerMoneyEvents(io, socket) {
    const userId = socket.data.userId;
    const room = roomFor(userId);
    const timeZone = () => socket.data.timezone || "UTC";

    const fail = (message) => socket.emit("money_error", message);

    socket.on("add_transaction", async (payload) => {
        const { amountCents, direction, category, subcategory, note, occurredOn, savingsGoalId } = payload ?? {};

        if (!isValidCents(amountCents)) return fail("Amount must be between 0.01 and 1,000,000.");
        if (!Object.hasOwn(CATEGORIES, direction)) return fail("Unknown transaction type.");

        const today = localDateKey(new Date(), timeZone());
        let occurredDate = today;
        if (occurredOn !== undefined && occurredOn !== null && occurredOn !== "") {
            if (!isRealDate(occurredOn)) return fail("Invalid date.");
            if (occurredOn > today) return fail("Date can't be in the future.");
            if (occurredOn < addDaysToDateKey(today, -MAX_BACKDATE_DAYS)) return fail("Date is too far in the past.");
            occurredDate = occurredOn;
        }

        if (direction === "saving" && !Number.isInteger(savingsGoalId)) return fail("Pick a savings goal.");

        try {
            const now = new Date();
            const outcome = await withTransaction(async (client) => {
                const stats = await lockStatsRow(client, userId);
                await rollDailyCounters(client, stats, today);
                // The forward-only day: reconnecting in a west timezone can't reopen the caps below.
                const capDay = stats.counters_day;

                let goal = null;
                if (direction === "saving") {
                    const goalResult = await client.query(`SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL FOR UPDATE`, [savingsGoalId, userId]);
                    goal = goalResult.rows[0];
                    if (!goal) throw new MoneyValidationError("That savings goal isn't active.");
                }

                // Includes soft-deleted rows on purpose: deleting a log must not free up a rewarded slot.
                const rewardedToday = await client.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND reward_coins > 0 AND logged_on = $2`, [userId, capDay]);
                const logReward = rewardedToday.rows[0].n < REWARDED_LOGS_PER_DAY ? LOG_REWARD_COINS : 0;

                // Includes soft-deleted rows too: "first log of the day" can only happen once a day.
                const loggedToday = await client.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND logged_on = $2`, [userId, capDay]);
                const isFirstLogToday = loggedToday.rows[0].n === 0;

                const cleanCategory = normalizeCategory(direction, category);
                await client.query(
                    `INSERT INTO transactions (user_id, amount_cents, direction, category, subcategory, note, occurred_on, logged_on, reward_coins, savings_goal_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [userId, amountCents, direction, cleanCategory, normalizeSubcategory(direction, cleanCategory, subcategory), normalizeNote(note), occurredDate, capDay, logReward, goal ? goal.id : null],
                );

                const rewards = [];
                if (logReward > 0) rewards.push({ coins: logReward, reason: direction === "saving" ? "Logged savings" : direction === "income" ? "Logged income" : "Logged an expense" });

                let updatedBuilding = null;
                if (goal) {
                    const savedResult = await client.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS saved FROM transactions WHERE savings_goal_id = $1 AND direction = 'saving' AND deleted_at IS NULL`, [goal.id]);
                    const saved = savedResult.rows[0].saved;
                    const newStage = Math.min(MAX_STAGE, Math.floor((saved * MAX_STAGE) / goal.target_cents));

                    if (newStage > goal.stage) {
                        // One paid milestone a day across all goals, so tiny goals can't farm coins.
                        // The building still upgrades straight away.
                        if (stats.savings_paid_on !== capDay) {
                            rewards.push({ coins: MILESTONE_REWARD_COINS, reason: `Savings milestone: ${newStage * 25}%!` });
                            await client.query("UPDATE player_stats SET savings_paid_on = $1 WHERE user_id = $2", [capDay, userId]);
                            stats.savings_paid_on = capDay;
                        }

                        await client.query(`UPDATE savings_goals SET stage = $1, status = $2 WHERE id = $3`, [newStage, newStage >= MAX_STAGE ? "completed" : "active", goal.id]);

                        if (goal.building_id) {
                            const buildingResult = await client.query(
                                `UPDATE buildings SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{stage}', to_jsonb($1::int))
                                 WHERE id = $2 AND user_id = $3 RETURNING id, metadata`,
                                [newStage, goal.building_id, userId],
                            );
                            updatedBuilding = buildingResult.rows[0] || null;
                        }
                    }
                }

                // The day's first log generates a Finance Stall. The amount plays no part in it,
                // and deleting the log later never takes the stall back.
                let stall = null;
                if (isFirstLogToday && stats.buildings_today < CFG.DAILY_BUILDING_CAP) {
                    stall = await insertLineBuilding(client, { userId, line: "finance", state: "inventory", source: "money_log", today: capDay, content: "Daily money log" });
                    if (stall) {
                        await client.query("UPDATE player_stats SET buildings_today = buildings_today + 1 WHERE user_id = $1", [userId]);
                        await addTownXp(client, userId, 1);
                    }
                }

                await touchActivity(client, stats, userId, now);

                const totalCoins = rewards.reduce((sum, r) => sum + r.coins, 0);
                for (const reward of rewards) await changeCoins(client, userId, reward.coins, reward.reason.startsWith("Savings milestone") ? "savings_milestone" : "money_log");

                return { rewards, updatedBuilding, stallId: stall ? stall.id : null };
            });

            await afterCommit("add_transaction", async () => {
                const state = await fetchBuilderState(pool, userId, timeZone());
                const target = io.to(room);
                if (outcome.updatedBuilding) target.emit("building_updated", outcome.updatedBuilding);
                if (outcome.stallId) target.emit("building_generated", { building: state.inventory.find((b) => b.id === outcome.stallId), reason: "money_log" });
                for (const reward of outcome.rewards) target.emit("money_reward", reward);
                target.emit("builder_state", state);
            });
            await afterCommit("add_transaction refresh", () => emitRefreshMoney(io, userId));
            recordActivity(userId, "money", timeZone());
        } catch (err) {
            if (err instanceof MoneyValidationError) return fail(err.message);
            console.error("❌ [Add Transaction Error]:", err.message);
            fail("Couldn't save that. Please try again.");
        }
    });

    socket.on("delete_transaction", async (transactionId) => {
        if (!Number.isInteger(transactionId)) return;
        try {
            const deleted = await withTransaction(async (client) => {
                await lockStatsRow(client, userId);
                // Soft delete: the row keeps counting toward the daily rewarded-log cap.
                const result = await client.query(`UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING reward_coins`, [
                    transactionId,
                    userId,
                ]);
                const row = result.rows[0];
                if (!row) return false;
                // Revoke the logging reward so log/delete can't be used to farm coins.
                // Savings milestone stages (and their coins) are intentionally kept.
                if (row.reward_coins > 0) {
                    await changeCoins(client, userId, -row.reward_coins, "log_revoked", { clampAtZero: true });
                }
                return true;
            });
            if (deleted) {
                await afterCommit("delete_transaction", () => emitBuilderState(io, userId, timeZone()));
                await afterCommit("delete_transaction refresh", () => emitRefreshMoney(io, userId));
            }
        } catch (err) {
            console.error("❌ [Delete Transaction Error]:", err.message);
        }
    });

    socket.on("add_savings_goal", async (payload) => {
        const { targetCents, deadline, title: rawTitle } = payload ?? {};
        const title = typeof rawTitle === "string" ? rawTitle.trim() : "";

        if (title.length < 1 || title.length > 80) return fail("Goal name must be 1–80 characters.");
        if (!isValidCents(targetCents)) return fail("Target must be between 10.00 and 1,000,000.");
        if (targetCents < MIN_GOAL_TARGET_CENTS) return fail("Target must be at least 10.00.");

        const today = localDateKey(new Date(), timeZone());

        let deadlineDate = null;
        if (deadline !== undefined && deadline !== null && deadline !== "") {
            if (!isRealDate(deadline)) return fail("Invalid deadline.");
            if (deadline < today) return fail("Deadline can't be in the past.");
            deadlineDate = deadline;
        }

        try {
            await withTransaction(async (client) => {
                const stats = await lockStatsRow(client, userId);
                await rollDailyCounters(client, stats, today);
                const capDay = stats.counters_day; // forward-only, as in add_transaction

                const activeCount = await client.query(`SELECT COUNT(*)::int AS n FROM savings_goals WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL`, [userId]);
                if (activeCount.rows[0].n >= MAX_ACTIVE_GOALS) throw new MoneyValidationError(`You can have up to ${MAX_ACTIVE_GOALS} active savings goals.`);

                // Includes soft-deleted goals so create/delete can't dodge the daily cap.
                const createdToday = await client.query(`SELECT COUNT(*)::int AS n FROM savings_goals WHERE user_id = $1 AND created_on = $2`, [userId, capDay]);
                if (createdToday.rows[0].n >= MAX_NEW_GOALS_PER_DAY) throw new MoneyValidationError(`You can start up to ${MAX_NEW_GOALS_PER_DAY} new savings goals per day.`);

                const goalResult = await client.query(
                    `INSERT INTO savings_goals (user_id, title, target_cents, deadline, created_on) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [userId, title, targetCents, deadlineDate, capDay],
                );
                const goalId = goalResult.rows[0].id;

                // First free spot inside the zone, else anywhere on the map. A goal is never
                // refused for lack of room; (0,0) only if all 70x50 tiles are taken.
                const footprint = CFG.FOOTPRINT.savings;
                const occupied = await fetchOccupied(client, userId);
                const spot = findFreeSpot(occupied, zoneFor(stats.zone_step), footprint) ?? findFreeSpot(occupied, MAP_RECT, footprint) ?? { tileX: 0, tileY: 0 };

                const buildingResult = await client.query(
                    `INSERT INTO buildings (type, asset_key, x, y, content, metadata, user_id, kind, state, tile_x, tile_y, footprint, source, generated_on)
                     VALUES ('Savings', 'savings_project', $1, $2, $3, $4, $5, 'savings', 'placed', $6, $7, $8, 'savings', $9) RETURNING id`,
                    [pixelFor(spot.tileX, footprint), pixelFor(spot.tileY, footprint), `Savings project: ${title}`, JSON.stringify({ stage: 0, savingsGoalId: goalId }), userId, spot.tileX, spot.tileY, footprint, capDay],
                );

                await client.query("UPDATE savings_goals SET building_id = $1 WHERE id = $2", [buildingResult.rows[0].id, goalId]);
            });

            await afterCommit("savings goal", () => emitBuilderState(io, userId, timeZone()));
            await afterCommit("savings goal refresh", () => emitRefreshMoney(io, userId));
        } catch (err) {
            if (err instanceof MoneyValidationError) return fail(err.message);
            console.error("❌ [Add Savings Goal Error]:", err.message);
            fail("Couldn't create that goal. Please try again.");
        }
    });

    socket.on("delete_savings_goal", async (goalId) => {
        if (!Number.isInteger(goalId)) return;
        try {
            const removedBuildingId = await withTransaction(async (client) => {
                await lockStatsRow(client, userId);
                // Soft delete: the goal keeps counting toward the per-day creation cap.
                const goalResult = await client.query(
                    `UPDATE savings_goals SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING building_id`,
                    [goalId, userId],
                );
                const goal = goalResult.rows[0];
                if (!goal) return undefined;
                if (goal.building_id) {
                    await client.query("DELETE FROM buildings WHERE id = $1 AND user_id = $2", [goal.building_id, userId]);
                }
                return goal.building_id;
            });

            if (removedBuildingId === undefined) return;
            if (removedBuildingId) io.to(room).emit("building_removed", { id: removedBuildingId });
            await afterCommit("savings goal", () => emitBuilderState(io, userId, timeZone()));
            await afterCommit("savings goal refresh", () => emitRefreshMoney(io, userId));
        } catch (err) {
            console.error("❌ [Delete Savings Goal Error]:", err.message);
        }
    });
}
