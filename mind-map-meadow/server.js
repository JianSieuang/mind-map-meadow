import dns from "dns";
import { recordActivity } from "./server/activity.js";
import { bindingsFrom } from "./server/keybindings.js";
import { registerSettingsEvents } from "./server/settingsHandlers.js";
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
import { registerMoneyEvents, fetchMoneyState } from "./server/moneyHandlers.js";
import { registerBuilderEvents, runVisit } from "./server/builderHandlers.js";
import { triggerLlamaBrainDecision } from "./server/aiBrain.js";
import { generateTodayInstances } from "./server/recurringTasks.js";
import { sessionMiddleware, sessionRoomFor } from "./server/sessionMiddleware.js";
import { allowRequest, attachRateLimit } from "./server/socketGuards.js";
import authRouter from "./server/auth.js";
import accountRouter from "./server/accountRoutes.js";
import { securityHeaders } from "./server/securityHeaders.js";
import { isValidTimeZone } from "./server/timezone.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { allowRequest });
const PORT = process.env.PORT || 5000;

// Production sits behind one TLS-terminating proxy, and the secure session cookie is only
// set when Express trusts its X-Forwarded-Proto.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.set("io", io); // auth.js drops a session's sockets when that session ends

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "32kb" }));
app.use(sessionMiddleware);
app.use("/auth", authRouter);
app.use("/account", accountRouter);
app.use(express.static(path.join(__dirname, "dist")));
// Addresses of the single-page app: dashboard pages and friend visits (src/utils/route.js).
const APP_PATHS = ["/tasks", "/calendar", "/daily-tasks", "/money", "/visit/:friendId"];
app.get(APP_PATHS, (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

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
    socket.join(sessionRoomFor(socket.request.session.id));
    attachRateLimit(socket);

    const reportedTimeZone = socket.handshake.auth?.timezone;
    socket.data.timezone = isValidTimeZone(reportedTimeZone) ? reportedTimeZone : "UTC";

    // Persist the browser's timezone, then make sure today's habit instances exist for
    // *their* today before the first init_state goes out.
    const userReady = pool
        .query("UPDATE users SET timezone = $1 WHERE id = $2", [socket.data.timezone, userId])
        .then(() => generateTodayInstances(userId))
        .catch((err) => console.error("❌ [Timezone Sync Error]:", err.message));

    const gameContext = getOrCreateGameContext(userId);

    // The client requests this once its Phaser scene has finished preloading and is
    // actually listening — pushing it eagerly on connect races against that preload
    // and can drop the buildings payload if the scene isn't ready yet.
    socket.on("request_init_state", async () => {
        try {
            await userReady;
            // Opening the app is a "visit": it can release a catch-up building, and the
            // payload below has to reflect that.
            const builder = await runVisit(io, userId, socket.data.timezone);
            recordActivity(userId, "open", socket.data.timezone || "UTC");
            const statsResult = await pool.query("SELECT * FROM player_stats WHERE user_id = $1 LIMIT 1", [userId]);
            const tasksResult = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY due_date ASC, id ASC", [userId]);
            const recurringTasksResult = await pool.query("SELECT * FROM recurring_tasks WHERE user_id = $1 ORDER BY id ASC", [userId]);
            const money = await fetchMoneyState(pool, userId);
            const settingsResult = await pool.query("SELECT settings FROM users WHERE id = $1", [userId]);

            socket.emit("init_state", {
                player: gameContext.playerPos,
                ai: gameContext.aiPos,
                buildings: builder.placed,
                stats: statsResult.rows[0],
                tasks: tasksResult.rows,
                recurringTasks: recurringTasksResult.rows,
                transactions: money.transactions,
                savingsGoals: money.savingsGoals,
                builder,
                settings: { keybindings: bindingsFrom(settingsResult.rows[0]?.settings) },
            });
            socket.emit("ai_thought_broadcast", { thought: gameContext.aiCurrentThought });
        } catch (err) {
            console.error("❌ [Init State Error]:", err.message);
        }
    });

    registerSocketEvents(io, socket, gameContext);
    registerFriendEvents(io, socket);
    registerMoneyEvents(io, socket);
    registerSettingsEvents(io, socket);
    registerBuilderEvents(io, socket, gameContext);

    // Drop the user's in-memory context once their last tab/device disconnects, so
    // the physics loop and AI interval stop doing work for logged-out users.
    socket.on("disconnect", () => {
        const remaining = io.sockets.adapter.rooms.get(roomFor(userId));
        if (!remaining || remaining.size === 0) gameContexts.delete(userId);
    });
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
        // After a Docker restart the app can start before Postgres accepts connections.
        for (let attempt = 1; ; attempt++) {
            try {
                await pool.query("SELECT 1");
                break;
            } catch (err) {
                if (attempt >= 30) throw err;
                console.log(`⏳ [Database] Not ready yet (attempt ${attempt}/30), retrying...`);
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
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
