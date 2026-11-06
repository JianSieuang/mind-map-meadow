// Double-emits and races across two tabs: nothing pays twice, coins never go negative.
import { check, eq, section, mkUser, connect, init, stats, setStats, counts, addTask, mkLine, row, sleep, qa, q1, addWorker, db, noOverlap, call } from "../lib/harness.mjs";

const both = async (label) => {
    const u = await mkUser(label);
    const s = await connect(u), t = await connect(u);
    await init(s);
    return { u, s, t };
};
const blast = (sockets, event, payload, n) => {
    for (let i = 0; i < n; i++) {
        const s = sockets[i % sockets.length];
        if (payload === undefined) s.emit(event);
        else s.emit(event, payload);
    }
};
const WAIT = 900;
const serverErrors = (sockets) => sockets.flatMap((s) => s.events).filter(([e, d]) => e === "builder_error" && d.code === "SERVER").length;

export async function run() {
    section("double-emit: complete_task");
    {
        const { u, s, t } = await both("dbl");
        const id = await addTask(u, "Fitness");
        blast([s, t], "complete_task", id, 12);
        await sleep(WAIT);
        const st = await stats(u);
        eq("12 emits on 2 tabs: one building, one payout, one set of calories", [(await counts(u)).inventory, st.coins, st.tasks_paid_today, st.buildings_today, st.town_xp, st.calories_burned], [1, 10, 1, 1, 1, 350]);
        eq("one task_reward per tab", s.events.filter(([e]) => e === "task_reward").length, 1);
    }

    section("race: 25 different tasks at once");
    {
        const { u, s, t } = await both("many");
        const ids = await Promise.all(Array.from({ length: 25 }, () => addTask(u)));
        ids.forEach((id, i) => (i % 2 ? s : t).emit("complete_task", id));
        await sleep(WAIT * 2);
        const st = await stats(u), n = await counts(u);
        eq("caps exact: 50 coins, 5 inventory, 10 pooled, xp 5", [st.coins, n.inventory, n.pooled, st.town_xp, st.tasks_paid_today, st.buildings_today], [50, 5, 10, 5, 5, 5]);
        eq("every task completed", (await q1("SELECT COUNT(*)::int n FROM tasks WHERE user_id=$1 AND status='completed'", [u.id])).n, 25);
        eq("task coins sum to the balance", (await q1("SELECT SUM(coins_earned)::int n FROM tasks WHERE user_id=$1", [u.id])).n, 50);
    }

    section("race: money");
    {
        const { u, s, t } = await both("logs");
        blast([s, t], "add_transaction", { amountCents: 100, direction: "expense", category: "Food" }, 12);
        await sleep(WAIT * 1.5);
        const st = await stats(u);
        eq("12 logs at once: 15 coins, 1 stall, xp 1", [st.coins, (await counts(u)).inventory, st.buildings_today, st.town_xp], [15, 1, 1, 1]);
        eq("all 12 saved, 3 rewarded", [(await q1("SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1", [u.id])).n, (await q1("SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1 AND reward_coins>0", [u.id])).n], [12, 3]);
        const rewarded = await q1("SELECT id FROM transactions WHERE user_id=$1 AND reward_coins>0 ORDER BY id LIMIT 1", [u.id]);
        blast([s, t], "delete_transaction", rewarded.id, 8);
        await sleep(WAIT);
        eq("delete x8: revoked once", (await stats(u)).coins, 10);
    }
    {
        const { u, s, t } = await both("goals");
        blast([s, t], "add_savings_goal", { title: "Race", targetCents: 1000 }, 8);
        await sleep(WAIT);
        eq("8 goals at once: the daily cap of 2 holds", (await q1("SELECT COUNT(*)::int n FROM savings_goals WHERE user_id=$1", [u.id])).n, 2);
        eq("each has one building, on separate spots", (await qa("SELECT DISTINCT tile_x,tile_y FROM buildings WHERE user_id=$1 AND kind='savings'", [u.id])).length, 2);
        const g = await q1("SELECT id FROM savings_goals WHERE user_id=$1 ORDER BY id LIMIT 1", [u.id]);
        blast([s, t], "add_transaction", { amountCents: 1000, direction: "saving", savingsGoalId: g.id }, 6);
        await sleep(WAIT);
        const row0 = await q1("SELECT stage,status FROM savings_goals WHERE id=$1", [g.id]);
        const st = await stats(u);
        eq("6 full-target savings at once: one milestone paid, exactly once", [row0.stage, row0.status, st.coins], [4, "completed", 40 + 5]);
    }

    section("race: collecting");
    {
        const { u, s, t } = await both("collect");
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
        await init(s);
        await db.query("UPDATE buildings SET stored_milli=3000 WHERE id IN ($1,$2)", [a, b]);
        blast([s, t], "collect_all", undefined, 10);
        await sleep(WAIT);
        eq("collect_all x10: pays once", (await stats(u)).coins, 6);
        await db.query("UPDATE buildings SET stored_milli=3000 WHERE id=$1", [a]);
        blast([s, t], "collect", { buildingId: a }, 10);
        await sleep(WAIT);
        eq("collect x10: pays once", (await stats(u)).coins, 9);
        check("storage drained", (await row(a)).stored_milli < 1000);
    }
    {
        const { u, s, t } = await both("earlybird");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await addWorker(u, "ivy");
        await init(s);
        await db.query("UPDATE buildings SET stored_milli=3000 WHERE id=$1", [a]);
        blast([s, t], "collect_all", undefined, 8);
        await sleep(WAIT);
        eq("Early Bird under a double-emit: +3 once", (await stats(u)).coins, 6);
    }

    section("race: spending");
    {
        const { u, s, t } = await both("merge");
        await setStats(u, { coins: 220, town_xp: 10 });
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
        s.emit("merge_buildings", { targetId: a, sourceId: b });
        t.emit("expand_zone");
        await sleep(WAIT);
        const st = await stats(u);
        check("merge + expand on one balance: exactly one wins, never negative", (st.coins === 195 && st.zone_step === 0) || (st.coins === 20 && st.zone_step === 1), { coins: st.coins, step: st.zone_step });
        check("coins never negative", st.coins >= 0);
    }
    {
        const { u, s, t } = await both("merge2");
        await setStats(u, { coins: 100 });
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
        blast([s, t], "merge_buildings", { targetId: a, sourceId: b }, 8);
        await sleep(WAIT);
        const st = await stats(u);
        eq("same merge x8: charged once, +1 xp once, Lv2 not Lv3", [st.coins, st.town_xp, (await row(a)).level, (await row(b)).state], [75, 1, 2, "merged"]);
    }
    {
        const { u, s, t } = await both("merge3");
        await setStats(u, { coins: 100 });
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3), c = await mkLine(u, "coding", 1, 8, 3);
        s.emit("merge_buildings", { targetId: a, sourceId: b });
        t.emit("merge_buildings", { targetId: c, sourceId: b });
        s.emit("merge_buildings", { targetId: b, sourceId: a });
        await sleep(WAIT);
        const placed = await qa("SELECT id,level FROM buildings WHERE user_id=$1 AND state='placed' ORDER BY id", [u.id]);
        const st = await stats(u);
        eq("one source can't feed two merges: 1 Lv2 + 1 Lv1, one charge", [placed.map((r) => r.level).sort(), st.coins], [[1, 2], 75]);
    }
    {
        const { u, s, t } = await both("spend");
        await setStats(u, { coins: 100 });
        for (let i = 0; i < 10; i++) (i % 2 ? s : t).emit("purchase_building", { assetKey: "cozy_bench", tileX: 4 + i, tileY: 3 });
        await sleep(WAIT);
        const st = await stats(u);
        eq("10 benches at once, 100 coins: 2 bought, 0 left", [st.coins, (await q1("SELECT COUNT(*)::int n FROM buildings WHERE user_id=$1 AND kind='decoration'", [u.id])).n], [0, 2]);
    }
    {
        const { u, s, t } = await both("spot");
        await setStats(u, { coins: 1000 });
        blast([s, t], "purchase_building", { assetKey: "cozy_bench", tileX: 4, tileY: 3 }, 8);
        await sleep(WAIT);
        eq("8 buys of one tile: one bench, one charge", [(await q1("SELECT COUNT(*)::int n FROM buildings WHERE user_id=$1", [u.id])).n, (await stats(u)).coins], [1, 950]);
    }
    {
        const { u, s, t } = await both("expand");
        await setStats(u, { coins: 200, town_xp: 10 });
        blast([s, t], "expand_zone", undefined, 6);
        await sleep(WAIT);
        const st = await stats(u);
        eq("expand x6, money for one: one step, 0 coins", [st.zone_step, st.coins], [1, 0]);
    }

    section("race: placement");
    {
        const { u, s, t } = await both("place");
        const a = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" }), b = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        s.emit("place_building", { buildingId: a, tileX: 4, tileY: 3 });
        t.emit("place_building", { buildingId: b, tileX: 4, tileY: 3 });
        await sleep(WAIT);
        eq("two rows, one tile: one lands, one stays", [(await counts(u)).placed, (await counts(u)).inventory], [1, 1]);
    }
    {
        const { u, s, t } = await both("place2");
        const a = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        s.emit("place_building", { buildingId: a, tileX: 4, tileY: 3 });
        t.emit("place_building", { buildingId: a, tileX: 8, tileY: 8 });
        await sleep(WAIT);
        const r = await row(a);
        check("one row, two spots: first wins", r.state === "placed" && ((r.tile_x === 4 && r.tile_y === 3) || (r.tile_x === 8 && r.tile_y === 8)), r);
    }
    {
        const { u, s, t } = await both("auto");
        for (let i = 0; i < 12; i++) await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        blast([s, t], "auto_place", undefined, 6);
        await sleep(WAIT);
        const r = await call(s, "request_builder_state");
        check("auto_place x6: all placed, none overlapping", r.state.placed.length === 12 && r.state.inventory.length === 0 && noOverlap(r.state.placed));
    }

    section("race: summons and workers");
    {
        const { u, s, t } = await both("summon");
        await setStats(u, { pending_summons: 3 });
        blast([s, t], "open_summon", undefined, 12);
        await sleep(WAIT);
        const st = await stats(u);
        eq("3 summons, 12 emits: 3 workers, 0 left", [(await q1("SELECT COUNT(*)::int n FROM workers WHERE user_id=$1", [u.id])).n, st.pending_summons], [3, 0]);
    }
    {
        const { u, s, t } = await both("assign");
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
        const w = await addWorker(u, "ben"), w2 = await addWorker(u, "mia");
        for (let i = 0; i < 6; i++) (i % 2 ? s : t).emit("assign_worker", { workerId: i % 4 < 2 ? w : w2, buildingId: i % 3 ? a : b });
        await sleep(WAIT);
        const r = await call(s, "request_builder_state");
        const pins = (await qa("SELECT assigned_building_id p FROM workers WHERE user_id=$1 AND assigned_building_id IS NOT NULL", [u.id])).map((x) => x.p);
        eq("no building ends with two pinned workers", new Set(pins).size, pins.length);
        const onDuty = r.state.placed.filter((x) => x.workerId !== null).map((x) => x.workerId);
        eq("no worker is on two buildings", new Set(onDuty).size, onDuty.length);
    }

    section("race: task complete vs delete");
    {
        const { u, s, t } = await both("cvd");
        const ids = await Promise.all(Array.from({ length: 6 }, () => addTask(u)));
        for (const id of ids) {
            s.emit("complete_task", id);
            t.emit("delete_task", id);
        }
        await sleep(WAIT);
        const st = await stats(u), n = await counts(u);
        const earned = (n.inventory ?? 0) + (n.pooled ?? 0);
        check("each completed task paid once, none paid without a building", st.coins === Math.min(earned, 5) * 10 && st.buildings_today === Math.min(earned, 5), { coins: st.coins, n });
    }

    section("storm: 3 tabs, every kind of action, invariants after");
    {
        const u = await mkUser("storm");
        const tabs = [await connect(u), await connect(u), await connect(u)];
        await init(tabs[0]);
        await setStats(u, { coins: 300, town_xp: 40, pending_summons: 5 });
        const ids = [];
        for (let i = 0; i < 8; i++) ids.push(await mkLine(u, ["coding", "fitness", "finance", "habit"][i % 4], 1, 4 + (i % 6) * 2, 3 + Math.floor(i / 6) * 2));
        for (let i = 0; i < 10; i++) await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        const tasks = await Promise.all(Array.from({ length: 12 }, () => addTask(u)));
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const actions = [
            () => ["collect_all"],
            () => ["auto_place"],
            () => ["open_summon"],
            () => ["expand_zone"],
            () => ["complete_task", pick(tasks)],
            () => ["merge_buildings", { targetId: pick(ids), sourceId: pick(ids) }],
            () => ["set_staff_mode", { buildingId: pick(ids), mode: pick(["auto", "priority", "off"]) }],
            () => ["collect", { buildingId: pick(ids) }],
            () => ["move_building", { buildingId: pick(ids), tileX: 4 + Math.floor(Math.random() * 10), tileY: 3 + Math.floor(Math.random() * 8) }],
            () => ["purchase_building", { assetKey: "cozy_bench", tileX: 4 + Math.floor(Math.random() * 12), tileY: 3 + Math.floor(Math.random() * 10) }],
            () => ["add_transaction", { amountCents: 100, direction: "expense" }],
            () => ["request_init_state"],
        ];
        for (let i = 0; i < 250; i++) {
            const [ev, p] = pick(actions)();
            const s = tabs[i % 3];
            if (p === undefined) s.emit(ev);
            else s.emit(ev, p);
            if (i % 25 === 0) await sleep(30);
        }
        await sleep(5000);
        const st = await stats(u);
        check("coins never negative", st.coins >= 0, st.coins);
        check("pending summons never negative", st.pending_summons >= 0);
        eq("no SERVER error (deadlock, constraint failure) in 250 mixed actions", serverErrors(tabs), 0);
        const r = await call(tabs[0], "request_builder_state");
        check("still answering", !!r.state);
        check("workers.used <= total", r.state.workers.used <= r.state.workers.total, r.state.workers);
        // Only rows placed after the seed can be checked: the seed has no overlaps either.
        check("no two placed buildings overlap", noOverlap(r.state.placed));
        check("all placed rows inside the zone (none were seeded outside)", r.state.placed.every((b) => b.insideZone));
        const onDuty = r.state.placed.filter((x) => x.workerId !== null).map((x) => x.workerId);
        eq("no worker on two buildings", new Set(onDuty).size, onDuty.length);
        const taskCoins = (await q1("SELECT COALESCE(SUM(coins_earned),0)::int n FROM tasks WHERE user_id=$1", [u.id])).n;
        check("task payouts stayed within the daily cap", taskCoins <= 50, taskCoins);
        const merged = await qa("SELECT id,merged_into FROM buildings WHERE user_id=$1 AND state='merged'", [u.id]);
        check("every merged row points at a real target", merged.every((m) => m.merged_into !== null));
    }
}
