import { pool } from "./db.js";
import { localDateKey } from "./timezone.js";

const MAX_AMOUNT_CENTS = 100000000;
const LOG_REWARD_COINS = 5;
const REWARDED_LOGS_PER_DAY = 6;
const MILESTONE_REWARD_COINS = 40;
const MAX_STAGE = 4;
const MAX_ACTIVE_GOALS = 5;

const CATEGORIES = {
    expense: ["Food", "Transport", "Shopping", "Bills", "Fun", "Health", "Other"],
    income: ["Salary", "Side Income", "Gift", "Other"],
    saving: ["Savings"],
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function normalizeNote(note) {
    if (typeof note !== "string") return null;
    const trimmed = note.trim().slice(0, 140);
    return trimmed.length > 0 ? trimmed : null;
}

// Works with either the pool or a checked-out client.
export async function fetchMoneyState(db, userId) {
    const transactions = await db.query(
        `SELECT id, amount_cents, direction, category, note, occurred_on, reward_coins, savings_goal_id, created_at
         FROM transactions WHERE user_id = $1
         ORDER BY occurred_on DESC, id DESC LIMIT 300`,
        [userId],
    );
    const savingsGoals = await db.query(
        `SELECT g.id, g.title, g.target_cents,
                COALESCE(SUM(t.amount_cents) FILTER (WHERE t.direction = 'saving'), 0)::int AS saved_cents,
                g.deadline, g.stage, g.status, g.building_id, g.created_at
         FROM savings_goals g LEFT JOIN transactions t ON t.savings_goal_id = g.id
         WHERE g.user_id = $1
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

// Runs fn(client) inside BEGIN/COMMIT, rolling back on any throw.
async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

class MoneyValidationError extends Error {}

// Ensures the user's stats row exists (accounts hit by the old username-default bug
// may lack one) and locks it so the daily reward cap and coin math can't race.
async function lockStatsRow(client, userId) {
    await client.query("INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    await client.query("SELECT id FROM player_stats WHERE user_id = $1 FOR UPDATE", [userId]);
}

export function registerMoneyEvents(io, socket) {
    const userId = socket.data.userId;
    const room = roomFor(userId);
    const timeZone = () => socket.data.timezone || "UTC";

    const fail = (message) => socket.emit("money_error", message);

    socket.on("add_transaction", async (payload = {}) => {
        const { amountCents, direction, category, note, occurredOn, savingsGoalId } = payload;

        if (!isValidCents(amountCents)) return fail("Amount must be between 0.01 and 1,000,000.");
        if (!Object.hasOwn(CATEGORIES, direction)) return fail("Unknown transaction type.");

        const today = localDateKey(new Date(), timeZone());
        let occurredDate = today;
        if (occurredOn !== undefined && occurredOn !== null && occurredOn !== "") {
            if (typeof occurredOn !== "string" || !DATE_PATTERN.test(occurredOn) || Number.isNaN(Date.parse(occurredOn))) return fail("Invalid date.");
            if (occurredOn > today) return fail("Date can't be in the future.");
            occurredDate = occurredOn;
        }

        if (direction === "saving" && !Number.isInteger(savingsGoalId)) return fail("Pick a savings goal.");

        try {
            const outcome = await withTransaction(async (client) => {
                await lockStatsRow(client, userId);

                let goal = null;
                if (direction === "saving") {
                    const goalResult = await client.query(`SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE`, [savingsGoalId, userId]);
                    goal = goalResult.rows[0];
                    if (!goal) throw new MoneyValidationError("That savings goal isn't active.");
                }

                const rewardedToday = await client.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND reward_coins > 0 AND logged_on = $2`, [userId, today]);
                const logReward = rewardedToday.rows[0].n < REWARDED_LOGS_PER_DAY ? LOG_REWARD_COINS : 0;

                await client.query(
                    `INSERT INTO transactions (user_id, amount_cents, direction, category, note, occurred_on, logged_on, reward_coins, savings_goal_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [userId, amountCents, direction, normalizeCategory(direction, category), normalizeNote(note), occurredDate, today, logReward, goal ? goal.id : null],
                );

                const rewards = [];
                if (logReward > 0) rewards.push({ coins: logReward, reason: direction === "saving" ? "Logged savings" : direction === "income" ? "Logged income" : "Logged an expense" });

                let updatedBuilding = null;
                if (goal) {
                    const savedResult = await client.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS saved FROM transactions WHERE savings_goal_id = $1 AND direction = 'saving'`, [goal.id]);
                    const saved = savedResult.rows[0].saved;
                    const newStage = Math.min(MAX_STAGE, Math.floor((saved * MAX_STAGE) / goal.target_cents));

                    if (newStage > goal.stage) {
                        const gained = newStage - goal.stage;
                        rewards.push({ coins: gained * MILESTONE_REWARD_COINS, reason: `Savings milestone: ${newStage * 25}%!` });

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

                const totalCoins = rewards.reduce((sum, r) => sum + r.coins, 0);
                if (totalCoins > 0) await client.query("UPDATE player_stats SET coins = coins + $1 WHERE user_id = $2", [totalCoins, userId]);

                return { rewards, updatedBuilding };
            });

            if (outcome.updatedBuilding) io.to(room).emit("building_updated", outcome.updatedBuilding);
            for (const reward of outcome.rewards) io.to(room).emit("money_reward", reward);
            await emitRefreshMoney(io, userId);
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
                const result = await client.query(`DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING reward_coins`, [transactionId, userId]);
                const row = result.rows[0];
                if (!row) return false;
                // Revoke the logging reward so log/delete can't be used to farm coins.
                // Savings milestone stages (and their coins) are intentionally kept.
                if (row.reward_coins > 0) {
                    await client.query("UPDATE player_stats SET coins = GREATEST(coins - $1, 0) WHERE user_id = $2", [row.reward_coins, userId]);
                }
                return true;
            });
            if (deleted) await emitRefreshMoney(io, userId);
        } catch (err) {
            console.error("❌ [Delete Transaction Error]:", err.message);
        }
    });

    socket.on("add_savings_goal", async (payload = {}) => {
        const { targetCents, deadline } = payload;
        const title = typeof payload.title === "string" ? payload.title.trim() : "";

        if (title.length < 1 || title.length > 80) return fail("Goal name must be 1–80 characters.");
        if (!isValidCents(targetCents)) return fail("Target must be between 0.01 and 1,000,000.");

        let deadlineDate = null;
        if (deadline !== undefined && deadline !== null && deadline !== "") {
            if (typeof deadline !== "string" || !DATE_PATTERN.test(deadline) || Number.isNaN(Date.parse(deadline))) return fail("Invalid deadline.");
            deadlineDate = deadline;
        }

        try {
            const building = await withTransaction(async (client) => {
                await lockStatsRow(client, userId);

                const activeCount = await client.query(`SELECT COUNT(*)::int AS n FROM savings_goals WHERE user_id = $1 AND status = 'active'`, [userId]);
                if (activeCount.rows[0].n >= MAX_ACTIVE_GOALS) throw new MoneyValidationError(`You can have up to ${MAX_ACTIVE_GOALS} active savings goals.`);

                const goalResult = await client.query(`INSERT INTO savings_goals (user_id, title, target_cents, deadline) VALUES ($1, $2, $3, $4) RETURNING id`, [
                    userId,
                    title,
                    targetCents,
                    deadlineDate,
                ]);
                const goalId = goalResult.rows[0].id;

                const gridX = Math.floor(Math.random() * (25 - 4) + 4);
                const gridY = Math.floor(Math.random() * (18 - 4) + 4);
                const buildingResult = await client.query(
                    `INSERT INTO buildings (type, asset_key, x, y, content, metadata, user_id)
                     VALUES ('Savings', 'savings_project', $1, $2, $3, $4, $5) RETURNING *`,
                    [gridX * 48 + 24, gridY * 48 + 24, `Savings project: ${title}`, JSON.stringify({ stage: 0, savingsGoalId: goalId }), userId],
                );
                const newBuilding = buildingResult.rows[0];

                await client.query("UPDATE savings_goals SET building_id = $1 WHERE id = $2", [newBuilding.id, goalId]);
                return newBuilding;
            });

            io.to(room).emit("building_spawned", building);
            await emitRefreshMoney(io, userId);
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
                const goalResult = await client.query(`DELETE FROM savings_goals WHERE id = $1 AND user_id = $2 RETURNING building_id`, [goalId, userId]);
                const goal = goalResult.rows[0];
                if (!goal) return undefined;
                if (goal.building_id) {
                    await client.query("DELETE FROM buildings WHERE id = $1 AND user_id = $2", [goal.building_id, userId]);
                }
                return goal.building_id;
            });

            if (removedBuildingId === undefined) return;
            if (removedBuildingId) io.to(room).emit("building_removed", { id: removedBuildingId });
            await emitRefreshMoney(io, userId);
        } catch (err) {
            console.error("❌ [Delete Savings Goal Error]:", err.message);
        }
    });
}
