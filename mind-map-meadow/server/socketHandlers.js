import { pool } from "./db.js";
import { triggerLlamaBrainDecision } from "./aiBrain.js";
import { generateTodayInstances } from "./recurringTasks.js";
import { localDateKey, isRealDate } from "./timezone.js";
import { withTransaction, lockStatsRow, rollDailyCounters } from "./tx.js";
import { CFG, lineForTask } from "./builderRules.js";
import { addTownXp, countPooled, fetchBuilderState, insertLineBuilding, touchActivity } from "./builderState.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MAX_TITLE_LENGTH = 255;
const MAX_CATEGORY_LENGTH = 50;
const DEFAULT_MINUTES = 30;
const MAX_MINUTES = 365 * 24 * 60;
const MAX_INT4 = 2147483647;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isId(value) {
    return Number.isInteger(value) && value > 0 && value <= MAX_INT4;
}

function isValidTitle(title) {
    return typeof title === "string" && title.trim().length > 0 && title.length <= MAX_TITLE_LENGTH && !title.includes("\u0000");
}

// A bounded label rather than a fixed list: older tasks hold other categories, the edit form
// sends them straight back, and lineForTask already maps anything unknown to a safe line.
function isValidCategory(category) {
    return typeof category === "string" && category.trim().length > 0 && category.length <= MAX_CATEGORY_LENGTH && !CONTROL_CHARS.test(category);
}

function isValidMinutes(minutes) {
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES;
}

function isValidDays(days) {
    return Array.isArray(days) && days.length <= ALL_DAYS.length && new Set(days).size === days.length && days.every((day) => ALL_DAYS.includes(day));
}

function isValidOptionalTime(time) {
    return time === undefined || time === null || time === "" || (typeof time === "string" && CLOCK_TIME.test(time));
}

// Each returns what's wrong with the payload in the player's words, or null if it's fine.
function taskFieldsError({ title, category, due_date, estimated_minutes }) {
    if (!isValidTitle(title)) return `A task needs a title of up to ${MAX_TITLE_LENGTH} characters.`;
    if (!isValidCategory(category)) return "Pick a category for this task.";
    if (!isRealDate(due_date)) return "Pick a valid deadline for this task.";
    if (estimated_minutes !== undefined && estimated_minutes !== null && !isValidMinutes(estimated_minutes)) return "The duration must be between 1 minute and 1 year.";
    return null;
}

function habitFieldsError({ title, category, estimated_minutes, days_of_week, start_time, end_time }) {
    if (!isValidTitle(title)) return `A daily task needs a title of up to ${MAX_TITLE_LENGTH} characters.`;
    if (!isValidCategory(category)) return "Pick a category for this daily task.";
    if (estimated_minutes !== undefined && estimated_minutes !== null && !isValidMinutes(estimated_minutes)) return "The duration must be between 1 minute and 1 year.";
    if (days_of_week !== undefined && days_of_week !== null && !isValidDays(days_of_week)) return "Those days of the week aren't valid.";
    if (!isValidOptionalTime(start_time) || !isValidOptionalTime(end_time)) return "Those times aren't valid.";
    return null;
}

function roomFor(userId) {
    return `user:${userId}`;
}

async function emitRefreshData(io, userId) {
    const freshStats = await pool.query("SELECT * FROM player_stats WHERE user_id = $1 LIMIT 1", [userId]);
    const allTasks = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date ASC, id ASC", [userId]);
    io.to(roomFor(userId)).emit("refresh_data", { stats: freshStats.rows[0], tasks: allTasks.rows });
}

async function emitRefreshRecurringTasks(io, userId) {
    const recurringTasks = await pool.query("SELECT * FROM recurring_tasks WHERE user_id = $1 ORDER BY id ASC", [userId]);
    io.to(roomFor(userId)).emit("refresh_recurring_tasks", { recurringTasks: recurringTasks.rows });
}

