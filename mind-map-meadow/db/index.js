import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(pool) {
    console.log("🗄️ [Database] Checking schema migration layout parameters...");

    const migrationFiles = ["01_extensions.sql", "02_player_stats.sql", "03_buildings.sql", "04_tasks.sql", "05_ai_analysis.sql", "06_recurring_tasks.sql", "07_recurring_task_times.sql"];

    for (const file of migrationFiles) {
        const filePath = path.join(__dirname, file);
        try {
            const sql = fs.readFileSync(filePath, "utf8");
            await pool.query(sql);
            console.log(`✅ [Database Migration] Successfully checked/executed: ${file}`);
        } catch (err) {
            console.error(`❌ [Database Migration Error] Failed running file ${file}:`, err.message);
            throw err; // Stop application boot if database layout breaks
        }
    }
    console.log("🗄️ [Database] All structural tables validated.");
}
