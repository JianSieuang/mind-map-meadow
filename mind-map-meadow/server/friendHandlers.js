import { pool } from "./db.js";

function toPublicFriend(row) {
    return { friendshipId: row.friendship_id, id: row.id, name: row.name, email: row.email, avatarUrl: row.avatar_url };
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
        `SELECT f.id AS friendship_id, u.id, u.name, u.email, u.avatar_url
         FROM friendships f JOIN users u ON u.id = f.requester_id
         WHERE f.status = 'pending' AND f.addressee_id = $1
         ORDER BY f.created_at DESC`,
        [userId],
    );
    const outgoing = await pool.query(
        `SELECT f.id AS friendship_id, u.id, u.name, u.email, u.avatar_url
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

    socket.on("search_users", async ({ query }) => {
        try {
            const q = (query || "").trim();
            if (q.length < 2) {
                socket.emit("search_users_result", []);
                return;
            }

            const result = await pool.query(
                `SELECT
                    u.id, u.name, u.email, u.avatar_url,
                    f.id AS friendship_id, f.status AS friendship_status, f.requester_id AS friendship_requester_id
                 FROM users u
                 LEFT JOIN friendships f
                    ON (f.requester_id = $1 AND f.addressee_id = u.id) OR (f.requester_id = u.id AND f.addressee_id = $1)
                 WHERE u.id <> $1 AND (u.email ILIKE $2 OR u.name ILIKE $2)
                 LIMIT 10`,
                [userId, `%${q}%`],
            );

            socket.emit(
                "search_users_result",
                result.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    email: r.email,
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

    socket.on("send_friend_request", async ({ addresseeId }) => {
        try {
            if (addresseeId === userId) return;

            const existing = await pool.query(`SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`, [
                userId,
                addresseeId,
            ]);
            const row = existing.rows[0];

            if (!row) {
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

    socket.on("respond_friend_request", async ({ requestId, accept }) => {
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

    socket.on("remove_friend", async ({ friendshipId }) => {
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

    socket.on("visit_friend_map", async ({ friendId }) => {
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

            const buildingsResult = await pool.query(
                `SELECT buildings.id, buildings.type, buildings.asset_key, buildings.x, buildings.y, buildings.metadata,
                        tasks.title AS task_title, tasks.category AS task_category
                 FROM buildings LEFT JOIN tasks ON tasks.building_id = buildings.id
                 WHERE buildings.user_id = $1`,
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
