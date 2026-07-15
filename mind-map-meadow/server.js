import dns from "dns";
dns.setDefaultResultOrder("ipv4first"); // Prevent container IPv6 connection drops

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

import { runMigrations } from "./db/index.js";

const { Pool } = pg;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "dist")));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- GAME STATE SYSTEM COORDINATES ---
let playerPos = { x: 400, y: 300 };
let aiPos = { x: 500, y: 350 };
let aiTargetPos = { x: 500, y: 350 };
let aiSpeed = 4;
let aiCurrentThought = "Awaiting your next objective, Chong...";
let isAiThinking = false;

// 1. MOTOR SYSTEM: Fast Physics Tick for Smooth Movement Interpolation
setInterval(() => {
    const dx = aiTargetPos.x - aiPos.x;
    const dy = aiTargetPos.y - aiPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 8) {
        aiPos.x += (dx / distance) * aiSpeed;
        aiPos.y += (dy / distance) * aiSpeed;
        io.emit("state_update", { ai: aiPos });
    }
}, 33);

// --- SINGLE WANDER TARGET CALCULATOR DECLARATION ---
function setRandomWanderTarget() {
    const targetX = Math.floor(Math.random() * 20 + 5) * 48 + 24;
    const targetY = Math.floor(Math.random() * 15 + 5) * 48 + 24;
    console.log(`🎯 [AI Action] Target Lock: Wandering to empty cell [X: ${targetX}, Y: ${targetY}]`);
    aiTargetPos = { x: targetX, y: targetY };
}

// 2. BRAIN SYSTEM: Low-Overhead Optimized Llama 3 Decision Routine
async function triggerLlamaBrainDecision() {
    if (isAiThinking) {
        console.log("⏳ [AI Brain] Previous request still processing. Skipping interval...");
        return;
    }

    console.log("🧠 [AI Brain] Starting decision cycle...");
    isAiThinking = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5-minute safety threshold window

    try {
        const statsQuery = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
        const tasksQuery = await pool.query("SELECT title, category, status FROM tasks LIMIT 5");
        const buildingsQuery = await pool.query("SELECT id, x, y FROM buildings");

        const stats = statsQuery.rows[0] || { level: 1, coins: 0 };
        const buildingsList = buildingsQuery.rows.map((b) => `ID:${b.id} (X:${b.x},Y:${b.y})`).join(", ");

        console.log("🧠 [AI Brain] Sending structured payload to local Ollama container...");

        const response = await fetch("http://ollama:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                model: "llama3.2:latest",
                prompt: `You are an autonomous companion circle in a game. User: 'Chong'. Stats: Level ${stats.level}, Coins: ${stats.coins}. Tasks: ${JSON.stringify(tasksQuery.rows)}. Map buildings: [${buildingsList}].
                Pick an action: FOLLOW_PLAYER, WANDER, or INSPECT_BUILDING:id.
                Respond ONLY in this exact plain text layout:
                ACTION: <your chosen action> | THOUGHT: <1 sentence comment to Chong>`,
                stream: false,
                options: {
                    num_ctx: 512, // Drop context token memory limit to clear out RAM swapping stalls
                    num_predict: 40, // Hard stop phrase length limit to accelerate responses
                    temperature: 0.6, // Keep logic tight and concise
                },
            }),
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        const rawAiOutput = data.response;
        console.log(`🧠 [AI Brain] Raw Output Received:\n"${rawAiOutput}"`);

        // Text parsing framework pass
        let parsedThought = "Awaiting your next objective, Chong...";
        if (rawAiOutput.includes("THOUGHT:")) {
            parsedThought = rawAiOutput.split("THOUGHT:")[1].trim();
        } else {
            parsedThought = rawAiOutput.replace(/ACTION:.*\|/g, "").trim();
        }
        aiCurrentThought = parsedThought;
        io.emit("ai_thought_broadcast", { thought: aiCurrentThought });

        // Action routing assessment rules
        if (rawAiOutput.includes("FOLLOW_PLAYER")) {
            console.log("🎯 [AI Action] Target Lock: Moving to follow Chong.");
            aiTargetPos = { x: playerPos.x, y: playerPos.y };
        } else if (rawAiOutput.includes("INSPECT_BUILDING")) {
            const match = rawAiOutput.match(/INSPECT_BUILDING:(\d+)/);
            if (match && match[1]) {
                const bId = parseInt(match[1]);
                const matchBuilding = buildingsQuery.rows.find((b) => b.id === bId);
                if (matchBuilding) {
                    console.log(`🎯 [AI Action] Target Lock: Traveling to inspect Building #${bId}`);
                    aiTargetPos = { x: parseFloat(matchBuilding.x), y: parseFloat(matchBuilding.y) };
                } else {
                    setRandomWanderTarget();
                }
            } else {
                setRandomWanderTarget();
            }
        } else {
            setRandomWanderTarget();
        }

        await pool.query(`INSERT INTO ai_analysis (analysis_text, raw_response) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [aiCurrentThought, rawAiOutput]);
    } catch (err) {
        if (err.name === "AbortError") {
            console.error("❌ [AI Brain Timeout]: Model setup exceeded 5-minute allocation ceiling.");
        } else {
            console.error("❌ [AI Brain Failure]:", err.message);
        }
    } finally {
        isAiThinking = false;
    }
}

// Check intervals adjusted to 60 seconds to match hardware performance footprints cleanly
setInterval(triggerLlamaBrainDecision, 60000);
setTimeout(triggerLlamaBrainDecision, 5000); // 5 second startup grace window

// --- SOCKET.IO NETWORKING GATEWAYS ---
io.on("connection", async (socket) => {
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
        targetSocket.emit("ai_thought_broadcast", { thought: aiCurrentThought });
    };

    try {
        await refreshAndSendState(socket);
    } catch (err) {
        console.error(err.message);
    }

    socket.on("player_move", (data) => {
        playerPos.x = data.x;
        playerPos.y = data.y;
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
            triggerLlamaBrainDecision();
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

            triggerLlamaBrainDecision();
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on("move_building", async (data) => {
        const { id, x, y } = data;
        try {
            await pool.query(`UPDATE buildings SET x = $1, y = $2 WHERE id = $3`, [x, y, id]);
            socket.broadcast.emit("building_moved", { id, x, y });
        } catch (err) {
            console.error(err.message);
        }
    });

    socket.on("inspect_building", async (buildingId) => {
        try {
            const result = await pool.query(
                `SELECT tasks.title, tasks.category, buildings.content 
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
});

// --- CORE SYSTEM INITIALIZATION WRAPPER ---
async function initializeApp() {
    try {
        // 1. Force the file-by-file database check to run first
        await runMigrations(pool);

        // 2. Open the port listen socket ONLY after migrations complete successfully
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Modern ESM Game Server online at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("💀 [Critical Shutdown] Server failed to initialize database:", err.message);
        process.exit(1);
    }
}

// 3. EXECUTE THE BOOT STRAP PROCESS
initializeApp();