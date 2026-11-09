import express from "express";
import { pool } from "./db.js";
import { isAllowedOrigin } from "./socketGuards.js";
import { SESSION_COOKIE_OPTIONS } from "./sessionMiddleware.js";

// Your data, yours to take or erase: GET /account/export and POST /account/delete.
const router = express.Router();

// Tables whose rows are simply "yours" (user_id = you). Everything here is also removed by the
// ON DELETE CASCADE on users, which the account tests check table by table.
const OWN_TABLES = ["player_stats", "tasks", "recurring_tasks", "buildings", "workers", "transactions", "savings_goals", "coin_ledger", "activity_events"];

const EXPORT_COOLDOWN_MS = 10_000;
const lastExportAt = new Map();

function requireUser(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: "Not signed in" });
    next();
}

// A cookie alone can't erase an account: the request has to come from our own pages.
function requireOwnOrigin(req, res, next) {
    if (!isAllowedOrigin(req.headers.origin, req.headers.host)) return res.status(403).json({ error: "Origin not allowed" });
    next();
}

export async function buildExport(db, userId) {
    const profile = await db.query("SELECT id, email, name, avatar_url, timezone, created_at FROM users WHERE id = $1", [userId]);
    const data = {
        exported_at: new Date().toISOString(),
        format: "mind-map-meadow-export/1",
        profile: profile.rows[0] || null,
        sign_ins: (await db.query("SELECT provider, email, created_at, last_login_at FROM user_identities WHERE user_id = $1 ORDER BY id", [userId])).rows,
    };
    for (const table of OWN_TABLES) {
        data[table] = (await db.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId])).rows;
    }
    // Friends: only who and since when; never the other person's email.
    data.friendships = (
        await db.query(
            `SELECT f.status, f.created_at, CASE WHEN f.requester_id = $1 THEN 'sent' ELSE 'received' END AS direction, u.name AS friend_name
             FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
             WHERE $1 IN (f.requester_id, f.addressee_id) ORDER BY f.id`,
            [userId],
        )
    ).rows;
    data.ai_notes = (await db.query("SELECT analysis_text, summary_date, created_at FROM ai_analysis WHERE user_id = $1 ORDER BY id", [userId])).rows;
    return data;
}

router.get("/export", requireUser, async (req, res) => {
    const userId = req.session.userId;
    const last = lastExportAt.get(userId) || 0;
    if (Date.now() - last < EXPORT_COOLDOWN_MS) return res.status(429).json({ error: "Just a moment before exporting again." });
    lastExportAt.set(userId, Date.now());
    try {
        const data = await buildExport(pool, userId);
        const day = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Disposition", `attachment; filename="mind-map-meadow-${day}.json"`);
        res.setHeader("Cache-Control", "no-store");
        res.type("application/json").send(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("❌ [Account Export]:", err.message);
        res.status(500).json({ error: "Export failed" });
    }
});

// Permanent. The body must say { "confirm": "DELETE" } so a stray request can't do it.
router.post("/delete", requireOwnOrigin, requireUser, async (req, res) => {
    if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete the account.' });
    const userId = req.session.userId;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM users WHERE id = $1", [userId]); // cascades to every table above
        // Every sign-in session of this account, on every device.
        await client.query("DELETE FROM session WHERE (sess::jsonb ->> 'userId')::int = $1", [userId]);
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("❌ [Account Delete]:", err.message);
        return res.status(500).json({ error: "Delete failed" });
    } finally {
        client.release();
    }
    lastExportAt.delete(userId);
    req.app.get("io")?.in(`user:${userId}`).disconnectSockets(true);
    req.session.destroy(() => {
        res.clearCookie("connect.sid", SESSION_COOKIE_OPTIONS);
        res.json({ ok: true });
    });
});

export default router;
