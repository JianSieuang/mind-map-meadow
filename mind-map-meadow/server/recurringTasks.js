import { pool } from "./db.js";
import { localDateKey, localDayOfWeek } from "./timezone.js";

// Turns each active recurring_tasks template that's scheduled for "today" — in its
// owner's own timezone — into a real row in `tasks`, if one doesn't already exist.
// Safe to call repeatedly (partial unique index on tasks(recurring_task_id, due_date) guards it).
// Pass a userId to only generate that user's instances.
export async function generateTodayInstances(userId = null) {
    const now = new Date();

    try {
        const templates = await pool.query(
            `SELECT rt.*, u.timezone
             FROM recurring_tasks rt JOIN users u ON u.id = rt.user_id
             WHERE rt.active = true AND ($1::int IS NULL OR rt.user_id = $1)`,
            [userId],
        );

        for (const template of templates.rows) {
            const timeZone = template.timezone || "UTC";
            if (!template.days_of_week.includes(localDayOfWeek(now, timeZone))) continue;

            await pool.query(
                `INSERT INTO tasks (title, category, due_date, estimated_minutes, recurring_task_id, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (recurring_task_id, due_date) WHERE recurring_task_id IS NOT NULL DO NOTHING`,
                [template.title, template.category, localDateKey(now, timeZone), template.estimated_minutes, template.id, template.user_id],
            );
        }
    } catch (err) {
        console.error("❌ [Recurring Task Generation Error]:", err.message);
    }
}
