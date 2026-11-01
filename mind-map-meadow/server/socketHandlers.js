import { pool } from "./db.js";
import { triggerLlamaBrainDecision } from "./aiBrain.js";
import { computeTaskReward, applyLevelUp } from "./rewards.js";
import { generateTodayInstances } from "./recurringTasks.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

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

    socket.on("complete_task", async (taskId) => {
        try {
            // Claim the task atomically so a double-click/second tab can't pay out twice.
            const claim = await pool.query(
                `UPDATE tasks SET status = 'completed', completed_at = NOW()
                 WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING *`,
                [taskId, userId],
            );
            if (claim.rows.length === 0) return;
            const task = claim.rows[0];

            const gridX = Math.floor(Math.random() * (25 - 4) + 4);
            const gridY = Math.floor(Math.random() * (18 - 4) + 4);
            const snappedX = gridX * 48 + 24;
            const snappedY = gridY * 48 + 24;

            const buildingResult = await pool.query(
                `INSERT INTO buildings (type, asset_key, x, y, content, metadata, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                ["Building", "house", snappedX, snappedY, `Goal Archive: Completed "${task.title}"`, "{}", userId],
            );
            const newBuilding = buildingResult.rows[0];

            const { baseCoins, bonusCoins, totalCoins, isOnTime } = computeTaskReward(task.estimated_minutes, task.due_date, task.completed_at, socket.data.timezone);
            const calorieReward = task.category === "Fitness" ? 350 : 0;

            await pool.query(`UPDATE tasks SET building_id = $1, coins_earned = $2 WHERE id = $3 AND user_id = $4`, [newBuilding.id, totalCoins, taskId, userId]);

            const statsRow = (await pool.query("SELECT level, xp FROM player_stats WHERE user_id = $1 LIMIT 1", [userId])).rows[0];
            const { level: newLevel, xp: newXp } = applyLevelUp(statsRow.level, statsRow.xp + totalCoins);

            await pool.query(`UPDATE player_stats SET coins = coins + $1, calories_burned = calories_burned + $2, level = $3, xp = $4 WHERE user_id = $5`, [
                totalCoins,
                calorieReward,
                newLevel,
                newXp,
                userId,
            ]);

            io.to(room).emit("building_spawned", newBuilding);
            io.to(room).emit("task_reward", { taskId, baseCoins, bonusCoins, totalCoins, isOnTime });

            await emitRefreshData(io, userId);

            // Trigger AI Brain to comment on task completion
            triggerLlamaBrainDecision(io.to(room), gameContext, userId);
        } catch (err) {
            console.error("❌ [Task Completion Error]:", err.message);
        }
    });

    socket.on("add_task", async ({ title, category, due_date, estimated_minutes }) => {
        try {
            await pool.query(`INSERT INTO tasks (title, category, due_date, estimated_minutes, user_id) VALUES ($1, $2, $3, $4, $5)`, [
                title,
                category,
                due_date,
                estimated_minutes || 30,
                userId,
            ]);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Add Task Error]:", err.message);
        }
    });

    socket.on("edit_task", async ({ id, title, category, due_date, estimated_minutes }) => {
        try {
            await pool.query(`UPDATE tasks SET title = $1, category = $2, due_date = $3, estimated_minutes = $4 WHERE id = $5 AND status = 'pending' AND user_id = $6`, [
                title,
                category,
                due_date,
                estimated_minutes || 30,
                id,
                userId,
            ]);
            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Edit Task Error]:", err.message);
        }
    });

    socket.on("delete_task", async (taskId) => {
        try {
            const taskQuery = await pool.query("SELECT building_id FROM tasks WHERE id = $1 AND user_id = $2", [taskId, userId]);
            const buildingId = taskQuery.rows[0]?.building_id;

            await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [taskId, userId]);

            if (buildingId) {
                await pool.query("DELETE FROM buildings WHERE id = $1 AND user_id = $2", [buildingId, userId]);
                io.to(room).emit("building_removed", { id: buildingId });
            }

            await emitRefreshData(io, userId);
        } catch (err) {
            console.error("❌ [Delete Task Error]:", err.message);
        }
    });

    socket.on("add_recurring_task", async ({ title, category, estimated_minutes, days_of_week, start_time, end_time }) => {
        try {
            await pool.query(`INSERT INTO recurring_tasks (title, category, estimated_minutes, days_of_week, start_time, end_time, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                title,
                category,
                estimated_minutes || 30,
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

    socket.on("edit_recurring_task", async ({ id, title, category, estimated_minutes, days_of_week, start_time, end_time }) => {
        try {
            await pool.query(`UPDATE recurring_tasks SET title = $1, category = $2, estimated_minutes = $3, days_of_week = $4, start_time = $5, end_time = $6 WHERE id = $7 AND user_id = $8`, [
                title,
                category,
                estimated_minutes || 30,
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

    socket.on("toggle_recurring_task", async ({ id, active }) => {
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
        try {
            await pool.query("DELETE FROM recurring_tasks WHERE id = $1 AND user_id = $2", [id, userId]);
            await emitRefreshRecurringTasks(io, userId);
        } catch (err) {
            console.error("❌ [Delete Recurring Task Error]:", err.message);
        }
    });

    socket.on("purchase_building", async (purchaseData) => {
        const { assetKey, x, y } = purchaseData;
        const itemPriceSheet = { supermarket: 250, garden_fountain: 150, cozy_bench: 50 };
        const price = itemPriceSheet[assetKey];
        if (price === undefined) {
            socket.emit("purchase_failed", "Unknown item.");
            return;
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Check-and-debit in one statement so concurrent purchases can't double-spend.
            const debit = await client.query("UPDATE player_stats SET coins = coins - $1 WHERE user_id = $2 AND coins >= $1 RETURNING coins", [price, userId]);
            if (debit.rowCount === 0) {
                await client.query("ROLLBACK");
                socket.emit("purchase_failed", "Insufficient balance!");
                return;
            }

            const metadataJson = JSON.stringify({ purchase_price: price, purchased_at: new Date() });
            const layoutType = assetKey === "supermarket" ? "Shop" : "Decoration";

            const buildingResult = await client.query(
                `INSERT INTO buildings (type, asset_key, x, y, content, metadata, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [layoutType, assetKey, x, y, `Purchased premium ${assetKey}`, metadataJson, userId],
            );

            await client.query("COMMIT");

            io.to(room).emit("building_spawned", buildingResult.rows[0]);

            await emitRefreshData(io, userId);

            triggerLlamaBrainDecision(io.to(room), gameContext, userId);
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            console.error("❌ [Shop Failure]:", err.message);
        } finally {
            client.release();
        }
    });

    socket.on("player_move", (data) => {
        gameContext.playerPos.x = data.x;
        gameContext.playerPos.y = data.y;
    });

    socket.on("move_building", async (data) => {
        try {
            await pool.query(`UPDATE buildings SET x = $1, y = $2 WHERE id = $3 AND user_id = $4`, [data.x, data.y, data.id, userId]);
            socket.to(room).emit("building_moved", data);
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on("inspect_building", async (buildingId) => {
        try {
            const result = await pool.query(
                `SELECT tasks.title, tasks.category, buildings.content
                 FROM tasks JOIN buildings ON tasks.building_id = buildings.id
                 WHERE buildings.id = $1 AND buildings.user_id = $2`,
                [buildingId, userId],
            );
            if (result.rows.length > 0) {
                const data = result.rows[0];
                socket.emit(
                    "inspection_details",
                    `
                    <strong style="color:#4ade80;">💎 ${data.title}</strong><br/>
                    <small style="color:#a0a0b8;">Category: ${data.category}</small>
                `,
                );
            }
        } catch (err) {
            console.error(err.message);
        }
    });
}
