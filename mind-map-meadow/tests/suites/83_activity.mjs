// activity_events: one row per user, local day and kind, counted after the action commits.
import { check, eq, section, mkUser, connect, init, call, quiet, qa, q1, sleep, addTask } from "../lib/harness.mjs";

export async function run() {
    section("activity_events: what gets counted");
    {
        const u = await mkUser("activity");
        const tz = "Pacific/Kiritimati"; // UTC+14, so the local day often differs from the UTC day
        const s = await connect(u, { tz });
        await init(s);
        await call(s, "complete_task", await addTask(u, "Fitness"));
        await call(s, "complete_task", await addTask(u, "Coding"));
        await call(s, "add_transaction", { amountCents: 100, direction: "expense", category: "Food" });
        await call(s, "collect_all", {});
        await sleep(300);

        const rows = await qa("SELECT kind, count, day FROM activity_events WHERE user_id = $1 ORDER BY kind", [u.id]);
        const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.count]));
        eq("open 1, task 2, money 1, collect 1", [byKind.open, byKind.task, byKind.money, byKind.collect], [1, 2, 1, 1]);
        const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
        check("the day is the user's local day", rows.every((r) => r.day === localToday), { rows, localToday });
        const cols = (await qa("SELECT column_name FROM information_schema.columns WHERE table_name = 'activity_events'")).map((r) => r.column_name).sort();
        eq("only kind, day and counts are stored, no content", cols, ["count", "day", "first_at", "kind", "last_at", "user_id"]);

        await init(s);
        await sleep(200);
        eq("opening again the same day bumps the count, no new row", (await q1("SELECT count FROM activity_events WHERE user_id = $1 AND kind = 'open'", [u.id])).count, 2);

        await quiet(s, "complete_task", 999999999);
        await sleep(200);
        eq("a refused action isn't counted", (await q1("SELECT count FROM activity_events WHERE user_id = $1 AND kind = 'task'", [u.id])).count, 2);

        const bad = await qa("INSERT INTO activity_events (user_id, day, kind) VALUES ($1, '2026-01-01', 'title') RETURNING 1", [u.id]).catch((e) => e);
        check("unknown kinds are rejected by the table", bad instanceof Error && bad.code === "23514", bad.message);
    }
}
