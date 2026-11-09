import fs from "node:fs";
// §5.4 and the money tracker: logs, stalls, savings goals, soft deletes.
import { check, eq, section, mkUser, connect, init, call, quiet, stats, setStats, counts, row, q1, qa, sleep, addTask } from "../lib/harness.mjs";

const log = (s, extra = {}) => call(s, "add_transaction", { amountCents: 500, direction: "expense", category: "Food", ...extra });
const money = (m) => m.moneyError;

export async function run() {
    section("add_transaction: subcategories");
    {
        const u = await mkUser("moneysub");
        const s = await connect(u);
        await init(s);
        await log(s, { subcategory: "Breakfast" });
        await log(s, { subcategory: "Rent" }); // belongs to Bills, not Food
        await log(s, { category: "Nope", subcategory: "Breakfast" }); // category falls back to Other
        await log(s, { subcategory: { evil: 1 } });
        await call(s, "add_transaction", { amountCents: 100, direction: "income", category: "Side Income", subcategory: "Freelance" });
        const rows = await qa("SELECT category, subcategory FROM transactions WHERE user_id=$1 ORDER BY id", [u.id]);
        eq(
            "valid subcategory kept, anything else stored as null",
            rows.map((r) => [r.category, r.subcategory]),
            [["Food", "Breakfast"], ["Food", null], ["Other", null], ["Food", null], ["Side Income", "Freelance"]],
        );
        const listed = await call(s, "add_transaction", { amountCents: 100, direction: "expense", category: "Food", subcategory: "Drinks" });
        const refreshed = listed.all.find(([e]) => e === "refresh_money")?.[1];
        check("refresh_money lists the subcategory", refreshed?.transactions?.some((t) => t.subcategory === "Drinks"), refreshed?.transactions?.[0]);
    }

    section("add_transaction: rewards and the daily stall");
    {
        const u = await mkUser("money");
        const s = await connect(u);
        await init(s);
        const first = await log(s, { note: "  lunch  " });
        const st1 = await stats(u);
        eq("first log: 5 coins", st1.coins, 5);
        eq("and a Finance Stall in inventory", [(await counts(u)).inventory, first.fx.building_generated?.reason, first.fx.building_generated?.building?.asset_key], [1, "money_log", "finance_1"]);
        eq("stall row", [await q1("SELECT source,line,level,state FROM buildings WHERE user_id=$1", [u.id])], [{ source: "money_log", line: "finance", level: 1, state: "inventory" }]);
        eq("counts toward the day: buildings 1, xp 1", [st1.buildings_today, st1.town_xp], [1, 1]);
        check("money_reward fires", first.fx.money_reward?.coins === 5, first.fx.money_reward);
        const tx0 = await q1("SELECT * FROM transactions WHERE user_id=$1", [u.id]);
        eq("note trimmed, logged_on = occurred_on = today", [tx0.note, tx0.occurred_on === first.state.today, tx0.logged_on === first.state.today, tx0.reward_coins, tx0.amount_cents], ["lunch", true, true, 5, 500]);
        await log(s);
        await log(s);
        const fourth = await log(s);
        const st = await stats(u);
        eq("4 logs: 15 coins, 1 stall, xp 1", [st.coins, (await counts(u)).inventory, st.town_xp, st.buildings_today], [15, 1, 1, 1]);
        eq("today_counts.logsPaid stops at 3", fourth.state.today_counts.logsPaid, 3);
        eq("the 4th has no money_reward", fourth.all.filter(([e]) => e === "money_reward").length, 0);

        const paid = await q1("SELECT id FROM transactions WHERE user_id=$1 AND reward_coins>0 ORDER BY id LIMIT 1", [u.id]);
        const del = await call(s, "delete_transaction", paid.id);
        check("delete revokes the coins, keeps the stall", !del.error && (await stats(u)).coins === 10 && (await counts(u)).inventory === 1);
        check("soft delete: the row stays with deleted_at", (await q1("SELECT deleted_at FROM transactions WHERE id=$1", [paid.id])).deleted_at !== null);
        check("deleted rows leave the list", del.all.find(([e]) => e === "refresh_money") === undefined || !del.all.find(([e]) => e === "refresh_money")[1].transactions.some((t) => t.id === paid.id));
        await quiet(s, "delete_transaction", paid.id);
        eq("deleting twice revokes once", (await stats(u)).coins, 10);
        await log(s);
        eq("delete + re-log: no extra paid slot, no extra stall", [(await stats(u)).coins, (await counts(u)).inventory], [10, 1]);
        await setStats(u, { coins: 2 });
        const tx2 = await q1("SELECT id FROM transactions WHERE user_id=$1 AND reward_coins>0 AND deleted_at IS NULL ORDER BY id LIMIT 1", [u.id]);
        await call(s, "delete_transaction", tx2.id);
        eq("revoking with too few coins stops at 0", (await stats(u)).coins, 0);
    }
    {
        const u = await mkUser("money2");
        const s = await connect(u);
        const today = (await init(s)).builder.today;
        await setStats(u, { counters_day: today, buildings_today: 5 });
        await log(s);
        check("5 buildings already today: no stall, still paid", !(await counts(u)).inventory && (await stats(u)).coins === 5 && (await stats(u)).buildings_today === 5);
        await log(s);
        eq("no stall later that day either", (await counts(u)).inventory, undefined);
    }
    {
        const u = await mkUser("money3");
        const s = await connect(u);
        await init(s);
        await log(s);
        for (let i = 0; i < 5; i++) await call(s, "complete_task", await addTask(u));
        const n = await counts(u);
        eq("the stall takes one of the 5: 4 task buildings then pooling", [n.inventory, n.pooled], [5, 1]);
        eq("task coins are separate from the building cap", (await stats(u)).coins, 55);
    }

    section("add_transaction: every validation error");
    {
        const u = await mkUser("moneyerr"), o = await mkUser("moneyerr-other");
        const s = await connect(u);
        const today = (await init(s)).builder.today;
        const shift = (d) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
        const cases = [
            ["0 cents", { amountCents: 0 }, /Amount/],
            ["negative", { amountCents: -5 }, /Amount/],
            ["float", { amountCents: 1.5 }, /Amount/],
            ["string", { amountCents: "500" }, /Amount/],
            ["over the max", { amountCents: 100000001 }, /Amount/],
            ["unknown direction", { direction: "theft" }, /type/],
            ["proto direction", { direction: "__proto__" }, /type/],
            ["constructor direction", { direction: "constructor" }, /type/],
            ["impossible date", { occurredOn: "2026-02-31" }, /Invalid date/],
            ["garbage date", { occurredOn: "yesterday" }, /Invalid date/],
            ["future date", { occurredOn: shift(1) }, /future/],
            ["too far back", { occurredOn: shift(-367) }, /too far/],
            ["saving with no goal", { direction: "saving" }, /savings goal/],
            ["saving, string goal", { direction: "saving", savingsGoalId: "1" }, /savings goal/],
            ["saving, no such goal", { direction: "saving", savingsGoalId: 2147483000 }, /isn't active/],
        ];
        for (const [label, extra, re] of cases) {
            const r = await log(s, extra);
            check(`money_error: ${label}`, re.test(money(r) ?? ""), { moneyError: money(r), error: r.error });
        }
        const nothing = await call(s, "add_transaction", null);
        check("money_error: null payload", /Amount/.test(money(nothing) ?? ""));
        eq("no rejected log was saved, no coins", [(await qa("SELECT id FROM transactions WHERE user_id=$1", [u.id])).length, (await stats(u)).coins], [0, 0]);
        const start = o.id;
        const theirGoal = await q1("INSERT INTO savings_goals (user_id,title,target_cents,created_on) VALUES ($1,'theirs',1000,$2) RETURNING id", [start, today]);
        check("money_error: saving into another user's goal", /isn't active/.test(money(await log(s, { direction: "saving", savingsGoalId: theirGoal.id })) ?? ""));
        eq("backdating to the limit is fine", (await log(s, { occurredOn: shift(-366) })).moneyError, null);
        const back = await q1("SELECT occurred_on,logged_on FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [u.id]);
        check("backdated: occurred_on moves, logged_on stays today", back.occurred_on === shift(-366) && back.logged_on === today, back);
        check("a long note is cut to 140", (await log(s, { note: "n".repeat(500) })).moneyError === null && (await q1("SELECT LENGTH(note) n FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [u.id])).n === 140);
        await log(s, { category: "Nonsense" });
        eq("unknown category becomes Other", (await q1("SELECT category c FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [u.id])).c, "Other");
        await log(s, { direction: "income", category: "Salary" });
        eq("income works", (await q1("SELECT direction d, category c FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [u.id])), { d: "income", c: "Salary" });
        for (const bad of ["1", null, 1.5]) await quiet(s, "delete_transaction", bad, 30);
        eq("server is fine after a bad delete", (await log(s)).moneyError, null);
    }

    section("savings goals: errors and caps");
    {
        const u = await mkUser("goal");
        const s = await connect(u);
        const today = (await init(s)).builder.today;
        const shift = (d) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
        const add = (p) => call(s, "add_savings_goal", p);
        for (const [label, p, re] of [
            ["blank title", { title: "  ", targetCents: 1000 }, /1–80/],
            ["81 chars", { title: "x".repeat(81), targetCents: 1000 }, /1–80/],
            ["no title", { targetCents: 1000 }, /1–80/],
            ["null payload", null, /1–80/],
            ["999 cents", { title: "a", targetCents: 999 }, /at least 10/],
            ["float", { title: "a", targetCents: 1000.5 }, /between/],
            ["string", { title: "a", targetCents: "1000" }, /between/],
            ["over the max", { title: "a", targetCents: 100000001 }, /between/],
            ["bad deadline", { title: "a", targetCents: 1000, deadline: "2026-02-31" }, /Invalid deadline/],
            ["past deadline", { title: "a", targetCents: 1000, deadline: shift(-1) }, /past/],
        ]) {
            check(`money_error: ${label}`, re.test(money(await add(p)) ?? ""));
        }
        eq("no rejected goal saved", (await qa("SELECT id FROM savings_goals WHERE user_id=$1", [u.id])).length, 0);
        const ok = await add({ title: "Exactly ten", targetCents: 1000, deadline: today });
        check("target of exactly 10.00, deadline today: accepted", !ok.moneyError && (await q1("SELECT deadline FROM savings_goals WHERE user_id=$1", [u.id])).deadline === today, ok.moneyError);
        const gid = (await q1("SELECT id FROM savings_goals WHERE user_id=$1", [u.id])).id;
        const del = await call(s, "delete_savings_goal", gid);
        const removed = del.all.find(([e]) => e === "building_removed");
        check("delete: goal soft-deleted, building gone, building_removed sent", (await q1("SELECT deleted_at FROM savings_goals WHERE id=$1", [gid])).deleted_at !== null && removed && !del.state.placed.some((b) => b.kind === "savings"), removed);
        check("80-char title accepted", !(await add({ title: "x".repeat(80), targetCents: 1000 })).moneyError);
        check("cap: a third goal today is refused, deleted one counts", /per day/.test(money(await add({ title: "third", targetCents: 1000 })) ?? ""));
        const before = (await qa("SELECT id FROM savings_goals WHERE user_id=$1", [u.id])).length;
        for (const bad of ["1", null, 1.5]) await quiet(s, "delete_savings_goal", bad, 30);
        eq("a bad delete does nothing", (await qa("SELECT id FROM savings_goals WHERE user_id=$1 AND deleted_at IS NULL", [u.id])).length, before - 1);
    }
    {
        const u = await mkUser("goal2");
        const s = await connect(u);
        await init(s);
        for (let i = 0; i < 5; i++) await q1("INSERT INTO savings_goals (user_id,title,target_cents,created_on) VALUES ($1,'x',1000,'2020-01-01') RETURNING id", [u.id]);
        check("cap: a 6th active goal is refused", /up to 5/.test(money(await call(s, "add_savings_goal", { title: "six", targetCents: 1000 })) ?? ""));
    }

    section("coin ledger: every change is recorded, through one function");
    {
        const v = await mkUser("ledger");
        const c = await connect(v);
        await init(c);
        await call(c, "add_transaction", { amountCents: 100, direction: "expense", category: "Food" });
        const row = await q1("SELECT delta, balance_after, reason FROM coin_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [v.id]);
        const coins = (await stats(v)).coins;
        eq("a money log leaves a ledger row matching the balance", [row.delta, row.reason, row.balance_after], [5, "money_log", coins]);
        c.close();
        const dir = new URL("../../server/", import.meta.url);
        const offenders = fs.readdirSync(dir).filter((f) => f !== "tx.js" && /SET coins/.test(fs.readFileSync(new URL(f, dir), "utf8")));
        eq("only tx.js writes coins", offenders, []);
    }

    section("savings goals: milestones");
    {
        const u = await mkUser("mile");
        const s = await connect(u);
        await init(s);
        const made = await call(s, "add_savings_goal", { title: "Bike", targetCents: 10000 });
        const g = await q1("SELECT * FROM savings_goals WHERE user_id=$1", [u.id]);
        const bid = made.state.placed.find((b) => b.kind === "savings").id;
        eq("goal links its building", g.building_id, bid);
        const save = (amountCents) => log(s, { direction: "saving", savingsGoalId: g.id, amountCents });
        const c0 = (await stats(u)).coins;
        let r = await save(2499);
        eq("24.99%: log coins only, stage 0", [(await stats(u)).coins - c0, (await q1("SELECT stage FROM savings_goals WHERE id=$1", [g.id])).stage], [5, 0]);
        const c1 = (await stats(u)).coins;
        r = await save(1);
        eq("exactly 25%: stage 1, +40 and log coins", [(await stats(u)).coins - c1, (await q1("SELECT stage FROM savings_goals WHERE id=$1", [g.id])).stage], [45, 1]);
        eq("building_updated carries the new stage", [r.fx.building_updated?.id, r.fx.building_updated?.metadata?.stage], [bid, 1]);
        eq("money_reward for the milestone", r.all.filter(([e]) => e === "money_reward").map(([, d]) => d.coins), [5, 40]);
        const sid = (await q1("SELECT id FROM transactions WHERE savings_goal_id=$1 ORDER BY id DESC LIMIT 1", [g.id])).id;
        const c2 = (await stats(u)).coins;
        await call(s, "delete_transaction", sid);
        eq("deleting a saving revokes the log coins, never the stage or milestone", [(await stats(u)).coins, (await q1("SELECT stage FROM savings_goals WHERE id=$1", [g.id])).stage, (await row(bid)).metadata.stage], [c2 - 5, 1, 1]);
        const c3 = (await stats(u)).coins;
        await save(1);
        eq("reaching 25% again pays the third log slot only, no second milestone", [(await stats(u)).coins - c3, (await q1("SELECT stage FROM savings_goals WHERE id=$1", [g.id])).stage], [5, 1]);
        const c4 = (await stats(u)).coins;
        r = await save(5000);
        eq("a jump over two stages upgrades the building but today's milestone is already paid", [(await stats(u)).coins - c4, r.fx.building_updated?.metadata?.stage], [0, 3]);
        const c5 = (await stats(u)).coins;
        r = await save(999999);
        const done = await q1("SELECT stage,status FROM savings_goals WHERE id=$1", [g.id]);
        eq("over 100%: stage stops at 4, goal completed, no second milestone today", [done.stage, done.status, (await stats(u)).coins - c5], [4, "completed", 0]);
        check("completed goal takes no more savings", /isn't active/.test(money(await save(100)) ?? ""));
        const list = r.all.find(([e]) => e === "refresh_money");
        check("the money state lists saved_cents", list === undefined || list[1].savingsGoals[0].saved_cents >= 10000);
        await sleep(20);
    }
}
