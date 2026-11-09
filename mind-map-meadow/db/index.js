import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(pool) {
    console.log("🗄️ [Database] Checking schema migration layout parameters...");

    const migrationFiles = [
        "01_extensions.sql",
        "02_player_stats.sql",
        "03_buildings.sql",
        "04_tasks.sql",
        "05_ai_analysis.sql",
        "06_recurring_tasks.sql",
        "07_recurring_task_times.sql",
        "08_users_and_ownership.sql",
        "09_sessions.sql",
        "10_friendships.sql",
        "11_user_timezone.sql",
        "12_money.sql",
        "13_player_stats_username_default.sql",
        "14_money_hardening.sql",
        "15_builder_loop.sql",
        "16_economy_tweaks.sql",
        "17_coin_ledger.sql",
        "18_money_subcategory.sql",
        "19_user_identities.sql",
        "20_activity_events.sql",
    ];

    await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW())");
    const applied = new Set((await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename));

    // Each file runs once, atomically with its record. Databases that predate this table
    // re-run the old idempotent files one last time and get them recorded.
    for (const file of migrationFiles) {
        if (applied.has(file)) continue;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(fs.readFileSync(path.join(__dirname, file), "utf8"));
            await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
            await client.query("COMMIT");
            console.log(`✅ [Database Migration] Applied: ${file}`);
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            console.error(`❌ [Database Migration Error] Failed running file ${file}:`, err.message);
            throw err; // Stop application boot if database layout breaks
        } finally {
            client.release();
        }
    }
    console.log("🗄️ [Database] All structural tables validated.");
}
