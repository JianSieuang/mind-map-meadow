// User isolation: A aims every event at B's ids. B's data must not move and B must hear nothing.
import { check, eq, section, mkUser, connect, init, call, quiet, stats, setStats, mkLine, addWorker, addTask, row, userHash, q1, sleep, until, db } from "../lib/harness.mjs";

export async function run() {
    section("isolation: every event aimed at another user's ids");
    const a = await mkUser("isoa"), b = await mkUser("isob");
    const sa = await connect(a), sb = await connect(b);
    await init(sa);
    const bToday = (await init(sb)).builder.today;

    await setStats(a, { coins: 5000, town_xp: 200, pending_summons: 1 });
    await setStats(b, { coins: 5000, town_xp: 200, pending_summons: 1 });
    const mine1 = await mkLine(a, "coding", 1, 4, 3), mine2 = await mkLine(a, "coding", 1, 6, 3);
    const myInv = await mkLine(a, "coding", 1, 0, 0, { state: "inventory" });
    const myWorker = await addWorker(a, "ben");
    const hisP1 = await mkLine(b, "coding", 1, 4, 3), hisP2 = await mkLine(b, "coding", 1, 6, 3);
    const hisInv = await mkLine(b, "coding", 1, 0, 0, { state: "inventory" });
    const hisPool = await mkLine(b, "coding", 1, 0, 0, { state: "pooled" });
    const hisWorker = await addWorker(b, "ben");
    await db.query("UPDATE buildings SET stored_milli=3000 WHERE id IN ($1,$2)", [hisP1, hisP2]);
    const hisTask = await addTask(b, "Coding", { title: "BOB TITLE" });
    const hisRec = (await q1(`INSERT INTO recurring_tasks (title,category,user_id) VALUES ('BOB HABIT','Coding',$1) RETURNING id`, [b.id])).id;
    const hisGoal = (await q1(`INSERT INTO savings_goals (user_id,title,target_cents,created_on) VALUES ($1,'BOB GOAL',10000,$2) RETURNING id`, [b.id, bToday])).id;
    const hisTx = (await q1(`INSERT INTO transactions (user_id,amount_cents,direction,category,note,occurred_on,logged_on,reward_coins) VALUES ($1,4242,'expense','Food','BOB NOTE',$2,$2,5) RETURNING id`, [b.id, bToday])).id;
    await sleep(100);
    const hash = await userHash(b.id);
    const heard = sb.events.length;

    const coded = [
        ["place_building his inventory", "place_building", { buildingId: hisInv, tileX: 8, tileY: 8 }, "NOT_FOUND"],
        ["place_building his pooled", "place_building", { buildingId: hisPool, tileX: 8, tileY: 8 }, "NOT_FOUND"],
        ["move_building his", "move_building", { buildingId: hisP1, tileX: 8, tileY: 8 }, "NOT_FOUND"],
        ["merge both his", "merge_buildings", { targetId: hisP1, sourceId: hisP2 }, "NOT_FOUND"],
        ["merge his into mine", "merge_buildings", { targetId: mine1, sourceId: hisP1 }, "NOT_FOUND"],
        ["merge mine into his", "merge_buildings", { targetId: hisP1, sourceId: mine1 }, "NOT_FOUND"],
        ["collect his", "collect", { buildingId: hisP1 }, "NOT_FOUND"],
        ["set_staff_mode his", "set_staff_mode", { buildingId: hisP1, mode: "off" }, "NOT_FOUND"],
        ["assign my worker to his building", "assign_worker", { workerId: myWorker, buildingId: hisP1 }, "NOT_FOUND"],
        ["assign his worker to my building", "assign_worker", { workerId: hisWorker, buildingId: mine1 }, "NOT_FOUND"],
        ["unpin his worker", "assign_worker", { workerId: hisWorker, buildingId: null }, "NOT_FOUND"],
    ];
    for (const [label, ev, p, code] of coded) eq(`${label} -> ${code}`, (await call(sa, ev, p)).code, code);
    const saving = await call(sa, "add_transaction", { amountCents: 5000, direction: "saving", savingsGoalId: hisGoal });
    check("saving into his goal -> money_error", /isn't active/.test(saving.moneyError ?? ""), saving.moneyError);
    for (const [ev, p] of [
        ["complete_task", hisTask],
        ["edit_task", { id: hisTask, title: "x", category: "Coding", due_date: "2026-12-01" }],
        ["delete_task", hisTask],
        ["edit_recurring_task", { id: hisRec, title: "x", category: "Coding" }],
        ["toggle_recurring_task", { id: hisRec, active: false }],
        ["delete_recurring_task", hisRec],
        ["delete_transaction", hisTx],
        ["delete_savings_goal", hisGoal],
    ]) await quiet(sa, ev, p, 60);

    await sleep(100);
    eq("after all of it, every row of B is identical", await userHash(b.id), hash);
    const heardNow = sb.events.slice(heard).map(([e]) => e).filter((e) => e !== "ai_thought_broadcast");
    eq("B heard nothing", heardNow, []);
    eq("B's coins, then A's are unchanged by the failed attempts", [(await stats(b)).coins, (await stats(a)).coins], [5000, 5000]);
    check("B's rows really are B's", (await row(hisP1)).user_id === b.id && (await row(hisP1)).stored_milli === 3000);

    section("isolation: A's legitimate actions stay in A's room");
    {
        const hashB = await userHash(b.id);
        const startB = sb.events.length;
        const twin = await connect(a);
        const startTwin = twin.events.length;
        await call(sa, "place_building", { buildingId: myInv, tileX: 8, tileY: 3 });
        await call(sa, "merge_buildings", { targetId: mine1, sourceId: mine2 });
        await call(sa, "collect_all");
        await call(sa, "open_summon");
        await call(sa, "expand_zone");
        await call(sa, "purchase_building", { assetKey: "cozy_bench", tileX: 15, tileY: 12 });
        await call(sa, "set_tutorial", { step: 1, done: false });
        await call(sa, "complete_task", await addTask(a));
        await call(sa, "add_transaction", { amountCents: 100, direction: "expense" });
        const goal = await call(sa, "add_savings_goal", { title: "Mine", targetCents: 1000 });
        await until(sa, "refresh_data", "add_task", { title: "Mine", category: "Coding", due_date: "2026-12-01" });
        await until(sa, "refresh_recurring_tasks", "add_recurring_task", { title: "Mine", category: "Coding" });
        await sleep(150);
        eq("B heard none of A's events", sb.events.slice(startB).map(([e]) => e).filter((e) => e !== "ai_thought_broadcast"), []);
        eq("B's rows don't move", await userHash(b.id), hashB);
        const names = new Set(twin.events.slice(startTwin).map(([e]) => e));
        for (const ev of ["builder_state", "merge_done", "coins_collected", "summon_result", "zone_expanded", "task_reward", "refresh_data", "refresh_money", "refresh_recurring_tasks", "building_generated"]) check(`A's second tab hears ${ev}`, names.has(ev));
        check("A's goal call worked", !goal.moneyError);
    }

    section("isolation: payloads and state hold no one else's data");
    {
        const st = await init(sa);
        const text = JSON.stringify(st);
        for (const secret of ["BOB TITLE", "BOB HABIT", "BOB GOAL", "BOB NOTE", "4242"]) check(`A's init_state has no "${secret}"`, !text.includes(secret));
        const ids = st.builder.placed.map((x) => x.id).concat(st.builder.inventory.map((x) => x.id));
        check("A's state has none of B's buildings", ![hisP1, hisP2, hisInv, hisPool].some((id) => ids.includes(id)));
        check("A's stats are A's", st.stats.user_id === a.id);
        const sb0 = await init(sb);
        check("B's own state still shows B's own data", JSON.stringify(sb0).includes("BOB TITLE") && sb0.builder.coins === 5000);
    }
}
