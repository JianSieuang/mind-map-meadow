import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "dist")));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let playerPos = { x: 100, y: 100 };
let aiPos = { x: 400, y: 300 };

io.on("connection", async (socket) => {
    console.log(`User linked via modern ESM socket: ${socket.id}`);

    const refreshAndSendState = async (targetSocket = socket) => {
        const buildingsResult = await pool.query("SELECT * FROM buildings");
        const statsResult = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
        const tasksResult = await pool.query("SELECT * FROM tasks");

        targetSocket.emit("init_state", {
            player: playerPos,
            ai: aiPos,
            buildings: buildingsResult.rows,
            stats: statsResult.rows[0],
            tasks: tasksResult.rows,
        });
    };

    try {
        await refreshAndSendState(socket);
    } catch (err) {
        console.error(err.message);
    }

    socket.on("player_move", (data) => {
        playerPos.x = data.x;
        playerPos.y = data.y;
        socket.broadcast.emit("state_update", { ai: aiPos });
    });

    socket.on("add_task", async (taskData) => {
        const { title, category, due_date } = taskData;
        try {
            await pool.query(`INSERT INTO tasks (title, category, due_date, status) VALUES ($1, $2, $3, 'pending')`, [title, category, due_date]);
            const tasksResult = await pool.query("SELECT * FROM tasks");
            io.emit("refresh_data", {
                stats: (await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1")).rows[0],
                tasks: tasksResult.rows,
            });
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on("complete_task", async (taskId) => {
        try {
            const taskQuery = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
            if (taskQuery.rows.length === 0) return;
            const task = taskQuery.rows[0];

            const gridX = Math.floor(Math.random() * (25 - 4) + 4);
            const gridY = Math.floor(Math.random() * (18 - 4) + 4);

            const snappedX = gridX * 48 + 24;
            const snappedY = gridY * 48 + 24;

            const buildingResult = await pool.query(`INSERT INTO buildings (type, x, y, content) VALUES ($1, $2, $3, $4) RETURNING *`, ["Library", snappedX, snappedY, `Goal Archive: Completed "${task.title}" under category [${task.category}]`]);
            const newBuilding = buildingResult.rows[0];

            await pool.query(`UPDATE tasks SET status = 'completed', building_id = $1 WHERE id = $2`, [newBuilding.id, taskId]);

            let coinReward = 50;
            let calorieReward = task.category === "Fitness" ? 350 : 0;
            await pool.query(`UPDATE player_stats SET coins = coins + $1, calories_burned = calories_burned + $2 WHERE username = 'chong'`, [coinReward, calorieReward]);

            io.emit("building_spawned", newBuilding);

            const allTasks = await pool.query("SELECT * FROM tasks");
            const freshStats = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
            io.emit("refresh_data", { stats: freshStats.rows[0], tasks: allTasks.rows });
        } catch (err) {
            console.error("Error executing task completion transaction:", err.message);
        }
    });

    socket.on("inspect_building", async (buildingId) => {
        try {
            const result = await pool.query(
                `SELECT tasks.title, tasks.category, tasks.completed_at, buildings.content 
                 FROM tasks 
                 JOIN buildings ON tasks.building_id = buildings.id 
                 WHERE buildings.id = $1`,
                [buildingId],
            );

            if (result.rows.length > 0) {
                const data = result.rows[0];
                socket.emit(
                    "inspection_details",
                    `
                    <strong style="color:#4ade80;">💎 ${data.title}</strong><br/>
                    <small style="color:#a0a0b8;">Category: ${data.category}</small><br/>
                    <p style="margin:5px 0 0 0; font-size:12px; color:#f1c40f;">Validated Log Structure Saved.</p>
                `,
                );
            }
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on('move_building', async (data) => {
        const { id, x, y } = data;
        try {
            await pool.query(`UPDATE buildings SET x = $1, y = $2 WHERE id = $3`, [x, y, id]);
            
            socket.broadcast.emit('building_moved', { id, x, y });
            console.log(`Building #${id} successfully relocated to coordinates: X:${x}, Y:${y}`);
        } catch (err) {
            console.error('Failed to update building position in PostgreSQL:', err.message);
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Modern ESM Game Server online at http://localhost:${PORT}`);
});
