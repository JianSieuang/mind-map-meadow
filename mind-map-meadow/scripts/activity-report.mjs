// Who comes back: active days per user in each of their first 4 weeks, and week-N retention.
// Run inside the app container:  docker exec game-meadow npm run report
// From a test start date:         docker exec game-meadow npm run report -- --since 2026-11-10
// Read-only. Uses only activity_events (kind + day), never task or money content.
import pg from "pg";

pg.types.setTypeParser(1082, (v) => v);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// --since YYYY-MM-DD: the test's start. Earlier days are ignored and week 1 starts there.
const sinceAt = process.argv.indexOf("--since");
const since = sinceAt > -1 && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[sinceAt + 1] || "") ? process.argv[sinceAt + 1] : null;

// Week N of a user counts from their own first active day: days 0-6 are week 1, and so on.
const perUser = await db.query(`
    WITH active AS (SELECT DISTINCT user_id, day FROM activity_events WHERE day >= COALESCE($1::date, '-infinity'::date)),
         first AS (SELECT user_id, MIN(day) AS d0, MAX(day) AS last FROM active GROUP BY 1)
    SELECT f.user_id, COALESCE(u.name, '#' || f.user_id) AS name, f.d0 AS first_day, f.last AS last_day,
           (CURRENT_DATE - f.d0) / 7 + 1 AS weeks_in,
           COUNT(*) FILTER (WHERE a.day - f.d0 BETWEEN 0 AND 6)::int AS w1,
           COUNT(*) FILTER (WHERE a.day - f.d0 BETWEEN 7 AND 13)::int AS w2,
           COUNT(*) FILTER (WHERE a.day - f.d0 BETWEEN 14 AND 20)::int AS w3,
           COUNT(*) FILTER (WHERE a.day - f.d0 BETWEEN 21 AND 27)::int AS w4,
           COUNT(*) FILTER (WHERE a.day > CURRENT_DATE - 7)::int AS last_7_days
    FROM first f JOIN active a USING (user_id) LEFT JOIN users u ON u.id = f.user_id
    GROUP BY f.user_id, u.name, f.d0, f.last ORDER BY f.d0, f.user_id`, [since]);

const kinds = await db.query(`
    SELECT kind, SUM(count)::int AS total, COUNT(DISTINCT user_id)::int AS users
    FROM activity_events WHERE day > CURRENT_DATE - 7 GROUP BY kind ORDER BY total DESC`);

console.log(since ? `\nCounting from ${since}` : "\nCounting from each user's first day ever (add -- --since YYYY-MM-DD for a test start)");
console.log("Active days per week, counted from each user's first day (7 = every day)");
console.table(perUser.rows.map((r) => ({ name: r.name, first: r.first_day, last: r.last_day, "wk 1": r.w1, "wk 2": r.w2, "wk 3": r.w3, "wk 4": r.w4, "last 7 days": r.last_7_days })));

// Only users whose week N is over (or under way) can count toward week N.
console.log("Retention: share of users active at least once in week N");
const rows = [];
for (let n = 1; n <= 4; n++) {
    const eligible = perUser.rows.filter((r) => r.weeks_in >= n);
    const active = eligible.filter((r) => r[`w${n}`] > 0).length;
    rows.push({ week: n, users: eligible.length, active, share: eligible.length ? `${Math.round((active / eligible.length) * 100)}%` : "-" });
}
console.table(rows);
console.log("Business rule: keep going if ~40%+ are still active in week 4.\n");

console.log("Last 7 days by kind of action");
console.table(kinds.rows);
await db.end();
