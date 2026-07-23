import { pool } from "./db.js";

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

// Turns each active recurring_tasks template that's scheduled for today into a
// real row in `tasks`, if one doesn't already exist for today. Safe to call
// repeatedly (partial unique index on tasks(recurring_task_id, due_date) guards it).
export async function generateTodayInstances() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday..6=Saturday, matches recurring_tasks.days_of_week
    const dateStr = todayDateString();

    try {
        const templates = await pool.query(`SELECT * FROM recurring_tasks WHERE active = true AND $1 = ANY(days_of_week)`, [dayOfWeek]);

        for (const template of templates.rows) {
            await pool.query(
                `INSERT INTO tasks (title, category, due_date, estimated_minutes, recurring_task_id)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (recurring_task_id, due_date) WHERE recurring_task_id IS NOT NULL DO NOTHING`,
                [template.title, template.category, dateStr, template.estimated_minutes, template.id],
            );
        }
    } catch (err) {
        console.error("❌ [Recurring Task Generation Error]:", err.message);
    }
}
