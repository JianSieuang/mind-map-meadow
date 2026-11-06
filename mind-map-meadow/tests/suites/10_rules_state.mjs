// §1 numbers, §4 payload shape, migrated towns as the server shows them, tutorial.
import { townLevel, xpBounds } from "../../server/rewards.js";
import { check, eq, section, mkUser, loginAs, connect, init, call, stats, q1, setStats } from "../lib/harness.mjs";

const ZONE_TABLE = [
    [0, 4, 3, 12, 10, 30, 1, 0],
    [1, 3, 2, 16, 12, 48, 2, 200],
    [2, 2, 2, 20, 16, 80, 3, 500],
    [3, 2, 1, 26, 20, 130, 5, 1000],
    [4, 1, 1, 34, 26, 221, 7, 2000],
    [5, 0, 0, 44, 32, 352, 9, 7000],
    [6, 0, 0, 56, 40, 560, 11, 11000],
    [7, 0, 0, 70, 50, 875, 13, 16000],
];
const ROSTER = [
    ["Ben", "Normal", "Trainer", null], ["Mia", "Normal", "Scholar", null], ["Sam", "Normal", "Merchant", null], ["Joe", "Normal", "All-rounder", null],
    ["Coach Rae", "Rare", "Trainer", "Quick Hands"], ["Ivy", "Rare", "Scholar", "Early Bird"], ["Penny", "Rare", "Merchant", "Deep Pockets"],
    ["Max Iron", "Epic", "Trainer", "Cheerleader"], ["Professor Lin", "Epic", "Scholar", "Recruiter"], ["Madam Gold", "Epic", "Merchant", "Bargainer"],
    ["Old Tom", "Legendary", "All-rounder", "Master Builder"], ["Mayor Star", "Legendary", "All-rounder", "Town Hero"],
];

