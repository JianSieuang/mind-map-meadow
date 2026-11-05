// Local-day boundaries, actually crossed, on the clock server: Los Angeles and Tokyo, plus DST,
// a half-hour zone, and switching zones to dodge the caps.
import { check, eq, section, mkUser, connect, init, call, stats, counts, addTask, setClock, CLOCK_PORT, qa, q1, until, sleep, mkLine, addWorker, db } from "../lib/harness.mjs";

const LA = "America/Los_Angeles", TOKYO = "Asia/Tokyo";
const open = (u, tz) => connect(u, { port: CLOCK_PORT, tz });
const log = (s) => call(s, "add_transaction", { amountCents: 100, direction: "expense", category: "Food" });
const today = async (s) => (await init(s)).builder.today;
const task = async (s, u) => (await call(s, "complete_task", await addTask(u))).fx.task_reward;

export async function run() {
    section("day keys: exact local dates either side of midnight");
    for (const [iso, tz, expected] of [
        ["2027-01-15T07:59:00.000Z", LA, "2027-01-14"],
        ["2027-01-15T08:01:00.000Z", LA, "2027-01-15"],
        ["2027-01-15T14:59:00.000Z", TOKYO, "2027-01-15"],
        ["2027-01-15T15:01:00.000Z", TOKYO, "2027-01-16"],
        ["2027-03-14T07:59:00.000Z", LA, "2027-03-13"],
        ["2027-03-14T08:01:00.000Z", LA, "2027-03-14"],
        ["2027-03-15T06:59:00.000Z", LA, "2027-03-14"], // the 23-hour DST day ends an hour early in UTC
        ["2027-03-15T07:01:00.000Z", LA, "2027-03-15"],
        ["2027-11-07T06:59:00.000Z", LA, "2027-11-06"],
        ["2027-11-07T07:01:00.000Z", LA, "2027-11-07"],
        ["2027-11-08T07:59:00.000Z", LA, "2027-11-07"], // the 25-hour day ends an hour late
        ["2027-11-08T08:01:00.000Z", LA, "2027-11-08"],
        ["2027-01-15T18:29:00.000Z", "Asia/Kolkata", "2027-01-15"],
        ["2027-01-15T18:31:00.000Z", "Asia/Kolkata", "2027-01-16"],
        ["2027-12-31T23:59:00.000Z", "UTC", "2027-12-31"],
        ["2028-01-01T00:01:00.000Z", "UTC", "2028-01-01"],
    ]) {
        await setClock(iso);
        const u = await mkUser("key", { active: iso });
        const s = await open(u, tz);
        eq(`${iso} in ${tz} = ${expected}`, await today(s), expected);
        s.close();
    }

    section("task caps: Los Angeles midnight, Tokyo keeps its day");
    {
        const T = "2027-01-15T07:59:00.000Z";
        await setClock(T);
        const la = await mkUser("la", { active: T }), tk = await mkUser("tokyo", { active: T });
        const sLa = await open(la, LA), sTk = await open(tk, TOKYO);
        eq("LA is on the 14th", await today(sLa), "2027-01-14");
        eq("Tokyo is on the 15th", await today(sTk), "2027-01-15");
        for (let i = 0; i < 5; i++) {
            await task(sLa, la);
            await task(sTk, tk);
        }
        eq("LA's 6th at 23:59 pays nothing, pools", [(await task(sLa, la)).coins, (await stats(la)).coins], [0, 50]);
        eq("Tokyo's 6th pays nothing, pools", [(await task(sTk, tk)).coins, (await stats(tk)).coins], [0, 50]);
        eq("generated_on is the LA local day", (await q1("SELECT generated_on g FROM buildings WHERE user_id=$1 ORDER BY id LIMIT 1", [la.id])).g, "2027-01-14");

        await setClock("2027-01-15T08:01:00.000Z");
        const r = await task(sLa, la);
        eq("LA 00:01: paid again, into inventory", [r.coins, r.paidToday, r.building], [10, 1, "inventory"]);
        const rt = await task(sTk, tk);
        eq("Tokyo at the same instant: still capped", [rt.coins, rt.paidToday, rt.building], [0, 5, "pooled"]);
        eq("counters_day per user", [(await stats(la)).counters_day, (await stats(tk)).counters_day], ["2027-01-15", "2027-01-15"]);

        await setClock("2027-01-15T14:59:00.000Z");
        eq("Tokyo 23:59: still capped", (await task(sTk, tk)).coins, 0);
        await setClock("2027-01-15T15:01:00.000Z");
        eq("Tokyo 00:01: paid again", (await task(sTk, tk)).coins, 10);
        const stillLa = await task(sLa, la);
        eq("LA in the same minute: same local day, counter continues", [stillLa.coins, stillLa.paidToday], [10, 2]);
    }

    section("money caps and the stall cross midnight per user");
    {
        const T = "2027-01-15T07:59:00.000Z";
        await setClock(T);
        const la = await mkUser("mla", { active: T }), tk = await mkUser("mtk", { active: T });
        const sLa = await open(la, LA), sTk = await open(tk, TOKYO);
        await init(sLa);
        await init(sTk);
        for (let i = 0; i < 4; i++) {
            await log(sLa);
            await log(sTk);
        }
        eq("before midnight: LA 15 coins, 1 stall", [(await stats(la)).coins, (await counts(la)).inventory], [15, 1]);
        eq("logged_on is LA's local day", (await q1("SELECT logged_on l FROM transactions WHERE user_id=$1 LIMIT 1", [la.id])).l, "2027-01-14");
        await setClock("2027-01-15T08:01:00.000Z");
        const r = await log(sLa);
        eq("LA 00:01: paid, second stall", [(await stats(la)).coins, (await counts(la)).inventory, r.fx.building_generated?.reason], [20, 2, "money_log"]);
        await log(sTk);
        eq("Tokyo at the same instant: capped, no new stall", [(await stats(tk)).coins, (await counts(tk)).inventory], [15, 1]);
        await setClock("2027-01-15T15:01:00.000Z");
        await log(sTk);
        eq("Tokyo 00:01: paid, second stall", [(await stats(tk)).coins, (await counts(tk)).inventory], [20, 2]);
    }

    section("savings-goal cap crosses midnight per user");
    {
        const T = "2027-01-15T07:59:00.000Z";
        await setClock(T);
        const la = await mkUser("gla", { active: T });
        const s = await open(la, LA);
        await init(s);
        const add = (title) => call(s, "add_savings_goal", { title, targetCents: 1000 });
        await add("a");
        await add("b");
        check("third goal at 23:59 refused", /per day/.test((await add("c")).moneyError ?? ""));
        eq("created_on is local", (await q1("SELECT created_on c FROM savings_goals WHERE user_id=$1 LIMIT 1", [la.id])).c, "2027-01-14");
        await setClock("2027-01-15T08:01:00.000Z");
        eq("00:01: allowed again", (await add("c")).moneyError, null);
    }

    section("habits: one instance per local day");
    {
        const T = "2027-01-15T07:59:00.000Z";
        await setClock(T);
        const la = await mkUser("hla", { active: T }), tk = await mkUser("htk", { active: T });
        const sLa = await open(la, LA), sTk = await open(tk, TOKYO);
        await init(sLa);
        await init(sTk);
        const a = await until(sLa, "refresh_recurring_tasks", "add_recurring_task", { title: "h", category: "Coding" });
        const b = await until(sTk, "refresh_recurring_tasks", "add_recurring_task", { title: "h", category: "Coding" });
        await sleep(80);
        const dues = (id) => qa("SELECT due_date d FROM tasks WHERE recurring_task_id=$1 ORDER BY due_date", [id]);
        eq("LA instance due the 14th", (await dues(a.recurringTasks[0].id)).map((r) => r.d), ["2027-01-14"]);
        eq("Tokyo instance due the 15th", (await dues(b.recurringTasks[0].id)).map((r) => r.d), ["2027-01-15"]);
        await setClock("2027-01-15T08:01:00.000Z");
        await init(await open(la, LA));
        await init(await open(tk, TOKYO));
        eq("after LA midnight: LA gets the 15th too", (await dues(a.recurringTasks[0].id)).map((r) => r.d), ["2027-01-14", "2027-01-15"]);
        eq("Tokyo gets nothing new", (await dues(b.recurringTasks[0].id)).map((r) => r.d), ["2027-01-15"]);
    }

    section("Early Bird and catch-up follow the local day");
    {
        const T = "2027-01-15T07:30:00.000Z";
        await setClock(T);
        const la = await mkUser("ebla", { active: T });
        const b = await mkLine(la, "coding", 3, 4, 3);
        await addWorker(la, "ivy");
        const s = await open(la, LA);
        await init(s);
        await db.query("UPDATE buildings SET stored_milli=5000 WHERE id=$1", [b]);
        eq("23:30: +3", (await call(s, "collect_all")).fx.coins_collected.bonus, 3);
        await setClock("2027-01-15T08:01:00.000Z");
        await db.query("UPDATE buildings SET stored_milli=5000 WHERE id=$1", [b]);
        eq("00:01 that's 31 minutes later, a new local day: +3 again", (await call(s, "collect_all")).fx.coins_collected.bonus, 3);
        await db.query("UPDATE buildings SET stored_milli=5000 WHERE id=$1", [b]);
        eq("then not again", (await call(s, "collect_all")).fx.coins_collected.bonus, 0);
    }
    {
        const T = "2027-01-15T07:59:00.000Z";
        await setClock(T);
        const la = await mkUser("cpla", { active: T });
        const s = await open(la, LA);
        await init(s);
        for (let i = 0; i < 6; i++) await task(s, la);
        eq("pooled at LA 23:59", (await counts(la)).pooled, 1);
        await init(s);
        eq("not released that local day", (await counts(la)).pooled, 1);
        await setClock("2027-01-15T08:01:00.000Z");
        await init(s);
        eq("two minutes later it's the next local day: released", (await counts(la)).pooled ?? 0, 0);
    }

    section("flipping timezones can't beat the caps");
    {
        const T = "2027-01-20T12:00:00.000Z";
        await setClock(T);
        const u = await mkUser("flip", { active: T });
        const east = await open(u, "Pacific/Kiritimati"), west = await open(u, "Pacific/Pago_Pago");
        eq("east is a day ahead", await today(east), "2027-01-21");
        eq("west is a day behind that", await today(west), "2027-01-20");
        for (let i = 0; i < 5; i++) await task(east, u);
        const w = await task(west, u);
        const e = await task(east, u);
        const st = await stats(u);
        eq("tasks: west can't reset the east day's cap", [w.coins, e.coins, st.coins, st.buildings_today, st.counters_day], [0, 0, 50, 5, "2027-01-21"]);
    }
    {
        const T = "2027-01-20T12:00:00.000Z";
        await setClock(T);
        const u = await mkUser("flip2", { active: T });
        const east = await open(u, "Pacific/Kiritimati"), west = await open(u, "Pacific/Pago_Pago");
        await init(east);
        for (let i = 0; i < 4; i++) await log(east);
        eq("logs: 15 coins and one stall on the east day", [(await stats(u)).coins, (await counts(u)).inventory], [15, 1]);
        for (let i = 0; i < 4; i++) await log(west);
        const st = await stats(u);
        eq("logs: flipping to the west zone pays nothing more", st.coins, 15);
        eq("logs: and makes no second stall", (await counts(u)).inventory, 1);
    }
    {
        const T = "2027-01-20T12:00:00.000Z";
        await setClock(T);
        const u = await mkUser("flip3", { active: T });
        const east = await open(u, "Pacific/Kiritimati"), west = await open(u, "Pacific/Pago_Pago");
        await init(east);
        for (const t of ["a", "b"]) await call(east, "add_savings_goal", { title: t, targetCents: 1000 });
        await call(west, "add_savings_goal", { title: "c", targetCents: 1000 });
        await call(west, "add_savings_goal", { title: "d", targetCents: 1000 });
        eq("goals: flipping zones can't pass 2 a day", (await q1("SELECT COUNT(*)::int n FROM savings_goals WHERE user_id=$1", [u.id])).n, 2);
    }
    {
        const T = "2027-01-20T12:00:00.000Z";
        await setClock(T);
        const u = await mkUser("flip4", { active: T });
        const b = await mkLine(u, "coding", 3, 4, 3);
        await addWorker(u, "ivy");
        const east = await open(u, "Pacific/Kiritimati"), west = await open(u, "Pacific/Pago_Pago");
        await init(east);
        await db.query("UPDATE buildings SET stored_milli=5000 WHERE id=$1", [b]);
        eq("Early Bird east: +3", (await call(east, "collect_all")).fx.coins_collected.bonus, 3);
        await db.query("UPDATE buildings SET stored_milli=5000 WHERE id=$1", [b]);
        eq("Early Bird west: no second +3", (await call(west, "collect_all")).fx.coins_collected.bonus, 0);
    }
}
