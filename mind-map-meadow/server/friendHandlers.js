import { pool } from "./db.js";

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_LENGTH = 255;
// A request reveals the addressee's name in the outgoing list, and there's no withdrawing one.
// The cap keeps walking through user ids from turning into a list of every account.
const MAX_PENDING_OUTGOING = 50;

// Only accepted friends' rows select an email; for everyone else it stays null.
function toPublicFriend(row) {
    return { friendshipId: row.friendship_id, id: row.id, name: row.name, email: row.email ?? null, avatarUrl: row.avatar_url };
}

function escapeLikePattern(text) {
    return text.replace(/[\\%_]/g, "\\$&");
}

async function emitFriendsState(io, userId) {
    const friends = await pool.query(
        `SELECT f.id AS friendship_id, u.id, u.name, u.email, u.avatar_url
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
         ORDER BY u.name`,
        [userId],
    );
    const incoming = await pool.query(
        `SELECT f.id AS friendship_id, u.id, u.name, u.avatar_url
         FROM friendships f JOIN users u ON u.id = f.requester_id
         WHERE f.status = 'pending' AND f.addressee_id = $1
         ORDER BY f.created_at DESC`,
        [userId],
    );
    const outgoing = await pool.query(
        `SELECT f.id AS friendship_id, u.id, u.name, u.avatar_url
         FROM friendships f JOIN users u ON u.id = f.addressee_id
         WHERE f.status = 'pending' AND f.requester_id = $1
         ORDER BY f.created_at DESC`,
        [userId],
    );

    io.to(`user:${userId}`).emit("friends_state", {
        friends: friends.rows.map(toPublicFriend),
        incoming: incoming.rows.map(toPublicFriend),
        outgoing: outgoing.rows.map(toPublicFriend),
    });
}

// Only the render-relevant metadata leaves the host's account (no savingsGoalId etc.).
const VISIBLE_METADATA_KEYS = ["stage", "flipX", "scale", "alpha"];
function visibleMetadata(metadata) {
    const visible = {};
    if (!metadata || typeof metadata !== "object") return visible;
    for (const key of VISIBLE_METADATA_KEYS) if (Object.hasOwn(metadata, key)) visible[key] = metadata[key];
    return visible;
}

export function registerFriendEvents(io, socket) {
    const userId = socket.data.userId;

    socket.on("request_friends_state", () => emitFriendsState(io, userId));

    socket.on("search_users", async (payload) => {
        try {
            const q = typeof payload?.query === "string" ? payload.query.trim() : "";
            if (q.length < MIN_SEARCH_LENGTH || q.length > MAX_SEARCH_LENGTH) {
                socket.emit("search_users_result", []);
                return;
            }

            // Exact email or part of a name. Wildcards in the query are plain text, so it
            // can't be used to list accounts or to guess an email a character at a time.
            const result = await pool.query(
                `SELECT
                    u.id, u.name, u.email, u.avatar_url,
                    f.id AS friendship_id, f.status AS friendship_status, f.requester_id AS friendship_requester_id
                 FROM users u
                 LEFT JOIN friendships f
                    ON (f.requester_id = $1 AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = $1)
                 WHERE u.id <> $1 AND (LOWER(u.email) = LOWER($2) OR u.name ILIKE $3 ESCAPE '\\')
                 ORDER BY u.name, u.id
                 LIMIT 10`,
                [userId, q, `%${escapeLikePattern(q)}%`],
            );

            socket.emit(
                "search_users_result",
                result.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    email: r.friendship_status === "accepted" ? r.email : null,
                    avatarUrl: r.avatar_url,
                    friendshipId: r.friendship_id,
                    friendshipStatus: r.friendship_status, // null | 'pending' | 'accepted'
                    isIncomingRequest: r.friendship_status === "pending" && r.friendship_requester_id !== userId,
                })),
            );
        } catch (err) {
            console.error("❌ [Search Users Error]:", err.message);
        }
    });

    socket.on("send_friend_request", async (payload) => {
        const addresseeId = payload?.addresseeId;
        if (!Number.isInteger(addresseeId)) return;
        try {
            if (addresseeId === userId) return;

            const existing = await pool.query(`SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`, [
                userId,
                addresseeId,
            ]);
            const row = existing.rows[0];

            if (!row) {
                const pending = await pool.query(`SELECT COUNT(*)::int AS n FROM friendships WHERE requester_id = $1 AND status = 'pending'`, [userId]);
                if (pending.rows[0].n >= MAX_PENDING_OUTGOING) {
                    socket.emit("builder_error", { code: "RATE_LIMITED", message: "You have a lot of friend requests waiting. Try again once some are answered." });
                    return;
                }
                await pool.query(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`, [userId, addresseeId]);
            } else if (row.status === "pending" && row.requester_id === addresseeId) {
                // They'd already requested us — sending a request back just accepts theirs.
                await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [row.id]);
            }

            await emitFriendsState(io, userId);
            await emitFriendsState(io, addresseeId);
        } catch (err) {
            console.error("❌ [Send Friend Request Error]:", err.message);
        }
    });

    socket.on("respond_friend_request", async (payload) => {
        const { requestId, accept } = payload ?? {};
        if (!Number.isInteger(requestId)) return;
        try {
            const result = await pool.query(`SELECT * FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`, [requestId, userId]);
            const row = result.rows[0];
            if (!row) return;

            if (accept) {
                await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [requestId]);
            } else {
                await pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
            }

            await emitFriendsState(io, userId);
            await emitFriendsState(io, row.requester_id);
        } catch (err) {
            console.error("❌ [Respond Friend Request Error]:", err.message);
        }
    });

    socket.on("remove_friend", async (payload) => {
        const friendshipId = payload?.friendshipId;
        if (!Number.isInteger(friendshipId)) return;
        try {
            const result = await pool.query(`DELETE FROM friendships WHERE id = $1 AND status = 'accepted' AND (requester_id = $2 OR addressee_id = $2) RETURNING requester_id, addressee_id`, [
                friendshipId,
                userId,
            ]);
            const row = result.rows[0];
            if (!row) return;

            const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
            await emitFriendsState(io, userId);
            await emitFriendsState(io, otherId);
        } catch (err) {
            console.error("❌ [Remove Friend Error]:", err.message);
        }
    });

    socket.on("visit_friend_map", async (payload) => {
        const friendId = payload?.friendId;
        if (!Number.isInteger(friendId)) return;
        try {
            const friendship = await pool.query(
                `SELECT * FROM friendships WHERE status = 'accepted' AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
                [userId, friendId],
            );
            if (friendship.rows.length === 0) {
                socket.emit("visit_failed", "You can only visit friends' meadows.");
                return;
            }

            const hostResult = await pool.query("SELECT id, name, avatar_url FROM users WHERE id = $1", [friendId]);
            const host = hostResult.rows[0];
            if (!host) return;

            // Placed rows only, and an explicit column list: no storage, staffing or task details.
            const buildingsResult = await pool.query(
                `SELECT id, kind, line, level, asset_key, tile_x, tile_y, footprint, heritage, metadata
                 FROM buildings
                 WHERE user_id = $1 AND state = 'placed'
                 ORDER BY id`,
                [friendId],
            );

            socket.emit("visit_state", {
                host: { id: host.id, name: host.name, avatarUrl: host.avatar_url },
                buildings: buildingsResult.rows.map((b) => ({ ...b, metadata: visibleMetadata(b.metadata) })),
            });
        } catch (err) {
            console.error("❌ [Visit Friend Map Error]:", err.message);
        }
    });
}