export async function run() {
    section("rules: pure numbers");
    const levels = { 0: 1, 9: 1, 10: 2, 29: 2, 30: 3, 59: 3, 60: 4, 99: 4, 100: 5, 149: 5, 150: 6, 210: 7, 280: 8, 360: 9, 450: 10 };
    for (const [xp, level] of Object.entries(levels)) eq(`townLevel(${xp}) = ${level}`, townLevel(Number(xp)), level);
    eq("xpBounds(3)", xpBounds(3), { xpForThis: 30, xpForNext: 60 });

    const u = await mkUser("rules");
    const s = await connect(u);
    const st = await init(s);
    const b = st.builder;
    const r = b.rules;

    section("state: rules sent to the client match §1");
    eq("DAILY_BUILDING_CAP", r.DAILY_BUILDING_CAP, 5);
    eq("task coins", [r.TASK_COINS, r.TASK_COINS_PER_DAY], [10, 5]);
    eq("log coins", [r.LOG_COINS, r.LOG_COINS_PER_DAY], [5, 3]);
    eq("RATE_MILLI", r.RATE_MILLI, { 1: 150, 2: 400, 3: 1000 });
    eq("STORAGE_HOURS / SLEEPY", [r.STORAGE_HOURS, r.SLEEPY_AFTER_HOURS], [20, 72]);
    eq("MERGE_COST", r.MERGE_COST, { 1: 25, 2: 150 });
    eq("MERGE_TOWN_LEVEL", r.MERGE_TOWN_LEVEL, { 1: 1, 2: 5 });
    eq("BASE_WORKERS", r.BASE_WORKERS, 3);
    eq("BEDS", r.BEDS, { 1: 1, 2: 2, 3: 4 });
    eq("POOL_MAX", r.POOL_MAX, 10);
    eq("SHOP", r.SHOP, { cozy_bench: 50, garden_fountain: 150 });
    eq("NAMES", r.NAMES, { fitness: ["Training Yard", "Gym", "Sports Arena"], coding: ["Shed Workshop", "Library", "Academy"], finance: ["Stall", "Market", "Bank"], habit: ["Cottage", "House", "Manor"] });
    eq("RARITIES odds", Object.entries(r.RARITIES).map(([k, v]) => [k, v.odds, v.multiplier]), [["Normal", 60, 1], ["Rare", 25, 1.1], ["Epic", 12, 1.25], ["Legendary", 3, 1.5]]);
    eq("WORKER_CATALOG matches WORKER_DESIGN §4", r.WORKER_CATALOG.map((w) => [w.name, w.rarity, w.skill, w.ability]), ROSTER);
    eq("ZONES match the §1 table", r.ZONES.map((z) => [z.step, z.x, z.y, z.w, z.h, Math.floor(z.w / 2) * Math.floor(z.h / 2), z.townLevel, z.cost]), ZONE_TABLE);
    check("every zone contains the one before it", r.ZONES.every((z, i) => i === 0 || (z.x <= r.ZONES[i - 1].x && z.y <= r.ZONES[i - 1].y && z.x + z.w >= r.ZONES[i - 1].x + r.ZONES[i - 1].w && z.y + z.h >= r.ZONES[i - 1].y + r.ZONES[i - 1].h)));
    eq("zone 7 is the whole 70x50 map", [r.ZONES[7].w, r.ZONES[7].h], [70, 50]);

    section("state: §4 payload for a brand new town");
    for (const key of ["serverNow", "today", "coins", "town", "zone", "workers", "sleepy", "sleepyAt", "today_counts", "pool", "placed", "inventory", "rules", "tutorial"]) check(`builder.${key} present`, key in b);
    eq("town", b.town, { level: 1, xp: 0, xpForThis: 0, xpForNext: 10 });
    eq("zone", [b.zone.step, b.zone.x, b.zone.y, b.zone.w, b.zone.h, b.zone.next.step, b.zone.next.townLevel, b.zone.next.cost], [0, 4, 3, 12, 10, 1, 2, 200]);
    eq("workers", [b.workers.total, b.workers.used, b.workers.base, b.workers.beds, b.workers.recruiterBonus, b.workers.pendingSummons, b.workers.pityIn], [3, 0, 3, 0, 0, 0, 10]);
    eq("today_counts", b.today_counts, { buildings: 0, buildingCap: 5, tasksPaid: 0, tasksPaidCap: 5, logsPaid: 0, logsPaidCap: 3 });
    eq("pool", b.pool, { count: 0, max: 10, nextReleaseAvailable: false });
    eq("tutorial", b.tutorial, { step: 0, done: false });
    check("init_state keeps its old keys", ["player", "ai", "buildings", "stats", "tasks", "recurringTasks", "transactions", "savingsGoals"].every((k) => k in st));

    section("state: a user with no stats row self-heals");
    {
        const n = await mkUser("nostats", { noStats: true });
        const c = await connect(n);
        const got = await init(c);
        check("init_state arrives, stats row created on the new system", got?.builder?.coins === 0 && (await stats(n)).builder_migrated === true, got?.builder?.coins);
    }

    section("state: migrated towns through the live server");
    {
        const l3 = await connect(await loginAs(9001));
        const st3 = await init(l3);
        const m = st3.builder;
        eq("Legacy3 shows TL3, 2 summons, zone 0", [m.town.level, m.workers.pendingSummons, m.zone.step, m.coins], [3, 2, 0, 1000]);
        check("init_state.buildings holds placed rows only", st3.buildings.length === m.placed.length && st3.buildings.every((x) => x.state === "placed"));
        const sm = m.placed.find((x) => x.asset_key === "finance_2");
        check("heritage outside the zone: dimmed, unstaffed, producing nothing", sm.insideZone === false && sm.staffed === false && sm.rateMilliPerHour === 0, sm);
        const bench = m.placed.find((x) => x.asset_key === "cozy_bench");
        check("decoration needs no worker", bench.needsWorker === false && bench.capMilli === 0 && bench.staffed === false);
        const homes = m.placed.filter((x) => x.line === "habit");
        check("overlapping heritage homes each count a bed inside the zone", homes.length === 2 && homes.every((h) => h.insideZone && h.beds === 1) && m.workers.beds === 2 && m.workers.total === 5, m.workers);
        const noRealUser = await q1("SELECT id FROM buildings WHERE content='orphan'");
        check("orphan building shows in nobody's town", !m.placed.some((x) => x.id === noRealUser.id));
        const l7 = await connect(await loginAs(9007));
        const m7 = (await init(l7)).builder;
        const fr = m7.placed.find((x) => x.line === "finance");
        check("heritage producer inside the zone gets staffed on first visit", fr.insideZone && fr.staffed && fr.rateMilliPerHour === 400 && fr.capMilli === 8000, fr);
        const real = await q1("SELECT user_id FROM buildings WHERE COALESCE(user_id,0) NOT BETWEEN 9001 AND 9100 AND user_id IS NOT NULL LIMIT 1");
        if (real) {
            const c = await connect(await loginAs(real.user_id)); // a forged session for the copied row, in the test DB only
            const rs = (await init(c)).builder;
            check("copy of the real town loads", rs.placed.length === 6 && rs.workers.total === 3 + rs.placed.filter((x) => x.insideZone).length && rs.workers.used === 0, { placed: rs.placed.length, total: rs.workers.total });
        }
    }

    section("set_tutorial");
    const before = (await stats(u)).coins;
    let t = await call(s, "set_tutorial", { step: 3, done: false });
    eq("saves step", t.state.tutorial, { step: 3, done: false });
    t = await call(s, "set_tutorial", { step: 20, done: true });
    eq("saves top step and done", t.state.tutorial, { step: 20, done: true });
    t = await call(s, "set_tutorial", { step: 0, done: false });
    eq("replay guide resets", t.state.tutorial, { step: 0, done: false });
    for (const [label, payload] of [["step 21", { step: 21, done: false }], ["step -1", { step: -1, done: false }], ["step 1.5", { step: 1.5, done: false }], ["string step", { step: "1", done: false }], ["string done", { step: 1, done: "yes" }], ["missing done", { step: 1 }], ["null", null], ["array", []]]) {
        eq(`set_tutorial ${label} -> BAD_PAYLOAD`, (await call(s, "set_tutorial", payload)).code, "BAD_PAYLOAD");
    }
    eq("set_tutorial pays nothing", (await stats(u)).coins, before);
    await setStats(u, { coins: 0 });

    section("request_builder_state");
    const twin = await connect(u);
    const start = twin.events.length;
    const got = await call(s, "request_builder_state");
    check("answers the asking socket", got.state?.coins === 0);
    await new Promise((r) => setTimeout(r, 100));
    eq("does not broadcast to the user's other tab", twin.events.slice(start).filter(([e]) => e === "builder_state").length, 0);
}
