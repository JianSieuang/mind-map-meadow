// §5.1.4, §5.12: staffing, assign_worker, summons, pity, duplicates, stars. Ability payouts are in 50.
import { rollSummon } from "../../server/builderRules.js";
import { check, eq, section, mkUser, connect, init, call, stats, setStats, mkLine, mkDeco, addWorker, B, addTask, sleep, q1, qa } from "../lib/harness.mjs";

const staffedIds = (st) => st.placed.filter((b) => b.staffed).map((b) => b.id).sort((a, b) => a - b);

export async function run() {
    section("staffing: order, beds, modes");
    {
        const u = await mkUser("staff");
        const s = await connect(u);
        await init(s);
        const ids = [];
        for (let i = 0; i < 5; i++) ids.push(await mkLine(u, "coding", 1, 4 + i * 2, 3));
        let st = (await init(s)).builder;
        eq("3 workers, 5 producers: lowest 3 ids staffed", staffedIds(st), ids.slice(0, 3));
        eq("used/total", [st.workers.used, st.workers.total], [3, 3]);
        check("unstaffed row reports rate 0 but keeps its cap", B(st, ids[4]).rateMilliPerHour === 0 && B(st, ids[4]).capMilli === 3000 && B(st, ids[4]).workerId === null);
        check("staffed Villager: workerId null, speed 10000", B(st, ids[0]).staffed && B(st, ids[0]).workerId === null && B(st, ids[0]).speedBp === 10000 && B(st, ids[0]).rateMilliPerHour === 150);
        const cot = await mkLine(u, "habit", 1, 0, 0, { state: "inventory" });
        let r = await call(s, "place_building", { buildingId: cot, tileX: 4, tileY: 5 });
        eq("placing a Cottage adds a worker", [staffedIds(r.state).length, r.state.workers.total, r.state.workers.beds], [4, 4, 1]);
        check("homes need no worker and earn nothing", B(r.state, cot).needsWorker === false && B(r.state, cot).staffed === false && B(r.state, cot).capMilli === 0 && B(r.state, cot).rateMilliPerHour === 0);
        r = await call(s, "set_staff_mode", { buildingId: ids[0], mode: "off" });
        check("off hands its worker to the next in line", !staffedIds(r.state).includes(ids[0]) && staffedIds(r.state).includes(ids[4]), staffedIds(r.state));
        r = await call(s, "set_staff_mode", { buildingId: ids[0], mode: "auto" });
        const hi = await mkLine(u, "coding", 3, 4, 7);
        r = await call(s, "set_staff_mode", { buildingId: ids[4], mode: "priority" });
        check("priority first, then level DESC, then id", staffedIds(r.state).includes(ids[4]) && staffedIds(r.state).includes(hi) && staffedIds(r.state).includes(ids[0]) && staffedIds(r.state).includes(ids[1]) && !staffedIds(r.state).includes(ids[2]), staffedIds(r.state));

        const deco = await mkDeco(u, "cozy_bench", 10, 7);
        const invRow = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        const other = await mkUser("staff-other");
        const theirs = await mkLine(other, "coding", 1, 4, 3);
        const mode = async (buildingId, m) => (await call(s, "set_staff_mode", { buildingId, mode: m })).code;
        eq("home -> MISMATCH", await mode(cot, "off"), "MISMATCH");
        eq("decoration -> MISMATCH", await mode(deco, "off"), "MISMATCH");
        eq("inventory row -> NOT_PLACED", await mode(invRow, "off"), "NOT_PLACED");
        eq("another user's -> NOT_FOUND", await mode(theirs, "off"), "NOT_FOUND");
        eq("the other user's row stays auto", (await q1("SELECT staff_mode m FROM buildings WHERE id=$1", [theirs])).m, "auto");
        eq("unknown mode", await mode(ids[0], "turbo"), "BAD_PAYLOAD");
        eq("__proto__ as mode", await mode(ids[0], "__proto__"), "BAD_PAYLOAD");
        eq("non-string mode", await mode(ids[0], 1), "BAD_PAYLOAD");
        eq("string id", await mode("1", "off"), "BAD_PAYLOAD");
        eq("null payload", (await call(s, "set_staff_mode", null)).code, "BAD_PAYLOAD");
    }

    section("staffing: worker skill match and picks");
    {
        const u = await mkUser("pick");
        const s = await connect(u);
        await init(s);
        const fin = await mkLine(u, "finance", 1, 4, 3), fit = await mkLine(u, "fitness", 1, 6, 3), cod = await mkLine(u, "coding", 1, 8, 3), extra = await mkLine(u, "coding", 1, 10, 3);
        const sam = await addWorker(u, "sam"), ben = await addWorker(u, "ben");
        const st = (await init(s)).builder;
        check("each worker lands on their own skill", B(st, fin).workerId === sam && B(st, fit).workerId === ben, [B(st, fin).workerId, B(st, fit).workerId]);
        check("summoned go before Villagers; Villagers fill the rest", B(st, cod).workerId === null && B(st, cod).staffed && B(st, extra).staffed);
        eq("total = 3 base + 2 summoned", [st.workers.total, st.workers.used], [5, 4]);
        eq("worker entry shows where they work", st.workers.summoned.find((w) => w.id === sam).buildingId, fin);
        check("worker entry has the §4 fields", ["id", "key", "name", "rarity", "skill", "ability", "stars", "assignedBuildingId"].every((k) => k in st.workers.summoned[0]));
    }

    section("assign_worker");
    {
        const u = await mkUser("assign"), other = await mkUser("assign-other");
        const s = await connect(u);
        await init(s);
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "fitness", 1, 6, 3);
        const rae = await addWorker(u, "coach_rae"), pen = await addWorker(u, "penny");
        const far = await mkLine(u, "coding", 1, 40, 40), home = await mkLine(u, "habit", 1, 4, 8), deco = await mkDeco(u, "cozy_bench", 10, 10);
        const invRow = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        const theirB = await mkLine(other, "coding", 1, 4, 3), theirW = await addWorker(other, "ben");
        const go = (workerId, buildingId) => call(s, "assign_worker", { workerId, buildingId });
        eq("unknown worker", (await go(2147483000, a)).code, "NOT_FOUND");
        eq("another user's worker", (await go(theirW, a)).code, "NOT_FOUND");
        eq("another user's building", (await go(rae, theirB)).code, "NOT_FOUND");
        eq("no such building", (await go(rae, 2147483000)).code, "NOT_FOUND");
        eq("inventory building", (await go(rae, invRow)).code, "NOT_PLACED");
        eq("outside the zone", (await go(rae, far)).code, "OUT_OF_ZONE");
        eq("a home", (await go(rae, home)).code, "MISMATCH");
        eq("a decoration", (await go(rae, deco)).code, "MISMATCH");
        for (const [label, p] of [["string worker", { workerId: "1", buildingId: a }], ["missing building", { workerId: rae }], ["float", { workerId: 1.5, buildingId: a }], ["null", null], ["array", []]]) eq(`bad payload: ${label}`, (await call(s, "assign_worker", p)).code, "BAD_PAYLOAD");
        eq("the other user's worker is unmoved", (await q1("SELECT assigned_building_id a FROM workers WHERE id=$1", [theirW])).a, null);

        let r = await go(rae, a);
        check("pin moves Coach Rae off her skill: 10000+1000+500", B(r.state, a).workerId === rae && B(r.state, a).speedBp === 11500 && r.state.workers.summoned.find((w) => w.id === rae).assignedBuildingId === a, B(r.state, a));
        r = await go(pen, a);
        check("pinning a second worker clears the first pin", r.state.workers.summoned.find((w) => w.id === rae).assignedBuildingId === null && B(r.state, a).workerId === pen);
        check("the unpinned worker goes back to auto-work", B(r.state, b).workerId === rae);
        r = await go(pen, null);
        eq("null -> back to auto", r.state.workers.summoned.find((w) => w.id === pen).assignedBuildingId, null);
        r = await go(rae, a);
        const moved = await go(rae, b);
        check("re-pinning moves the same worker", B(moved.state, b).workerId === rae && moved.state.workers.summoned.find((w) => w.id === rae).assignedBuildingId === b);
        const low = await mkLine(u, "coding", 1, 8, 3), top = await mkLine(u, "coding", 3, 10, 3);
        for (let i = 0; i < 4; i++) await mkLine(u, "coding", 3, 4 + i * 2, 5);
        r = await go(pen, low);
        check("a pin staffs its building even below better candidates", B(r.state, low).workerId === pen && B(r.state, low).staffed);
        check("used never exceeds total", r.state.workers.used <= r.state.workers.total, r.state.workers);
        r = await call(s, "set_staff_mode", { buildingId: low, mode: "off" });
        check("pinned building set to off: unstaffed; worker is free for others", B(r.state, low).staffed === false && r.state.workers.summoned.find((w) => w.id === pen).buildingId !== low);
        check("top candidates still staffed", B(r.state, top).staffed);
    }

    section("open_summon: errors, level-up grants");
    {
        const u = await mkUser("summon");
        const s = await connect(u), tab2 = await connect(u);
        await init(s);
        eq("no summons -> NO_SUMMON", (await call(s, "open_summon")).code, "NO_SUMMON");
        await setStats(u, { town_xp: 9 });
        await call(s, "complete_task", await addTask(u));
        const st = await stats(u);
        eq("a task crossing TL2 grants exactly 1 summon", [st.town_xp, st.pending_summons], [10, 1]);
        const before = tab2.events.length;
        const r = await call(s, "open_summon");
        const res = r.fx.summon_result;
        check("summon_result shape", res && res.worker.id > 0 && res.worker.key && res.worker.name && res.worker.rarity && res.worker.skill && "ability" in res.worker && res.worker.stars === 0 && res.isDuplicate === false && res.stars === 0 && res.remaining === 0, res);
        eq("state updated (a Recruiter also adds a Villager)", [r.state.workers.pendingSummons, r.state.workers.summoned.length, r.state.workers.total], [0, 1, res.worker.ability === "Recruiter" ? 5 : 4]);
        await sleep(60);
        check("summon_result reaches the other tab", tab2.events.slice(before).some(([e]) => e === "summon_result"));
        eq("spent: NO_SUMMON again", (await call(s, "open_summon")).code, "NO_SUMMON");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await setStats(u, { pending_summons: 1 });
        await call(s, "set_tutorial", { step: 0, done: false });
        const r2 = await call(s, "open_summon");
        check("reassign runs: the placed building is staffed by a summoned worker", B(r2.state, a).staffed && B(r2.state, a).workerId !== null, B(r2.state, a));
    }

    section("open_summon: 400 real pulls, odds, pity, duplicates, stars");
    {
        const u = await mkUser("pulls");
        const s = await connect(u);
        await init(s);
        await setStats(u, { pending_summons: 400 });
        const copies = {}, tally = {};
        let drought = 0, worstDrought = 0, badPity = null, badDup = null, badStar = null, badRemain = null, last = null, sinceDb = 0;
        for (let i = 0; i < 400; i++) {
            const r = await call(s, "open_summon");
            const res = r.fx.summon_result;
            if (!res) throw new Error(`pull ${i} got no summon_result: ${JSON.stringify(r.error)}`);
            const { worker } = res;
            const epic = worker.rarity === "Epic" || worker.rarity === "Legendary";
            if (drought >= 9 && !epic) badPity = { i, worker };
            drought = epic ? 0 : drought + 1;
            worstDrought = Math.max(worstDrought, drought);
            const had = copies[worker.key] || 0;
            copies[worker.key] = had + 1;
            tally[worker.rarity] = (tally[worker.rarity] || 0) + 1;
            if (res.isDuplicate !== had > 0) badDup = { i, res };
            if (res.stars !== Math.min(3, had) || worker.stars !== res.stars) badStar = { i, res, had };
            if (res.remaining !== 399 - i) badRemain = { i, remaining: res.remaining };
            if (r.state.workers.pityIn !== 10 - drought) sinceDb = { i, pityIn: r.state.workers.pityIn, drought };
            last = r;
        }
        eq("never more than 9 pulls without Epic+", badPity, null);
        check("pity counter never exceeded 9", worstDrought <= 9, worstDrought);
        eq("isDuplicate correct on every pull", badDup, null);
        eq("stars = min(3, copies-1) on every pull", badStar, null);
        eq("remaining counts down exactly", badRemain, null);
        eq("pityIn counts down exactly", sinceDb, 0);
        eq("every pull adds a worker row", (await q1("SELECT COUNT(*)::int n FROM workers WHERE user_id=$1", [u.id])).n, 400);
        const st = await stats(u);
        eq("no summons left", st.pending_summons, 0);
        eq("summons_since_epic matches", st.summons_since_epic, drought);
        check("every owned key is in the catalog", (await qa("SELECT DISTINCT worker_key k FROM workers WHERE user_id=$1", [u.id])).every((r) => last.state.rules.WORKER_CATALOG.some((w) => w.key === r.k)));
        check("state stars shared by all copies", last.state.workers.summoned.every((w) => w.stars === Math.min(3, copies[w.key] - 1)));
        check("all 12 workers can be pulled", Object.keys(copies).length === 12, copies);
        // Pity raises Epic+ above the 15% base, so only sanity bounds on the live stream.
        check("rarity mix is plausible for 400 pulls", tally.Normal > 150 && tally.Normal < 290 && tally.Rare > 60 && tally.Rare < 140 && tally.Epic > 25 && tally.Legendary >= 1, tally);
    }

    section("open_summon: forced pity");
    {
        const u = await mkUser("pity");
        const s = await connect(u);
        await init(s);
        let bad = null;
        await setStats(u, { pending_summons: 40 });
        for (let i = 0; i < 40; i++) {
            await setStats(u, { summons_since_epic: 9 });
            const r = await call(s, "open_summon");
            const rarity = r.fx.summon_result?.worker.rarity;
            if ((rarity !== "Epic" && rarity !== "Legendary") || r.state.workers.pityIn !== 10) bad = { i, rarity, pityIn: r.state.workers.pityIn };
        }
        eq("at since_epic = 9, 40 of 40 pulls are Epic+ and pity resets", bad, null);
        eq("resets the DB counter", (await stats(u)).summons_since_epic, 0);
    }

    section("rollSummon: odds at scale");
    {
        const tally = {};
        for (let i = 0; i < 200000; i++) {
            const w = rollSummon(0);
            tally[w.rarity] = (tally[w.rarity] || 0) + 1;
        }
        const pct = (k) => tally[k] / 2000;
        check("within 0.5 points of 60/25/12/3", Math.abs(pct("Normal") - 60) < 0.5 && Math.abs(pct("Rare") - 25) < 0.5 && Math.abs(pct("Epic") - 12) < 0.5 && Math.abs(pct("Legendary") - 3) < 0.5, tally);
        const pity = {};
        for (let i = 0; i < 40000; i++) {
            const w = rollSummon(9);
            pity[w.rarity] = (pity[w.rarity] || 0) + 1;
        }
        check("pity draws Epic:Legendary at 12:3, nothing else", Object.keys(pity).length === 2 && Math.abs(pity.Epic / 400 - 80) < 1 && Math.abs(pity.Legendary / 400 - 20) < 1, pity);
        check("since_epic 8 is not pity", Array.from({ length: 3000 }, () => rollSummon(8)).some((w) => w.rarity === "Normal"));
    }
}
