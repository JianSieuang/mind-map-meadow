import express from "express";
import { OAuth2Client } from "google-auth-library";
import { pool } from "./db.js";
import { SESSION_COOKIE_OPTIONS, sessionRoomFor } from "./sessionMiddleware.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = express.Router();

// Web, Android, and iOS each register their own OAuth client ID in Google Cloud
// Console, so a token issued to any of them must be accepted here.
const VALID_AUDIENCES = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_ID_ANDROID, process.env.GOOGLE_CLIENT_ID_IOS].filter(Boolean);

function toPublicUser(user) {
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url };
}

// A socket's authorisation is read once, at its handshake, so a socket has to be dropped
// when the session behind it ends.
function disconnectSessionSockets(req, sessionId) {
    req.app.get("io")?.in(sessionRoomFor(sessionId)).disconnectSockets(true);
}

// A new session id at login, so an id planted in the browser beforehand is worthless.
function regenerateSession(req) {
    const oldSessionId = req.sessionID;
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            disconnectSessionSockets(req, oldSessionId);
            resolve();
        });
    });
}

export class EmailTakenError extends Error {}

// Finds or creates the account behind one provider login. Accounts are never joined by
// matching email: anyone can make a Facebook account with your Gmail address, so a second
// provider is only ever linked from inside an account you're already signed in to.
export async function findOrCreateUser(provider, { providerUserId, email, name, avatarUrl }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const found = await client.query(
            `UPDATE user_identities SET last_login_at = NOW() WHERE provider = $1 AND provider_user_id = $2
             RETURNING (SELECT row_to_json(u) FROM users u WHERE u.id = user_identities.user_id) AS user`,
            [provider, providerUserId],
        );
        let user = found.rows[0]?.user;

        if (!user) {
            if (email) {
                const taken = await client.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [email]);
                if (taken.rows.length) throw new EmailTakenError();
            }
            // Serialises first-ever logins so only one account adopts the legacy save.
            await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
            const countResult = await client.query("SELECT COUNT(*)::int AS n FROM users");
            const isFirstUser = countResult.rows[0].n === 0;

            const inserted = await client.query(`INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *`, [
                provider === "google" ? providerUserId : null,
                email || null,
                name,
                avatarUrl,
            ]);
            user = inserted.rows[0];
            await client.query(`INSERT INTO user_identities (user_id, provider, provider_user_id, email, last_login_at) VALUES ($1, $2, $3, $4, NOW())`, [user.id, provider, providerUserId, email || null]);

            // The very first account ever to log in adopts all pre-existing (pre-multi-user)
            // game data, so nothing is lost. Every account after that starts from a clean slate.
            if (isFirstUser) {
                for (const table of ["player_stats", "buildings", "tasks", "recurring_tasks", "ai_analysis"]) {
                    await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [user.id]);
                }
            }
        }

        // Runs on every login so accounts created before the username-default fix self-heal.
        await client.query("INSERT INTO player_stats (user_id, builder_migrated, last_active_at) VALUES ($1, true, NOW()) ON CONFLICT (user_id) DO NOTHING", [user.id]);
        await client.query("COMMIT");
        return user;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

router.post("/google", async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ error: "Missing credential" });

        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: VALID_AUDIENCES });
        const { sub, email, name, picture } = ticket.getPayload();
        const user = await findOrCreateUser("google", { providerUserId: sub, email, name, avatarUrl: picture });

        await regenerateSession(req);
        req.session.userId = user.id;
        res.json({ user: toPublicUser(user) });
    } catch (err) {
        if (err instanceof EmailTakenError) {
            return res.status(409).json({ error: "This email already has an account. Sign in the way you did before, then link this login from your profile." });
        }
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
    const sessionId = req.sessionID;
    req.session.destroy((err) => {
        if (err) {
            console.error("❌ [Logout Error]:", err.message);
            return res.status(500).json({ error: "Logout failed" });
        }
        disconnectSessionSockets(req, sessionId);
        res.clearCookie("connect.sid", SESSION_COOKIE_OPTIONS);
        res.json({ ok: true });
    });
});

export default router;
