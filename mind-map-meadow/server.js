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
import { registerFriendEvents } from "./server/friendHandlers.js";
import { triggerLlamaBrainDecision } from "./server/aiBrain.js";
import { generateTodayInstances } from "./server/recurringTasks.js";
import { sessionMiddleware } from "./server/sessionMiddleware.js";
import authRouter from "./server/auth.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(sessionMiddleware);
app.use("/auth", authRouter);
app.use(express.static(path.join(__dirname, "dist")));

// Socket.IO reads the exact same session (set by sessionMiddleware above) off
// the underlying engine request, so a socket can be tied to a logged-in user
// without a separate auth handshake of its own.
io.engine.use(sessionMiddleware);

// Per-user game state — one entry per logged-in user with an active connection,
// keyed by user id. Replaces the old single global gameContext now that
// buildings/tasks/AI companions are all owned per-account.
const gameContexts = new Map();

function roomFor(userId) {
    return `user:${userId}`;
}

function getOrCreateGameContext(userId) {
    if (!gameContexts.has(userId)) {
        gameContexts.set(userId, {
            playerPos: { x: 400, y: 300 },
            aiPos: { x: 500, y: 350 },
            aiTargetPos: { x: 500, y: 350 },
            aiSpeed: 4,
            aiCurrentThought: "Awaiting your next objective...",
        });
    }
    return gameContexts.get(userId);
}

// ⚡ MOTOR SYSTEM PHYSICS INTERPOLATION LOOP (Runs every 33ms, once per active user)
setInterval(() => {
    for (const [userId, gameContext] of gameContexts) {
        const dx = gameContext.aiTargetPos.x - gameContext.aiPos.x;
        const dy = gameContext.aiTargetPos.y - gameContext.aiPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 8) {
            gameContext.aiPos.x += (dx / distance) * gameContext.aiSpeed;
            gameContext.aiPos.y += (dy / distance) * gameContext.aiSpeed;
            io.to(roomFor(userId)).emit("state_update", { ai: gameContext.aiPos });
        }
    }
}, 33);

io.on("connection", (socket) => {
    const userId = socket.request.session?.userId;
    if (!userId) {
        socket.disconnect();
        return;
    }

    socket.data.userId = userId;
    socket.join(roomFor(userId));

    const gameContext = getOrCreateGameContext(userId);

    // The client requests this once its Phaser scene has finished preloading and is
    // actually listening — pushing it eagerly on connect races against that preload
    // and can drop the buildings payload if the scene isn't ready yet.
    socket.on("request_init_state", async () => {
        try {
            const buildingsResult = await pool.query("SELECT * FROM buildings WHERE user_id = $1", [userId]);
            const statsResult = await pool.query("SELECT * FROM player_stats WHERE user_id = $1 LIMIT 1", [userId]);
            const tasksResult = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date ASC, id ASC", [userId]);
            const recurringTasksResult = await pool.query("SELECT * FROM recurring_tasks WHERE user_id = $1 ORDER BY id ASC", [userId]);

            socket.emit("init_state", {
                player: gameContext.playerPos,
                ai: gameContext.aiPos,
                buildings: buildingsResult.rows,
                stats: statsResult.rows[0],
                tasks: tasksResult.rows,
                recurringTasks: recurringTasksResult.rows,
            });
            socket.emit("ai_thought_broadcast", { thought: gameContext.aiCurrentThought });
        } catch (err) {
            console.error("❌ [Init State Error]:", err.message);
        }
    });

    registerSocketEvents(io, socket, gameContext);
    registerFriendEvents(io, socket);
});

// ⚡ BRAIN CLOCK STRATIFICATION SCHEDULER KEYS — one decision cycle per active user
setInterval(() => {
    for (const [userId, gameContext] of gameContexts) {
        triggerLlamaBrainDecision(io.to(roomFor(userId)), gameContext, userId);
    }
}, 60000);

// ⚡ DAILY GOAL PLANNER: turn recurring_tasks templates into today's task rows.
// Runs at boot and hourly rather than exactly at midnight — cheap no-op if
// today's instances already exist, so the imprecise timing doesn't matter.
setInterval(() => generateTodayInstances(), 60 * 60 * 1000);

async function initializeApp() {
    try {
        await runMigrations(pool);
        await generateTodayInstances();
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Modular ESM Game Server online at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("💀 [Critical Shutdown] Boot crash:", err.message);
        process.exit(1);
    }
}

initializeApp();
