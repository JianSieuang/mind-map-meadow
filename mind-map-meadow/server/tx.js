import { pool } from "./db.js";

// Runs fn(client) inside BEGIN/COMMIT, rolling back on any throw.
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

// Ensures the user's stats row exists (accounts hit by the old username-default bug may
// lack one), locks it for the rest of the transaction and returns it. Every builder and
// coin mutation takes this lock first, so one user's mutations run strictly one at a time.
export async function lockStatsRow(client, userId) {
    await client.query(
        `INSERT INTO player_stats (user_id, builder_migrated, last_active_at)
         VALUES ($1, true, NOW()) ON CONFLICT (user_id) DO NOTHING`,
        [userId],
    );
    const result = await client.query("SELECT * FROM player_stats WHERE user_id = $1 FOR UPDATE", [userId]);
    return result.rows[0];
}

// True when `today` is a later local day than `dayKey`. Date keys only move forward: the
// timezone comes from the client's handshake, so a plain "is it different" test would let
// someone flip between far-apart zones to reset daily caps as often as they like.
export function isNewerDay(today, dayKey) {
    return !dayKey || today > dayKey;
}

// Resets the daily counters on a locked stats row when a new local day has started.
export async function rollDailyCounters(client, stats, today) {
    if (!isNewerDay(today, stats.counters_day)) return stats;
    await client.query(`UPDATE player_stats SET counters_day = $1, tasks_paid_today = 0, buildings_today = 0 WHERE user_id = $2`, [today, stats.user_id]);
    stats.counters_day = today;
    stats.tasks_paid_today = 0;
    stats.buildings_today = 0;
    return stats;
}

// The data is already saved by the time this runs, so a failed notification must never
// reach the user as "couldn't save": they would retry and duplicate it.
export async function afterCommit(label, fn) {
    try {
        await fn();
    } catch (err) {
        console.error(`❌ [After Commit: ${label}]:`, err.message);
    }
}
