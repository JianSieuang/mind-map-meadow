// Every inbound event against every kind of junk. The server must stay up and keep the user's data.
import { check, eq, section, mkUser, connect, init, call, stats, setStats, sleep, http, userHash } from "../lib/harness.mjs";

const EVENTS = [
    "request_init_state", "request_builder_state", "place_building", "auto_place", "move_building", "merge_buildings", "collect", "collect_all", "set_staff_mode", "expand_zone", "open_summon", "assign_worker", "set_tutorial", "purchase_building",
    "complete_task", "add_task", "edit_task", "delete_task", "add_recurring_task", "edit_recurring_task", "toggle_recurring_task", "delete_recurring_task", "player_move",
    "add_transaction", "delete_transaction", "add_savings_goal", "delete_savings_goal",
    "request_friends_state", "search_users", "send_friend_request", "respond_friend_request", "remove_friend", "visit_friend_map",
];
const JUNK = [
    undefined, null, 0, -1, 1.5, 1e308, "", "x", "\u0000", "a".repeat(100000), true, [], [1, 2, 3], {},
    { buildingId: "1;DROP TABLE buildings" }, { buildingId: { $ne: null } }, { id: [] }, { id: 2147483648 }, { title: {}, category: {}, due_date: {} }, { title: "\u0000", category: "\u0000", due_date: "\u0000" },
    { title: "ok", category: "Coding", due_date: "2026-12-01", estimated_minutes: 1e12 }, { title: "ok", category: "Coding", due_date: "2026-12-01", estimated_minutes: "abc" },
    { amountCents: 100, direction: "expense", note: "\u0000" }, { amountCents: 100, direction: "expense", category: "\u0000" }, { query: "\u0000\u0000" }, { friendId: 2147483648 }, { addresseeId: 2147483648 }, { requestId: 2147483648, accept: true }, { friendshipId: 2147483648 },
    { title: "\u0000", targetCents: 1000 }, JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}'), { days_of_week: "x", title: "ok", category: "Coding" },
];

export async function run() {
    section("fuzz: every event x every junk payload");
    const u = await mkUser("fuzz");
    const s = await connect(u);
    await init(s);
    await setStats(u, { coins: 0 });
    const victim = await mkUser("fuzz-victim");
    const victimHash = await userHash(victim.id);

    for (const junk of JUNK) {
        for (const ev of EVENTS) {
            if (junk === undefined) s.emit(ev);
            else s.emit(ev, junk);
        }
        await sleep(40);
    }
    await sleep(2500);

    eq("HTTP still answers", (await http("/auth/me")).status, 401);
    check("the same socket is still connected", s.connected);
    const r = await call(s, "request_builder_state", undefined, 8000);
    check("the socket still gets answers", !!r.state, r.error);
    check("no polluted prototype on the server's replies", r.state && !("polluted" in r.state));
    check("coins are not negative", (await stats(u)).coins >= 0);
    eq("no other user's data moved", await userHash(victim.id), victimHash);

    section("fuzz: extra arguments and acks");
    {
        s.emit("collect_all", {}, "extra", 5);
        s.emit("complete_task", 1, () => {});
        s.emit("request_init_state", () => {});
        s.emit("not_a_real_event", { a: 1 });
        await sleep(200);
        check("still alive", !!(await call(s, "request_builder_state")).state);
    }

    section("fuzz: a new user still works after all that");
    {
        const n = await mkUser("fuzz-after");
        const c = await connect(n);
        const st = await init(c);
        check("fresh login gets a full state", st?.builder?.coins === 0 && st.builder.rules.WORKER_CATALOG.length === 12);
    }
}
