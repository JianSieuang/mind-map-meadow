// Your data: GET /account/export and POST /account/delete.
import { check, eq, section, mkUser, loginAs, connect, init, call, http, q1, qa, db, sleep, addTask } from "../lib/harness.mjs";

const OWNED = ["player_stats", "tasks", "recurring_tasks", "buildings", "workers", "transactions", "savings_goals", "coin_ledger", "activity_events", "user_identities", "ai_analysis"];

export async function run() {
    const u = await mkUser("acct", { name: "Ann" });
    const other = await mkUser("acctother", { name: "Ben" });
    await db.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [u.id, other.id]);
    await db.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)", [u.id, `acct-${u.id}`]);
    await db.query("INSERT INTO ai_analysis (user_id, analysis_text) VALUES ($1, 'nice work')", [u.id]);
    const s = await connect(u);
    await init(s);
    await call(s, "complete_task", await addTask(u, "Fitness", { title: "ANN TASK" }));
    await call(s, "add_transaction", { amountCents: 250, direction: "expense", category: "Food", subcategory: "Lunch", note: "ann lunch note" });
    const so = await connect(other);
    await init(so);
    await call(so, "complete_task", await addTask(other, "Coding", { title: "BEN TASK" }));
    await sleep(200);

    section("security headers");
    {
        const h = (await http("/auth/me")).headers;
        check("CSP set, no framing, no plugins", /frame-ancestors 'none'/.test(h.get("content-security-policy") || "") && /object-src 'none'/.test(h.get("content-security-policy") || ""), h.get("content-security-policy"));
        eq("nosniff, referrer policy, no x-powered-by", [h.get("x-content-type-options"), h.get("referrer-policy"), h.get("x-powered-by")], ["nosniff", "strict-origin-when-cross-origin", null]);
        const big = await http("/account/delete", { method: "POST", cookie: u.cookie, body: { confirm: "DELETE", pad: "x".repeat(40000) } });
        eq("oversized JSON bodies are refused before any handler", big.status, 413);
    }

    section("account export");
    {
        eq("signed out: 401", (await http("/account/export")).status, 401);
        const res = await http("/account/export", { cookie: u.cookie });
        eq("signed in: 200", res.status, 200);
        check("downloads as a file", /attachment; filename="mind-map-meadow-\d{4}-\d{2}-\d{2}\.json"/.test(res.headers.get("content-disposition") || ""), res.headers.get("content-disposition"));
        const text = await res.text();
        const data = JSON.parse(text);
        check("has profile, tasks, money, buildings, ledger, activity", data.profile?.id === u.id && data.tasks.some((t) => t.title === "ANN TASK") && data.transactions.some((t) => t.note === "ann lunch note" && t.subcategory === "Lunch") && data.buildings.length > 0 && data.coin_ledger.length > 0 && data.activity_events.length > 0);
        eq("friends listed by name only", data.friendships.map((f) => [f.friend_name, f.status, f.direction]), [["Ben", "accepted", "sent"]]);
        check("nothing of the other user's leaks (title, email)", !text.includes("BEN TASK") && !text.includes("acctother"), "found other user's data");
        check("sign-ins listed without provider ids", data.sign_ins.length === 1 && !("provider_user_id" in data.sign_ins[0]));
        eq("a second export straight away is refused", (await http("/account/export", { cookie: u.cookie })).status, 429);
    }

    section("account delete: refusals");
    {
        eq("signed out: 401", (await http("/account/delete", { method: "POST", body: { confirm: "DELETE" } })).status, 401);
        eq("no confirm: 400", (await http("/account/delete", { method: "POST", cookie: u.cookie, body: {} })).status, 400);
        eq("wrong confirm: 400", (await http("/account/delete", { method: "POST", cookie: u.cookie, body: { confirm: "delete" } })).status, 400);
        eq("a form post (not JSON) can't confirm: 400", (await http("/account/delete", { method: "POST", cookie: u.cookie, body: "confirm=DELETE" })).status, 400);
        const evil = await fetch(`http://127.0.0.1:${process.env.PORT}/account/delete`, { method: "POST", headers: { Cookie: u.cookie, Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
        eq("another site's origin: 403", evil.status, 403);
        check("still there after all that", !!(await q1("SELECT 1 FROM users WHERE id = $1", [u.id])));
    }

    section("account delete: everything goes");
    {
        const phone = await loginAs(u.id); // a second device
        let dropped = false;
        s.on("disconnect", () => (dropped = true));
        const res = await http("/account/delete", { method: "POST", cookie: u.cookie, body: { confirm: "DELETE" } });
        eq("200 ok", [res.status, (await res.json()).ok], [200, true]);
        await sleep(300);
        check("the open socket was dropped", dropped || !s.connected);
        const left = [];
        for (const t of OWNED) if ((await q1(`SELECT COUNT(*)::int AS n FROM ${t} WHERE user_id = $1`, [u.id])).n) left.push(t);
        eq("no rows left in any table", left, []);
        eq("no user row", (await qa("SELECT 1 FROM users WHERE id = $1", [u.id])).length, 0);
        eq("friendship gone too", (await q1("SELECT COUNT(*)::int AS n FROM friendships WHERE $1 IN (requester_id, addressee_id)", [u.id])).n, 0);
        eq("every session of the account is gone", (await q1("SELECT COUNT(*)::int AS n FROM session WHERE (sess::jsonb ->> 'userId')::int = $1", [u.id])).n, 0);
        eq("the other device is signed out", (await http("/auth/me", { cookie: phone.cookie })).status, 401);
        check("the other user is untouched", (await qa("SELECT 1 FROM tasks WHERE user_id = $1 AND title = 'BEN TASK'", [other.id])).length === 1 && !!(await q1("SELECT 1 FROM player_stats WHERE user_id = $1", [other.id])));
    }
}
