import express from "express";
import { OAuth2Client } from "google-auth-library";
import { pool } from "./db.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = express.Router();

// Web, Android, and iOS each register their own OAuth client ID in Google Cloud
// Console, so a token issued to any of them must be accepted here.
const VALID_AUDIENCES = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID_ANDROID, process.env.GOOGLE_CLIENT_ID_IOS].filter(Boolean);

function toPublicUser(user) {
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url };
}

router.post("/google", async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ error: "Missing credential" });

        const ticket = await client.verifyIdToken({ idToken: credential, audience: VALID_AUDIENCES });
        const { sub: googleId, email, name, picture } = ticket.getPayload();

        const existing = await pool.query("SELECT * FROM users WHERE google_id = $1", [googleId]);
        let user = existing.rows[0];

        if (!user) {
            const countResult = await pool.query("SELECT COUNT(*) FROM users");
            const isFirstUser = parseInt(countResult.rows[0].count, 10) === 0;

            const inserted = await pool.query(`INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *`, [googleId, email, name, picture]);
            user = inserted.rows[0];

            // The very first Google account ever to log in adopts all pre-existing
            // (pre-multi-user) game data — the old hardcoded-to-'chong' save — so
            // nothing is lost. Every account after that starts from a clean slate.
            if (isFirstUser) {
                await pool.query("UPDATE player_stats SET user_id = $1 WHERE user_id IS NULL", [user.id]);
                await pool.query("UPDATE buildings SET user_id = $1 WHERE user_id IS NULL", [user.id]);
                await pool.query("UPDATE tasks SET user_id = $1 WHERE user_id IS NULL", [user.id]);
                await pool.query("UPDATE recurring_tasks SET user_id = $1 WHERE user_id IS NULL", [user.id]);
                await pool.query("UPDATE ai_analysis SET user_id = $1 WHERE user_id IS NULL", [user.id]);
            }

            await pool.query("INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [user.id]);
        }

        req.session.userId = user.id;
        res.json({ user: toPublicUser(user) });
    } catch (err) {
        console.error("❌ [Google Auth Error]:", err.message);
        res.status(401).json({ error: "Authentication failed" });
    }
});

router.get("/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ user: null });

    try {
        const result = await pool.query("SELECT id, email, name, avatar_url FROM users WHERE id = $1", [req.session.userId]);
        if (result.rows.length === 0) return res.status(401).json({ user: null });
        res.json({ user: toPublicUser(result.rows[0]) });
    } catch (err) {
        console.error("❌ [Auth Me Error]:", err.message);
        res.status(500).json({ user: null });
    }
});

router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("❌ [Logout Error]:", err.message);
            return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ ok: true });
    });
});

export default router;
