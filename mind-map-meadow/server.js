import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./server/db.js";
import { runMigrations } from "./db/index.js";
import { registerSocketEvents } from "./server/socketHandlers.js";
import { triggerLlamaBrainDecision } from "./server/aiBrain.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "dist")));

// Centralized Unified Game Execution Parameters Object Reference
const gameContext = {
    playerPos: { x: 400, y: 300 },
    aiPos: { x: 500, y: 350 },
    aiTargetPos: { x: 500, y: 350 },
    aiSpeed: 4,
    aiCurrentThought: "Awaiting your next objective, Chong...",
};

// ⚡ MOTOR SYSTEM PHYSICS INTERPOLATION LOOP (Runs every 33ms)
setInterval(() => {
    const dx = gameContext.aiTargetPos.x - gameContext.aiPos.x;
    const dy = gameContext.aiTargetPos.y - gameContext.aiPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 8) {
        gameContext.aiPos.x += (dx / distance) * gameContext.aiSpeed;
        gameContext.aiPos.y += (dy / distance) * gameContext.aiSpeed;
        io.emit("state_update", { ai: gameContext.aiPos });
    }
}, 33);

io.on("connection", (socket) => {
    // The client requests this once its Phaser scene has finished preloading and is
    // actually listening — pushing it eagerly on connect races against that preload
    // and can drop the buildings payload if the scene isn't ready yet.
    socket.on("request_init_state", async () => {
        try {
            const buildingsResult = await pool.query("SELECT * FROM buildings");
            const statsResult = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
            const tasksResult = await pool.query("SELECT * FROM tasks ORDER BY due_date ASC, id ASC");

            socket.emit("init_state", {
                player: gameContext.playerPos,
                ai: gameContext.aiPos,
                buildings: buildingsResult.rows,
                stats: statsResult.rows[0],
                tasks: tasksResult.rows,
            });
            socket.emit("ai_thought_broadcast", { thought: gameContext.aiCurrentThought });
        } catch (err) {
            console.error("❌ [Init State Error]:", err.message);
        }
    });

    registerSocketEvents(io, socket, gameContext);
});

// ⚡ BRAIN CLOCK STRATIFICATION SCHEDULER KEYS
setInterval(() => triggerLlamaBrainDecision(io, gameContext), 60000); // Main loop
setTimeout(() => triggerLlamaBrainDecision(io, gameContext), 5000); // Initialization grace window

async function initializeApp() {
    try {
        await runMigrations(pool);
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Modular ESM Game Server online at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("💀 [Critical Shutdown] Boot crash:", err.message);
        process.exit(1);
    }
}

initializeApp();
