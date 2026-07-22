import { pool } from "./db.js";
import { triggerLlamaBrainDecision } from "./aiBrain.js";

export function registerSocketEvents(io, socket, gameContext) {
    socket.on("complete_task", async (taskId) => {
        try {
            const taskQuery = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
            if (taskQuery.rows.length === 0) return;
            const task = taskQuery.rows[0];

            const gridX = Math.floor(Math.random() * (25 - 4) + 4);
            const gridY = Math.floor(Math.random() * (18 - 4) + 4);
            const snappedX = gridX * 48 + 24;
            const snappedY = gridY * 48 + 24;

            const buildingResult = await pool.query(
                `INSERT INTO buildings (type, asset_key, x, y, content, metadata) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                ["Building", "house", snappedX, snappedY, `Goal Archive: Completed "${task.title}"`, "{}"],
            );
            const newBuilding = buildingResult.rows[0];

            let coinReward = 50;
            let calorieReward = task.category === "Fitness" ? 350 : 0;

            await pool.query(
                `UPDATE tasks 
                 SET status = 'completed', building_id = $1, coins_earned = $2, completed_at = NOW() 
                 WHERE id = $3`,
                [newBuilding.id, coinReward, taskId],
            );

            await pool.query(`UPDATE player_stats SET coins = coins + $1, calories_burned = calories_burned + $2 WHERE username = 'chong'`, [coinReward, calorieReward]);

            io.emit("building_spawned", newBuilding);

            const freshStats = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
            const allTasks = await pool.query("SELECT * FROM tasks");
            io.emit("refresh_data", { stats: freshStats.rows[0], tasks: allTasks.rows });

            // Trigger AI Brain to comment on task completion
            triggerLlamaBrainDecision(io, gameContext);
        } catch (err) {
            console.error("❌ [Task Completion Error]:", err.message);
        }
    });

    socket.on("purchase_building", async (purchaseData) => {
        const { assetKey, x, y } = purchaseData;
        const itemPriceSheet = { supermarket: 250, garden_fountain: 150, cozy_bench: 50 };
        const price = itemPriceSheet[assetKey] || 999999;

        try {
            const statsResult = await pool.query("SELECT coins FROM player_stats WHERE username = 'chong' LIMIT 1");
            const userCoins = statsResult.rows[0]?.coins || 0;

            if (userCoins < price) {
                socket.emit("purchase_failed", "Insufficient balance!");
                return;
            }

            await pool.query("UPDATE player_stats SET coins = coins - $1 WHERE username = 'chong'", [price]);

            const metadataJson = JSON.stringify({ purchase_price: price, purchased_at: new Date() });
            const layoutType = assetKey === "supermarket" ? "Shop" : "Decoration";

            const buildingResult = await pool.query(
                `INSERT INTO buildings (type, asset_key, x, y, content, metadata) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [layoutType, assetKey, x, y, `Purchased premium ${assetKey}`, metadataJson],
            );

            io.emit("building_spawned", buildingResult.rows[0]);

            const freshStats = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
            const allTasks = await pool.query("SELECT * FROM tasks");
            io.emit("refresh_data", { stats: freshStats.rows[0], tasks: allTasks.rows });

            triggerLlamaBrainDecision(io, gameContext);
        } catch (err) {
            console.error("❌ [Shop Failure]:", err.message);
        }
    });

    socket.on("player_move", (data) => {
        gameContext.playerPos.x = data.x;
        gameContext.playerPos.y = data.y;
    });

    socket.on("move_building", async (data) => {
        try {
            await pool.query(`UPDATE buildings SET x = $1, y = $2 WHERE id = $3`, [data.x, data.y, data.id]);
            socket.broadcast.emit("building_moved", data);
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on("inspect_building", async (buildingId) => {
        try {
            const result = await pool.query(
                `SELECT tasks.title, tasks.category, buildings.content 
                 FROM tasks JOIN buildings ON tasks.building_id = buildings.id 
                 WHERE buildings.id = $1`,
                [buildingId],
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
