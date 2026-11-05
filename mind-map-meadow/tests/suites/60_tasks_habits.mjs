// §5.3, §5.5, and the task / habit events the contract leaves "unchanged".
import { check, eq, section, mkUser, connect, init, call, quiet, until, stats, setStats, addTask, counts, row, q1, qa, sleep, setClock, CLOCK_PORT, prompts, mkLine } from "../lib/harness.mjs";

const pad = (n) => String(n).padStart(2, "0");
const todayUTC = () => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const task = (id) => q1("SELECT * FROM tasks WHERE id=$1", [id]);
const addViaSocket = (s, payload) => until(s, "refresh_data", "add_task", payload);

export async function run() {
    section("complete_task: reward, line, counters");
    const u = await mkUser("tasks");
    const s = await connect(u);
    await init(s);
    {
        const id = await addTask(u, "Fitness", { title: "run" });
        const r = await call(s, "complete_task", id);
        const b = await q1("SELECT * FROM buildings WHERE source_task_id=$1", [id]);
        const t = await task(id), st = await stats(u);
        eq("task_reward shape (§6)", r.fx.task_reward, { taskId: id, coins: 10, paidToday: 1, building: "inventory", line: "fitness" });
        eq("building_generated reason", r.fx.building_generated?.reason, "task");
        check("building: Lv1 line row in inventory, no position", b.kind === "line" && b.line === "fitness" && b.level === 1 && b.asset_key === "fitness_1" && b.state === "inventory" && b.tile_x === null && b.x === null && b.footprint === 2 && b.source === "task" && b.generated_on === todayUTC(), b);
        check("task row: completed, 10 coins, linked to the building", t.status === "completed" && t.coins_earned === 10 && t.building_id === b.id && t.completed_at !== null, t);
        eq("stats", [st.coins, st.tasks_paid_today, st.buildings_today, st.town_xp, st.calories_burned], [10, 1, 1, 1, 350]);
        check("level and xp stay frozen", st.level === 1 && st.xp === 0, { level: st.level, xp: st.xp });
        eq("retired building_spawned isn't sent", r.all.filter(([e]) => e === "building_spawned").length, 0);
        check("refresh_data still fires", await new Promise((res) => setTimeout(() => res(s.events.some(([e]) => e === "refresh_data")), 80)));
    }
    for (const [category, line] of [["Coding", "coding"], ["Finance", "finance"], ["Cooking", "coding"], ["constructor", "coding"], ["__proto__", "coding"]]) {
        const v = await mkUser("cat");
        const c = await connect(v);
        await init(c);
        const r = await call(c, "complete_task", await addTask(v, category));
        eq(`category ${category} -> ${line}`, r.fx.task_reward?.line, line);
        check(`non-fitness (${category}) earns no calories`, (await stats(v)).calories_burned === 0);
    }

    section("complete_task: no effect on bad ids or other users' tasks");
    {
        const o = await mkUser("tasks-other");
        const theirs = await addTask(o);
        await quiet(s, "complete_task", theirs);
        eq("their task stays pending", (await task(theirs)).status, "pending");
        eq("no coins to anyone", [(await stats(o)).coins], [0]);
        const c0 = (await stats(u)).coins;
        for (const bad of ["1", 1.5, -1, 0, null, {}, [], 2147483648]) await quiet(s, "complete_task", bad, 40);
        await quiet(s, "complete_task", 2147483000);
        eq("garbage ids pay nothing", (await stats(u)).coins, c0);
        const done = await addTask(u);
        await call(s, "complete_task", done);
        const c1 = (await stats(u)).coins;
        await quiet(s, "complete_task", done);
        eq("completing a finished task again pays nothing", (await stats(u)).coins, c1);
    }

    section("§8: 7 tasks in a day; caps; delete can't free a slot");
    {
        const v = await mkUser("seven");
        const c = await connect(v);
        await init(c);
        const ids = [];
        for (let i = 0; i < 7; i++) ids.push(await addTask(v));
        let last;
        const paid = [];
        for (const id of ids) {
            last = await call(c, "complete_task", id);
            paid.push(last.fx.task_reward.coins);
        }
        const st = await stats(v), n = await counts(v);
        eq("10 x 5, then 0", paid, [10, 10, 10, 10, 10, 0, 0]);
        eq("+50 coins, 5 inventory, 2 pooled, xp +5", [st.coins, n.inventory, n.pooled, st.town_xp], [50, 5, 2, 5]);
        eq("over-cap reward", last.fx.task_reward, { taskId: ids[6], coins: 0, paidToday: 5, building: "pooled", line: "coding" });
        eq("building_pooled", last.fx.building_pooled, { line: "coding", poolCount: 2, poolMax: 10 });
        eq("unpaid task records 0 coins", (await task(ids[6])).coins_earned, 0);
        eq("today_counts", [last.state.today_counts.buildings, last.state.today_counts.tasksPaid], [5, 5]);
        eq("pool count in state", last.state.pool.count, 2);

        for (const id of ids) await quiet(c, "delete_task", id, 30);
        for (let i = 0; i < 150 && (await q1("SELECT COUNT(*)::int n FROM tasks WHERE user_id=$1", [v.id])).n > 0; i++) await sleep(20);
        eq("all task rows deleted", (await q1("SELECT COUNT(*)::int n FROM tasks WHERE user_id=$1", [v.id])).n, 0);
        const n2 = await counts(v), st2 = await stats(v);
        eq("§5.5: deleting tasks keeps every building", [n2.inventory, n2.pooled], [5, 2]);
        eq("§5.5: coins and counters untouched", [st2.coins, st2.tasks_paid_today, st2.buildings_today], [50, 5, 5]);
        eq("§5.5: source_task_id falls to NULL", (await qa("SELECT source_task_id s FROM buildings WHERE user_id=$1 AND source_task_id IS NOT NULL", [v.id])).length, 0);
        const again = await call(c, "complete_task", await addTask(v));
        eq("re-adding after delete doesn't reset the paid count", [again.fx.task_reward.coins, (await stats(v)).coins, again.fx.task_reward.building], [0, 50, "pooled"]);
    }

    section("pool full");
    {
        const v = await mkUser("poolfull");
        const c = await connect(v);
        const today = (await init(c)).builder.today;
        await setStats(v, { counters_day: today, buildings_today: 5, tasks_paid_today: 5 });
        for (let i = 0; i < 10; i++) await mkLine(v, "coding", 1, 0, 0, { state: "pooled" });
        const id = await addTask(v);
        const r = await call(c, "complete_task", id);
        eq("no building, no coins", [r.fx.task_reward?.building, r.fx.task_reward?.coins, (await counts(v)).pooled], ["none", 0, 10]);
        check("§5.3: task_reward carries pool_full: true", r.fx.task_reward?.pool_full === true, r.fx.task_reward);
        eq("the task still completes", (await task(id)).status, "completed");
        eq("no building_pooled", r.all.filter(([e]) => e === "building_pooled").length, 0);
    }

    section("add_task / edit_task / delete_task");
    {
        const v = await mkUser("crud"), o = await mkUser("crud-other");
        const c = await connect(v);
        await init(c);
        const got = await addViaSocket(c, { title: "Write tests", category: "Coding", due_date: "2026-12-01", estimated_minutes: 45 });
        const t = got?.tasks?.[0];
        check("add_task: row made, refresh_data has it", t && t.title === "Write tests" && t.user_id === v.id && t.estimated_minutes === 45 && t.due_date === "2026-12-01" && t.status === "pending", t);
        const dflt = await addViaSocket(c, { title: "Default time", category: "Coding", due_date: "2026-12-02" });
        eq("estimated_minutes defaults to 30", dflt.tasks.find((x) => x.title === "Default time").estimated_minutes, 30);
        const n0 = (await qa("SELECT id FROM tasks WHERE user_id=$1", [v.id])).length;
        for (const [label, p] of [["blank title", { title: "   ", category: "Coding", due_date: "2026-12-01" }], ["256 chars", { title: "x".repeat(256), category: "Coding", due_date: "2026-12-01" }], ["number title", { title: 5, category: "Coding", due_date: "2026-12-01" }], ["no title", { category: "Coding", due_date: "2026-12-01" }], ["null payload", null], ["no category", { title: "a", due_date: "2026-12-01" }], ["no due date", { title: "a", category: "Coding" }], ["impossible date", { title: "a", category: "Coding", due_date: "2026-02-31" }], ["garbage date", { title: "a", category: "Coding", due_date: "soon" }], ["long category", { title: "a", category: "c".repeat(51), due_date: "2026-12-01" }]]) {
            await quiet(c, "add_task", p, 60);
            eq(`add_task rejected: ${label}`, (await qa("SELECT id FROM tasks WHERE user_id=$1", [v.id])).length, n0);
        }
        const injected = await addViaSocket(c, { title: "Injected", category: "Coding", due_date: "2026-12-01", user_id: o.id, userId: o.id, status: "completed", coins_earned: 9999 });
        const row2 = injected.tasks.find((x) => x.title === "Injected");
        check("add_task ignores user_id/status/coins in the payload", row2.user_id === v.id && row2.status === "pending" && row2.coins_earned === 0, row2);
        const edited = await until(c, "refresh_data", "edit_task", { id: t.id, title: "Edited", category: "Fitness", due_date: "2026-12-05", estimated_minutes: 60 });
        const e = edited.tasks.find((x) => x.id === t.id);
        check("edit_task updates the fields", e.title === "Edited" && e.category === "Fitness" && e.due_date === "2026-12-05" && e.estimated_minutes === 60, e);
        const done = await addTask(v, "Coding", { title: "Finished" });
        await call(c, "complete_task", done);
        await until(c, "refresh_data", "edit_task", { id: done, title: "Rewritten", category: "Coding", due_date: "2026-12-05" });
        eq("edit_task can't touch a completed task", (await task(done)).title, "Finished");
        const theirs = await addTask(o, "Coding", { title: "Theirs" });
        await quiet(c, "edit_task", { id: theirs, title: "Hacked", category: "Coding", due_date: "2026-12-05" });
        eq("edit_task can't touch another user's task", (await task(theirs)).title, "Theirs");
        await quiet(c, "edit_task", { id: t.id, title: "", category: "Coding", due_date: "2026-12-05" });
        eq("edit_task rejects a blank title", (await task(t.id)).title, "Edited");
        await quiet(c, "delete_task", theirs);
        check("delete_task can't touch another user's task", await task(theirs));
        for (const bad of ["1", null, 1.5, -1]) await quiet(c, "delete_task", bad, 30);
        await until(c, "refresh_data", "delete_task", t.id);
        check("delete_task removes a pending task", !(await task(t.id)));
    }

    section("add_task / add_recurring_task: rejected fields come back as a message");
    {
        const v = await mkUser("taskerr");
        const c = await connect(v);
        await init(c);
        for (const [label, p] of [["minutes too big", { title: "a", category: "Coding", due_date: "2026-12-01", estimated_minutes: 1e12 }], ["fractional minutes", { title: "a", category: "Coding", due_date: "2026-12-01", estimated_minutes: 1.5 }], ["text minutes", { title: "a", category: "Coding", due_date: "2026-12-01", estimated_minutes: "abc" }], ["zero minutes", { title: "a", category: "Coding", due_date: "2026-12-01", estimated_minutes: 0 }], ["control char in category", { title: "a", category: "a\nb", due_date: "2026-12-01" }], ["NUL in title", { title: "a\u0000", category: "Coding", due_date: "2026-12-01" }]]) {
            const err = await until(c, "builder_error", "add_task", p, 500);
            eq(`add_task ${label}: BAD_PAYLOAD with a message`, [err?.code, typeof err?.message], ["BAD_PAYLOAD", "string"]);
        }
        eq("none of them saved", (await qa("SELECT id FROM tasks WHERE user_id=$1", [v.id])).length, 0);
        const err = await until(c, "builder_error", "add_recurring_task", { title: "a", category: "Coding", days_of_week: [1, 1] }, 500);
        eq("add_recurring_task repeated day: BAD_PAYLOAD", err?.code, "BAD_PAYLOAD");
        const secs = await until(c, "refresh_recurring_tasks", "add_recurring_task", { title: "secs", category: "Coding", start_time: "07:00:00", end_time: "08:30:00" });
        check("a time with seconds, as the DB returns it, is accepted", secs?.recurringTasks?.[0]?.end_time?.startsWith("08:30"), secs);
    }

    section("player_move");
    {
        const v = await mkUser("move");
        const c = await connect(v);
        await init(c);
        await quiet(c, "player_move", { x: 111, y: 222 }, 60);
        eq("position reaches this user's context", (await init(c)).player, { x: 111, y: 222 });
        for (const bad of [null, { x: "1", y: 2 }, { x: 1 }, 5, { x: 1e999, y: 1 }]) await quiet(c, "player_move", bad, 20);
        eq("bad moves are ignored", (await init(c)).player, { x: 111, y: 222 });
    }

    section("recurring tasks");
    {
        const v = await mkUser("habit"), o = await mkUser("habit-other");
        const c = await connect(v);
        const today = (await init(c)).builder.today;
        const added = await until(c, "refresh_recurring_tasks", "add_recurring_task", { title: "Stretch", category: "Fitness", start_time: "06:00", end_time: "06:30" });
        const tpl = added?.recurringTasks?.[0];
        check("add_recurring_task saves the template", tpl && tpl.title === "Stretch" && tpl.user_id === v.id && tpl.days_of_week.length === 7 && tpl.active === true && tpl.start_time.startsWith("06:00"), tpl);
        await sleep(80);
        const inst = await qa("SELECT * FROM tasks WHERE recurring_task_id=$1", [tpl.id]);
        check("today's instance is generated at once, due on the local day", inst.length === 1 && inst[0].due_date === today && inst[0].user_id === v.id, inst);
        const r = await call(c, "complete_task", inst[0].id);
        eq("§1: instance -> habit line, whatever its category", r.fx.task_reward?.line, "habit");
        eq("paid like any task, cottage in inventory", [r.fx.task_reward?.coins, r.fx.task_reward?.building, r.state.inventory[0]?.asset_key], [10, "inventory", "habit_1"]);
        eq("fitness habit still earns calories", (await stats(v)).calories_burned, 350);
        const again = await connect(v);
        await init(again);
        eq("reconnecting doesn't regenerate today's completed instance", (await qa("SELECT id FROM tasks WHERE recurring_task_id=$1", [tpl.id])).length, 1);
        await Promise.all(Array.from({ length: 5 }, () => connect(v).then(init)));
        eq("five parallel connects still make one instance", (await qa("SELECT id FROM tasks WHERE recurring_task_id=$1", [tpl.id])).length, 1);

        const edited = await until(c, "refresh_recurring_tasks", "edit_recurring_task", { id: tpl.id, title: "Stretch more", category: "Coding", start_time: "07:00", end_time: "07:45" });
        const et = edited.recurringTasks.find((x) => x.id === tpl.id);
        check("edit_recurring_task updates fields", et.title === "Stretch more" && et.category === "Coding" && et.start_time.startsWith("07:00") && et.end_time.startsWith("07:45"), et);
        const off = await until(c, "refresh_recurring_tasks", "toggle_recurring_task", { id: tpl.id, active: false });
        eq("toggle off", off.recurringTasks.find((x) => x.id === tpl.id).active, false);

        const paused = await until(c, "refresh_recurring_tasks", "add_recurring_task", { title: "Paused", category: "Coding" });
        const pid = paused.recurringTasks.find((x) => x.title === "Paused").id;
        await sleep(60);
        await until(c, "refresh_recurring_tasks", "toggle_recurring_task", { id: pid, active: false });
        await q1("DELETE FROM tasks WHERE recurring_task_id=$1", [pid]);
        await connect(v).then(init);
        eq("a paused template generates nothing on connect", (await qa("SELECT id FROM tasks WHERE recurring_task_id=$1", [pid])).length, 0);
        await until(c, "refresh_recurring_tasks", "toggle_recurring_task", { id: pid, active: true });
        await sleep(80);
        eq("resuming generates today's instance", (await qa("SELECT id FROM tasks WHERE recurring_task_id=$1", [pid])).length, 1);

        const dow = new Date().getUTCDay();
        const others = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== dow && d !== (dow + 1) % 7 && d !== (dow + 6) % 7);
        const notToday = await until(c, "refresh_recurring_tasks", "add_recurring_task", { title: "Not today", category: "Coding", days_of_week: others });
        await sleep(80);
        eq("a template not scheduled today generates nothing", (await qa("SELECT id FROM tasks WHERE recurring_task_id=$1", [notToday.recurringTasks.find((x) => x.title === "Not today").id])).length, 0);

        const n0 = (await qa("SELECT id FROM recurring_tasks WHERE user_id=$1", [v.id])).length;
        for (const [label, p] of [["blank title", { title: " ", category: "Coding" }], ["no title", { category: "Coding" }], ["null", null], ["no category", { title: "a" }], ["bad time", { title: "a", category: "Coding", start_time: "25:99" }], ["bad days", { title: "a", category: "Coding", days_of_week: ["x"] }]]) {
            await quiet(c, "add_recurring_task", p, 60);
            eq(`add_recurring_task rejected: ${label}`, (await qa("SELECT id FROM recurring_tasks WHERE user_id=$1", [v.id])).length, n0);
        }

        const theirs = await until(await connect(o), "refresh_recurring_tasks", "add_recurring_task", { title: "Theirs", category: "Coding" });
        const tid = theirs.recurringTasks[0].id;
        await quiet(c, "edit_recurring_task", { id: tid, title: "Hacked", category: "Coding" });
        await quiet(c, "toggle_recurring_task", { id: tid, active: false });
        await quiet(c, "delete_recurring_task", tid);
        const still = await q1("SELECT * FROM recurring_tasks WHERE id=$1", [tid]);
        check("edit/toggle/delete can't touch another user's template", still && still.title === "Theirs" && still.active === true, still);
        await quiet(c, "toggle_recurring_task", { id: pid, active: "false" }, 60);
        eq("toggle needs a real boolean", (await q1("SELECT active FROM recurring_tasks WHERE id=$1", [pid])).active, true);
        for (const bad of ["1", null, 1.5, -2]) await quiet(c, "delete_recurring_task", bad, 20);

        const inst2 = await q1("SELECT id FROM tasks WHERE recurring_task_id=$1", [pid]);
        await until(c, "refresh_recurring_tasks", "delete_recurring_task", pid);
        check("deleting a template removes it", !(await q1("SELECT id FROM recurring_tasks WHERE id=$1", [pid])));
        const orphan = await task(inst2.id);
        check("its instance stays, detached", orphan && orphan.recurring_task_id === null, orphan);
    }

    section("habit: delete and regenerate can't beat the daily caps");
    {
        const v = await mkUser("habitfarm");
        const c = await connect(v);
        await init(c);
        const added = await until(c, "refresh_recurring_tasks", "add_recurring_task", { title: "Farm", category: "Coding" });
        const tid = added.recurringTasks[0].id;
        await sleep(80);
        for (let i = 0; i < 8; i++) {
            const inst = await q1("SELECT id FROM tasks WHERE recurring_task_id=$1 AND status='pending'", [tid]);
            await call(c, "complete_task", inst.id);
            await until(c, "refresh_data", "delete_task", inst.id);
            const re = await connect(v);
            await init(re);
            re.close();
        }
        const st = await stats(v), n = await counts(v);
        eq("8 complete/delete/reconnect loops: 50 coins, 5 inventory", [st.coins, n.inventory, n.pooled], [50, 5, 3]);
    }

    section("AI brain: stubbed Ollama on the clock server");
    {
        await setClock("2027-01-15T12:00:00.000Z");
        const v = await mkUser("aibrain", { active: "2027-01-15T12:00:00.000Z" }), o = await mkUser("aibrain-other", { active: "2027-01-15T12:00:00.000Z" });
        const c = await connect(v, { port: CLOCK_PORT }), c2 = await connect(o, { port: CLOCK_PORT });
        await init(c);
        await init(c2);
        await call(c2, "complete_task", await addTask(o, "Coding", { title: "SECRET-OTHER-USER-TITLE" }));
        // B's own task gets B a thought of their own. Let it land first, so anything B hears
        // after startOther below can only have come from A's activity.
        for (let i = 0; i < 100 && !c2.events.some(([e, d]) => e === "ai_thought_broadcast" && d.thought === "stub thought"); i++) await sleep(20);
        await call(c, "add_transaction", { amountCents: 1234, direction: "expense", category: "Health", note: "SECRET-MONEY-NOTE" });
        await call(c, "add_savings_goal", { title: "SECRET-GOAL-TITLE", targetCents: 10000 });
        const start = c.events.length, startOther = c2.events.length;
        await call(c, "complete_task", await addTask(v, "Coding", { title: "my visible task" }));
        await sleep(300);
        const all = await prompts();
        const mine = all.filter((p) => p.includes("my visible task"));
        check("the LLM was asked after a task, and sees town level", mine.length >= 1 && mine[0].includes("Town level 1"), all.length);
        check("§ money: transaction notes never reach the LLM", !all.some((p) => p.includes("SECRET-MONEY-NOTE")));
        check("amounts and goal titles never reach the LLM", !all.some((p) => p.includes("1234") || p.includes("SECRET-GOAL-TITLE")));
        check("user A's prompt has none of user B's tasks", !mine.some((p) => p.includes("SECRET-OTHER-USER-TITLE")));
        check("thought goes to the owner", c.events.slice(start).some(([e, d]) => e === "ai_thought_broadcast" && d.thought === "stub thought"));
        eq("and to nobody else", c2.events.slice(startOther).filter(([e]) => e === "ai_thought_broadcast").length, 0);
    }
}
