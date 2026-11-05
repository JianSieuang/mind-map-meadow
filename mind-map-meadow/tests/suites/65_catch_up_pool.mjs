// §5.9 catch-up pool, over real local days on the clock server.
import { check, eq, section, mkUser, connect, init, call, stats, setStats, counts, addTask, setClock, advanceHours, CLOCK_PORT, qa, sleep, mkLine } from "../lib/harness.mjs";

const T0 = "2027-02-01T12:00:00.000Z";
async function fresh(label) {
    await setClock(T0);
    const u = await mkUser(label, { active: T0 });
    const s = await connect(u, { port: CLOCK_PORT });
    await init(s);
    return { u, s };
}
const pooledRows = (u) => qa("SELECT id,generated_on,state,released_on FROM buildings WHERE user_id=$1 AND source_task_id IS NOT NULL ORDER BY id", [u.id]);

export async function run() {
    section("catch-up: one release per later day");
    {
        const { u, s } = await fresh("pool");
        for (let i = 0; i < 8; i++) await call(s, "complete_task", await addTask(u));
        let n = await counts(u);
        eq("day 1: 5 inventory, 3 pooled", [n.inventory, n.pooled], [5, 3]);
        let st = (await init(s)).builder;
        eq("a row pooled today isn't released today", [st.inventory.length, st.pool.count, st.pool.nextReleaseAvailable], [5, 3, false]);

        const rows = await pooledRows(u);
        const pooled = rows.filter((r) => r.state === "pooled");
        await advanceHours(24);
        const xpBefore = (await stats(u)).town_xp, coinsBefore = (await stats(u)).coins;
        const start = s.events.length;
        const day2 = await init(s);
        st = day2.builder;
        await sleep(50);
        n = await counts(u);
        eq("day 2, first visit: exactly 1 moves", [n.inventory, n.pooled], [6, 2]);
        eq("init_state already reflects the release", [st.inventory.length, st.pool.count, st.pool.nextReleaseAvailable], [6, 2, false]);
        const fx = s.events.slice(start).find(([e, d]) => e === "building_generated" && d.reason === "catch_up");
        check("building_generated{catch_up} carries the building", fx && fx[1].building?.id === pooled[0].id && fx[1].building.state === "inventory", fx);
        const r0 = (await pooledRows(u)).find((r) => r.id === pooled[0].id);
        eq("the oldest row went first, stamped with today", [r0.state, r0.released_on], ["inventory", "2027-02-02"]);
        const after = await stats(u);
        eq("+1 town xp, no coins", [after.town_xp - xpBefore, after.coins - coinsBefore], [1, 0]);
        eq("doesn't count toward today's building cap", [after.buildings_today, st.today_counts.buildings], [0, 0]);
        eq("pool_released_on", after.pool_released_on, "2027-02-02");

        await init(s);
        await init(s);
        n = await counts(u);
        eq("reloading the same day releases nothing more", [n.inventory, n.pooled], [6, 2]);
        const col = await call(s, "collect_all");
        n = await counts(u);
        eq("nor does collect_all that day", [n.inventory, n.pooled, col.all.filter(([e]) => e === "building_generated").length], [6, 2, 0]);

        await advanceHours(24);
        const viaCollect = await call(s, "collect_all");
        n = await counts(u);
        eq("day 3: collect_all counts as the visit", [n.inventory, n.pooled], [7, 1]);
        check("its fx carries the release", viaCollect.fx.building_generated?.reason === "catch_up" && viaCollect.fx.building_generated.building?.state === "inventory", viaCollect.fx.building_generated);
        await init(s);
        eq("then a reload that day releases nothing", (await counts(u)).pooled, 1);

        await advanceHours(24);
        const day4 = await call(s, "request_builder_state");
        eq("a bare request_builder_state isn't a visit", [day4.state.pool.count, day4.state.pool.nextReleaseAvailable, (await counts(u)).pooled], [1, true, 1]);
        await init(s);
        eq("day 4: the last row", (await counts(u)).pooled ?? 0, 0);
        await advanceHours(24);
        const empty = (await stats(u)).pool_released_on;
        await init(s);
        eq("empty pool: no release recorded", (await stats(u)).pool_released_on, empty);
    }

    section("catch-up: a row pooled on day 2 waits until day 3, older rows first");
    {
        const { u, s } = await fresh("pool2");
        const today = (await init(s)).builder.today;
        await setStats(u, { counters_day: today, buildings_today: 5 });
        const a = await addTask(u);
        await call(s, "complete_task", a);
        await advanceHours(24);
        await init(s); // releases a
        await setStats(u, { buildings_today: 5 });
        const b = await addTask(u);
        await call(s, "complete_task", b);
        const rows = await pooledRows(u);
        eq("first released, second pooled", rows.map((r) => r.state), ["inventory", "pooled"]);
        await init(s);
        eq("same day: the new one waits", (await counts(u)).pooled, 1);
        await advanceHours(24);
        await init(s);
        eq("next day it comes out", (await counts(u)).pooled ?? 0, 0);
    }

    section("catch-up: release ordering across days and a level-up");
    {
        const { u, s } = await fresh("pool3");
        const first = await mkLine(u, "coding", 1, 0, 0, { state: "pooled" });
        const newer = await mkLine(u, "fitness", 1, 0, 0, { state: "pooled" });
        const oldest = await mkLine(u, "finance", 1, 0, 0, { state: "pooled" });
        await qa("UPDATE buildings SET generated_on = CASE id WHEN $1::int THEN '2027-01-20'::date WHEN $2::int THEN '2027-01-25'::date ELSE '2027-01-10'::date END WHERE user_id=$3", [first, newer, u.id]);
        await setStats(u, { town_xp: 9 });
        const st = (await init(s)).builder;
        check("generated_on decides, not id", st.inventory.length === 1 && st.inventory[0].id === oldest, st.inventory.map((b) => b.id));
        const after = await stats(u);
        eq("a release crossing TL2 grants a summon", [after.town_xp, after.pending_summons, st.workers.pendingSummons], [10, 1, 1]);
    }

    section("catch-up: racing visits on a new day");
    {
        const { u, s } = await fresh("pool4");
        const s2 = await connect(u, { port: CLOCK_PORT });
        for (let i = 0; i < 4; i++) await mkLine(u, "coding", 1, 0, 0, { state: "pooled" });
        await qa("UPDATE buildings SET generated_on='2027-01-01' WHERE user_id=$1", [u.id]);
        await advanceHours(24);
        await Promise.all([init(s), init(s2), init(s), init(s2), call(s, "collect_all"), call(s2, "collect_all")]);
        await sleep(200);
        eq("6 racing visits release exactly 1", [(await counts(u)).inventory, (await counts(u)).pooled], [1, 3]);
        eq("and pay +1 xp once", (await stats(u)).town_xp, 1);
    }

    section("caps reset on a new day; pool isn't a way past them");
    {
        const { u, s } = await fresh("pool5");
        for (let i = 0; i < 6; i++) await call(s, "complete_task", await addTask(u));
        await advanceHours(24);
        const r = await call(s, "complete_task", await addTask(u));
        eq("day 2, task 1: paid again, inventory", [r.fx.task_reward.coins, r.fx.task_reward.paidToday, r.fx.task_reward.building], [10, 1, "inventory"]);
        eq("counters rolled", [r.state.today_counts.buildings, r.state.today_counts.tasksPaid], [1, 1]);
        eq("total: 5x10 + 10", (await stats(u)).coins, 60);
    }
}
