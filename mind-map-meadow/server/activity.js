import { pool } from "./db.js";
import { localDateKey } from "./timezone.js";

const KINDS = new Set(["open", "task", "money", "collect", "build", "summon"]);

// Counts one action on the user's local day. Called after the action has committed, and never
// allowed to fail it: tracking is for us, not for the player.
export async function recordActivity(userId, kind, timeZone = "UTC") {
    if (!KINDS.has(kind)) return;
    try {
        await pool.query(
            `INSERT INTO activity_events (user_id, day, kind) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, day, kind) DO UPDATE SET count = activity_events.count + 1, last_at = NOW()`,
            [userId, localDateKey(new Date(), timeZone), kind],
        );
    } catch (err) {
        console.error("❌ [Activity]:", err.message);
    }
}