export function registerSocketEvents(io, socket, gameContext) {
    const userId = socket.data.userId;
    const room = roomFor(userId);
    const timeZone = () => socket.data.timezone || "UTC";
    const rejectPayload = (message) => socket.emit("builder_error", { code: "BAD_PAYLOAD", message });

    socket.on("complete_task", async (taskId) => {
        if (!isId(taskId)) return;
        try {
            const now = new Date();
            const today = localDateKey(now, timeZone());

            const outcome = await withTransaction(async (client) => {
                const stats = await lockStatsRow(client, userId);
                await rollDailyCounters(client, stats, today);
                const capDay = stats.counters_day; // forward-only, unlike the raw local date

                // Claim the task atomically so a double-click/second tab can't pay out twice.
                const claim = await client.query(
                    `UPDATE tasks SET status = 'completed', completed_at = NOW()
                     WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
                    [taskId, userId],
                );
                if (claim.rows.length === 0) return null;
                const task = claim.rows[0];

                const line = lineForTask(task);
                const coins = stats.tasks_paid_today < CFG.TASK_COINS_PER_DAY ? CFG.TASK_COINS : 0;
                const content = `Goal Archive: Completed "${task.title}"`;

                let building = null;
                let placedIn = "none";
                let generatedToday = 0;
                let poolCount = 0;
                let poolFull = false;

                if (stats.buildings_today < CFG.DAILY_BUILDING_CAP) {
                    building = await insertLineBuilding(client, { userId, line, state: "inventory", source: "task", sourceTaskId: task.id, today: capDay, content });
                    if (building) {
                        placedIn = "inventory";
                        generatedToday = 1;
                        await addTownXp(client, userId, 1);
                    }
                } else {
                    poolCount = await countPooled(client, userId);
                    if (poolCount < CFG.POOL_MAX) {
                        building = await insertLineBuilding(client, { userId, line, state: "pooled", source: "task", sourceTaskId: task.id, today: capDay, content });
                        if (building) {
                            placedIn = "pooled";
                            poolCount += 1;
                        }
                    } else {
                        poolFull = true;
                    }
                }

                await touchActivity(client, stats, userId, now);

                await client.query("UPDATE tasks SET building_id = $1, coins_earned = $2 WHERE id = $3 AND user_id = $4", [building ? building.id : null, coins, task.id, userId]);

                const calorieReward = task.category === "Fitness" ? 350 : 0;
                const paidIncrement = coins > 0 ? 1 : 0;
                const updated = await client.query(
                    `UPDATE player_stats
                     SET coins = coins + $1, calories_burned = calories_burned + $2,
                         tasks_paid_today = tasks_paid_today + $3, buildings_today = buildings_today + $4
                     WHERE user_id = $5 RETURNING tasks_paid_today`,
                    [coins, calorieReward, paidIncrement, generatedToday, userId],
                );

                return { taskId: task.id, coins, line, building, placedIn, poolCount, poolFull, paidToday: updated.rows[0].tasks_paid_today };
            });

            if (!outcome) return;

            const state = await fetchBuilderState(pool, userId, timeZone());
            const target = io.to(room);
            if (outcome.placedIn === "inventory") {
                target.emit("building_generated", { building: state.inventory.find((b) => b.id === outcome.building.id), reason: "task" });
            } else if (outcome.placedIn === "pooled") {
                target.emit("building_pooled", { line: outcome.line, poolCount: outcome.poolCount, poolMax: CFG.POOL_MAX });
            }
            target.emit("task_reward", {
                taskId: outcome.taskId,
                coins: outcome.coins,
                paidToday: outcome.paidToday,
                building: outcome.placedIn,
                line: outcome.line,
                ...(outcome.poolFull ? { pool_full: true } : {}),
            });
            target.emit("builder_state", state);
            await emitRefreshData(io, userId);

            // Trigger AI Brain to comment on task completion
            triggerLlamaBrainDecision(io.to(room), gameContext, userId);
        } catch (err) {
            console.error("❌ [Task Completion Error]:", err.message);
        }
    });

    socket.on("add_task", async (payload) => {
        const { title, category, due_date, estimated_minutes } = payload ?? {};
        const problem = taskFieldsError({ title, category, due_date, estimated_minutes });
        if (problem) return rejectPayload(problem);
        try {
            await pool.query(`INSERT INTO tasks (title, category, due_date, estimated_minutes, user_id) VALUES ($1, $2, $3, $4, $5)`, [
                title,
                category,
                due_date,
                estimated_minutes ?? DEFAULT_MINUTES,
                userId,
            ]);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Add Task Error]:", err.message);
        }
    });

    socket.on("edit_task", async (payload) => {
        const { id, title, category, due_date, estimated_minutes } = payload ?? {};
        if (!isId(id)) return;
        const problem = taskFieldsError({ title, category, due_date, estimated_minutes });
        if (problem) return rejectPayload(problem);
        try {
            await pool.query(`UPDATE tasks SET title = $1, category = $2, due_date = $3, estimated_minutes = $4 WHERE id = $5 AND status = 'pending' AND user_id = $6`, [
                title,
                category,
                due_date,
                estimated_minutes ?? DEFAULT_MINUTES,
                id,
                userId,
            ]);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Edit Task Error]:", err.message);
        }
    });

    // Only the task row goes: its building stays, and source_task_id falls to NULL through
    // the FK. Coins and daily counters are untouched, so this can't free up a paid slot.
    socket.on("delete_task", async (taskId) => {
        if (!isId(taskId)) return;
        try {
            await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [taskId, userId]);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Delete Task Error]:", err.message);
        }
    });

    socket.on("add_recurring_task", async (payload) => {
        const { title, category, estimated_minutes, days_of_week, start_time, end_time } = payload ?? {};
        const problem = habitFieldsError({ title, category, estimated_minutes, days_of_week, start_time, end_time });
        if (problem) return rejectPayload(problem);
        try {
            await pool.query(`INSERT INTO recurring_tasks (title, category, estimated_minutes, days_of_week, start_time, end_time, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                title,
                category,
                estimated_minutes ?? DEFAULT_MINUTES,
                days_of_week && days_of_week.length ? days_of_week : ALL_DAYS,
                start_time || "07:00",
                end_time || "08:00",
                userId,
            ]);
            await generateTodayInstances(userId);
            await emitRefreshRecurringTasks(io, userId);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Add Recurring Task Error]:", err.message);
        }
    });

    socket.on("edit_recurring_task", async (payload) => {
        const { id, title, category, estimated_minutes, days_of_week, start_time, end_time } = payload ?? {};
        if (!isId(id)) return;
        const problem = habitFieldsError({ title, category, estimated_minutes, days_of_week, start_time, end_time });
        if (problem) return rejectPayload(problem);
        try {
            await pool.query(`UPDATE recurring_tasks SET title = $1, category = $2, estimated_minutes = $3, days_of_week = $4, start_time = $5, end_time = $6 WHERE id = $7 AND user_id = $8`, [
                title,
                category,
                estimated_minutes ?? DEFAULT_MINUTES,
                days_of_week && days_of_week.length ? days_of_week : ALL_DAYS,
                start_time || "07:00",
                end_time || "08:00",
                id,
                userId,
            ]);
            await emitRefreshRecurringTasks(io, userId);
        } catch (err) {
            console.error("❌ [Edit Recurring Task Error]:", err.message);
        }
    });

    socket.on("toggle_recurring_task", async (payload) => {
        const { id, active } = payload ?? {};
        if (!isId(id) || typeof active !== "boolean") return;
        try {
            await pool.query(`UPDATE recurring_tasks SET active = $1 WHERE id = $2 AND user_id = $3`, [active, id, userId]);
            if (active) await generateTodayInstances(userId);
            await emitRefreshRecurringTasks(io, userId);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Toggle Recurring Task Error]:", err.message);
        }
    });

    socket.on("delete_recurring_task", async (id) => {
        if (!isId(id)) return;
        try {
            await pool.query("DELETE FROM recurring_tasks WHERE id = $1 AND user_id = $2", [id, userId]);
            await emitRefreshRecurringTasks(io, userId);
        } catch (err) {
            console.error("❌ [Delete Recurring Task Error]:", err.message);
        }
    });

    socket.on("player_move", (data) => {
        if (!Number.isFinite(data?.x) || !Number.isFinite(data?.y)) return;
        gameContext.playerPos.x = data.x;
        gameContext.playerPos.y = data.y;
    });
}
