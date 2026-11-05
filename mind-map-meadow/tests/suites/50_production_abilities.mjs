// §5.1.3, §5.7, §5.12: real coins over real (frozen, moved) server time. Runs on the clock server.
import { check, eq, section, mkUser, connect, init, call, stats, setStats, mkLine, mkDeco, row, addWorker, B, addTask, setClock, advanceHours, CLOCK_PORT, db, q1 } from "../lib/harness.mjs";

const T0 = "2027-01-15T12:00:00.000Z";
async function fresh(label) {
    await setClock(T0);
    const u = await mkUser(label, { active: T0 });
    const s = await connect(u, { port: CLOCK_PORT });
    await init(s);
    return { u, s };
}
const stored = async (id) => (await row(id)).stored_milli;
const settle = async (s) => (await init(s)).builder; // a visit settles storage to the frozen now

export async function run() {
    section("production: rates and caps, exact millicoins");
    {
        const { u, s } = await fresh("prod");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await settle(s);
        await advanceHours(10);
        let r = await call(s, "collect", { buildingId: a });
        eq("Lv1, 10h: pays 1 coin", r.fx.coins_collected, { total: 1, items: [{ id: a, coins: 1 }] });
        eq("keeps the 500 millicoin remainder", await stored(a), 500);
        eq("coins credited", (await stats(u)).coins, 1);
        await advanceHours(30);
        r = await call(s, "collect", { buildingId: a });
        eq("+30h: capped at 3 coins", r.fx.coins_collected.total, 3);
        eq("cap reached: nothing left over", await stored(a), 0);
        const again = await call(s, "collect", { buildingId: a });
        eq("collecting again pays 0, no error", [again.error, again.fx.coins_collected], [null, { total: 0, items: [] }]);
        const b = await mkDeco(u, "cozy_bench", 15, 12);
        eq("collecting a decoration pays 0, no error", (await call(s, "collect", { buildingId: b })).fx.coins_collected.total, 0);
    }
    {
        const { u, s } = await fresh("prod2");
        const l1 = await mkLine(u, "coding", 1, 4, 3), l2 = await mkLine(u, "fitness", 2, 6, 3), l3 = await mkLine(u, "finance", 3, 8, 3);
        await settle(s);
        await advanceHours(1);
        let st = await settle(s);
        eq("one hour: 150 / 400 / 1000 milli", [B(st, l1).storedMilli, B(st, l2).storedMilli, B(st, l3).storedMilli], [150, 400, 1000]);
        eq("caps 3 / 8 / 20 coins", [B(st, l1).capMilli, B(st, l2).capMilli, B(st, l3).capMilli], [3000, 8000, 20000]);
        await advanceHours(25);
        st = await settle(s);
        eq("26h: all full", [B(st, l1).storedMilli, B(st, l2).storedMilli, B(st, l3).storedMilli], [3000, 8000, 20000]);
        const r = await call(s, "collect_all");
        eq("collect_all pays them all", r.fx.coins_collected.total, 31);
        eq("coins_collected items", r.fx.coins_collected.items, [{ id: l1, coins: 3 }, { id: l2, coins: 8 }, { id: l3, coins: 20 }]);
        eq("balance", (await stats(u)).coins, 31);
        eq("storage cleared", [await stored(l1), await stored(l2), await stored(l3)], [0, 0, 0]);
        eq("collect_all again: 0, no error", (await call(s, "collect_all")).fx.coins_collected.total, 0);
    }

    section("collect: error codes");
    {
        const { u, s } = await fresh("collecterr");
        const other = await mkUser("collecterr-other", { active: T0 });
        const theirs = await mkLine(other, "coding", 1, 4, 3);
        await db.query("UPDATE buildings SET stored_milli=3000 WHERE id=$1", [theirs]);
        const inv = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        eq("inventory row -> NOT_PLACED", (await call(s, "collect", { buildingId: inv })).code, "NOT_PLACED");
        eq("another user's -> NOT_FOUND", (await call(s, "collect", { buildingId: theirs })).code, "NOT_FOUND");
        eq("their coins stay theirs", [await stored(theirs), (await stats(other)).coins, (await stats(u)).coins], [3000, 0, 0]);
        for (const [label, p] of [["string id", { buildingId: "1" }], ["null", null], ["missing", {}], ["float", { buildingId: 1.5 }]]) eq(`bad payload: ${label}`, (await call(s, "collect", p)).code, "BAD_PAYLOAD");
    }

    section("production: no worker, no coins, and no back pay");
    {
        const { u, s } = await fresh("nostaff");
        const ids = [];
        for (let i = 0; i < 4; i++) ids.push(await mkLine(u, "coding", 1, 4 + i * 2, 3));
        const home = await mkLine(u, "habit", 3, 4, 5), far = await mkLine(u, "coding", 1, 40, 40), deco = await mkDeco(u, "cozy_bench", 15, 12);
        await settle(s);
        await call(s, "set_staff_mode", { buildingId: ids[0], mode: "off" });
        // Manor adds 4 beds, so turn the extras off to leave ids[3] as the only hole would hide nothing: check them directly.
        await advanceHours(20);
        const st = await settle(s);
        eq("off: 0", B(st, ids[0]).storedMilli, 0);
        eq("outside the zone: 0", B(st, far).storedMilli, 0);
        eq("home: 0", B(st, home).storedMilli, 0);
        eq("decoration: 0", B(st, deco).storedMilli, 0);
        await call(s, "set_staff_mode", { buildingId: ids[0], mode: "auto" });
        eq("turning a building back on pays nothing for the idle time", await stored(ids[0]), 0);
        await advanceHours(10);
        eq("it earns from then on", B(await settle(s), ids[0]).storedMilli, 1500);
    }
    {
        const { u, s } = await fresh("nostaff2");
        const ids = [];
        for (let i = 0; i < 4; i++) ids.push(await mkLine(u, "coding", 1, 4 + i * 2, 3));
        const st0 = await settle(s);
        eq("4 producers, 3 workers: last is unstaffed", B(st0, ids[3]).staffed, false);
        await advanceHours(20);
        eq("unstaffed for 20h: 0", B(await settle(s), ids[3]).storedMilli, 0);
        await call(s, "set_staff_mode", { buildingId: ids[0], mode: "off" });
        eq("gets a worker now: no back pay", await stored(ids[3]), 0);
        check("the one that lost its worker keeps what it earned", (await stored(ids[0])) === 3000);
        const col = await call(s, "collect", { buildingId: ids[0] });
        eq("and it can still be collected", col.fx.coins_collected.total, 3);
    }

    section("production: a worker's speed and skill in real coins");
    {
        const { u, s } = await fresh("speed");
        const fin = await mkLine(u, "finance", 2, 4, 3);
        await addWorker(u, "sam");
        await settle(s);
        await advanceHours(10);
        const st = await settle(s);
        eq("Sam on finance Lv2: +20% = 480/h, 4800 after 10h", [B(st, fin).speedBp, B(st, fin).rateMilliPerHour, B(st, fin).storedMilli], [12000, 480, 4800]);
    }
    const table = [
        ["Ben on fitness (skill)", ["ben"], "fitness", 12000],
        ["Ben on coding (no skill)", ["ben"], "coding", 10000],
        ["Mia on coding (skill)", ["mia"], "coding", 12000],
        ["Sam on finance (skill)", ["sam"], "finance", 12000],
        ["Joe anywhere (+5%)", ["joe"], "finance", 10500],
        ["Rare, off skill: Ivy on finance", ["ivy"], "finance", 11000],
        ["Rare, on skill: Ivy on coding", ["ivy"], "coding", 13000],
        ["Epic, off skill: Madam Gold on coding", ["madam_gold"], "coding", 12500],
        ["Epic, on skill: Professor Lin on coding", ["professor_lin"], "coding", 14500],
        ["Legendary: Old Tom", ["old_tom"], "coding", 15500],
        ["Quick Hands: Coach Rae on fitness", ["coach_rae"], "fitness", 13500],
        ["Quick Hands off skill: Coach Rae on coding", ["coach_rae"], "coding", 11500],
        ["1 star: two Mias on coding", ["mia", "mia"], "coding", 12500],
        ["2 stars: three Mias", ["mia", "mia", "mia"], "coding", 13000],
        ["3 stars: four Mias", ["mia", "mia", "mia", "mia"], "coding", 13500],
        ["stars stop at 3: six Mias", ["mia", "mia", "mia", "mia", "mia", "mia"], "coding", 13500],
    ];
    for (const [label, keys, line, bp] of table) {
        const { u, s } = await fresh("sp");
        const b = await mkLine(u, line, 1, 4, 3);
        for (const k of keys) await addWorker(u, k);
        const st = await settle(s);
        eq(`speed: ${label}`, B(st, b).speedBp, bp);
    }

    section("abilities: Deep Pockets");
    {
        const { u, s } = await fresh("deep");
        const fin = await mkLine(u, "finance", 1, 4, 3), plain = await mkLine(u, "finance", 1, 6, 3);
        const pen = await addWorker(u, "penny");
        let st = await settle(s);
        eq("cap is 125%: 3750 vs 3000", [B(st, fin).capMilli, B(st, plain).capMilli], [3750, 3000]);
        await advanceHours(30);
        st = await settle(s);
        eq("30h: storage really reaches 3750", [B(st, fin).storedMilli, B(st, plain).storedMilli], [3750, 3000]);
        const col = await call(s, "collect", { buildingId: fin });
        check("collect pays 3 and keeps 750", col.fx.coins_collected.total === 3 && (await stored(fin)) === 750);
        await db.query("UPDATE buildings SET stored_milli=3750 WHERE id=$1", [fin]);
        const moved = await call(s, "assign_worker", { workerId: pen, buildingId: plain });
        check("moving her away: earned coins above the new cap aren't taken back", B(moved.state, fin).storedMilli === 3750 && B(moved.state, fin).capMilli === 3000, B(moved.state, fin));
        await advanceHours(5);
        eq("and it doesn't keep growing", B(await settle(s), fin).storedMilli, 3750);
    }

    section("abilities: Cheerleader");
    {
        const { u, s } = await fresh("cheer");
        const centre = await mkLine(u, "coding", 1, 8, 6), n1 = await mkLine(u, "fitness", 1, 6, 6), far = await mkLine(u, "coding", 1, 12, 10), corner = await mkLine(u, "coding", 1, 10, 8);
        await addWorker(u, "max_iron", n1);
        const st = await settle(s);
        eq("edge-touching neighbour +500", B(st, centre).speedBp, 10500);
        eq("corner-touching neighbour of the neighbour: not touching n1", B(st, corner).speedBp, 10000);
        eq("far building: nothing", B(st, far).speedBp, 10000);
        eq("Max Iron's own building: rarity + skill only, doesn't cheer himself", B(st, n1).speedBp, 14500);
        await advanceHours(10);
        eq("the boost pays: 157/h on the neighbour", B(await settle(s), centre).storedMilli, 1570);
    }
    {
        const { u, s } = await fresh("cheer2");
        const n1 = await mkLine(u, "fitness", 1, 6, 6), diagonal = await mkLine(u, "coding", 1, 8, 8);
        await addWorker(u, "max_iron", n1);
        eq("a corner touch counts", B(await settle(s), diagonal).speedBp, 10500);
    }
    {
        const { u, s } = await fresh("cheer3");
        const centre = await mkLine(u, "coding", 1, 8, 6);
        const around = [await mkLine(u, "coding", 1, 6, 6), await mkLine(u, "coding", 1, 10, 6), await mkLine(u, "coding", 1, 8, 4), await mkLine(u, "coding", 1, 8, 8)];
        for (const b of around) await addWorker(u, "max_iron", b);
        const st = await settle(s);
        eq("four staffed Cheerleaders: capped at +1500, not +2000", B(st, centre).speedBp, 11500);
    }

    section("abilities: Town Hero");
    {
        const { u, s } = await fresh("hero");
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 8, 8);
        const mayor = await addWorker(u, "mayor_star", a);
        let st = await settle(s);
        eq("Mayor's own: 10000 + 5000 + 500 + 500", B(st, a).speedBp, 16000);
        eq("a Villager elsewhere gets +500", B(st, b).speedBp, 10500);
        await advanceHours(10);
        eq("paid: 157/h", B(await settle(s), b).storedMilli, 1570);
        await addWorker(u, "mayor_star");
        st = await settle(s);
        eq("second Mayor: hero bonus doesn't stack; only his star counts", [B(st, a).speedBp, B(st, a).workerId], [16500, mayor]);
    }
    {
        const { u, s } = await fresh("hero2");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await mkLine(u, "coding", 1, 6, 3); // the mayor takes this one's slot only if it is first
        const third = await mkLine(u, "coding", 1, 8, 3);
        await addWorker(u, "mayor_star", a);
        const off = await call(s, "set_staff_mode", { buildingId: a, mode: "off" });
        check("Town Hero works while owned, even with the Mayor's pinned building off", off.state.placed.filter((b) => b.staffed).every((b) => b.speedBp >= 10500) && B(off.state, third).speedBp >= 10500, off.state.placed.map((b) => [b.id, b.speedBp]));
    }

    section("abilities: Recruiter");
    {
        const { u, s } = await fresh("recruit");
        const ids = [];
        for (let i = 0; i < 6; i++) ids.push(await mkLine(u, "coding", 1, 4 + i * 2, 3));
        let st = await settle(s);
        eq("before: 3 staffed", st.workers.used, 3);
        await addWorker(u, "professor_lin");
        st = await settle(s);
        eq("Recruiter: himself + 1 Villager", [st.workers.total, st.workers.used, st.workers.recruiterBonus], [5, 5, 1]);
        await addWorker(u, "professor_lin");
        st = await settle(s);
        eq("second Recruiter: himself only, bonus doesn't stack", [st.workers.total, st.workers.used, st.workers.recruiterBonus], [6, 6, 1]);
    }

    section("abilities: Bargainer and Master Builder, real debits");
    for (const [label, keys, cost1, cost2] of [
        ["none", [], 25, 150],
        ["Bargainer", ["madam_gold"], 22, 135],
        ["Master Builder", ["old_tom"], 18, 112],
        ["Master Builder beats Bargainer", ["madam_gold", "old_tom"], 18, 112],
        ["two Bargainers don't stack", ["madam_gold", "madam_gold"], 22, 135],
    ]) {
        const { u, s } = await fresh("disc");
        for (const k of keys) await addWorker(u, k);
        await setStats(u, { coins: 1000, town_xp: 100 });
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3), c = await mkLine(u, "coding", 2, 8, 3), d = await mkLine(u, "coding", 2, 10, 3);
        const st = await settle(s);
        eq(`${label}: mergeCost in state`, [st.mergeCost[1], st.mergeCost[2]], [cost1, cost2]);
        const r1 = await call(s, "merge_buildings", { targetId: a, sourceId: b });
        eq(`${label}: Lv1->2 debits ${cost1}`, [r1.fx.merge_done?.cost, (await stats(u)).coins], [cost1, 1000 - cost1]);
        const r2 = await call(s, "merge_buildings", { targetId: c, sourceId: d });
        eq(`${label}: Lv2->3 debits ${cost2}`, [r2.fx.merge_done?.cost, (await stats(u)).coins], [cost2, 1000 - cost1 - cost2]);
    }
    {
        const { u, s } = await fresh("disc2");
        await addWorker(u, "old_tom");
        await setStats(u, { coins: 18 });
        const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
        const r = await call(s, "merge_buildings", { targetId: a, sourceId: b });
        check("the discounted price is what must be affordable: 18 coins buys a merge", !r.error && (await stats(u)).coins === 0, r.error);
    }

    section("abilities: Early Bird");
    {
        const { u, s } = await fresh("early");
        const a = await mkLine(u, "coding", 3, 4, 3);
        await addWorker(u, "ivy");
        let st = await settle(s);
        let r = await call(s, "collect_all");
        eq("nothing to collect: no +3, and the day's bonus isn't burned", [r.fx.coins_collected.total, r.fx.coins_collected.bonus, (await stats(u)).early_bird_on], [0, 0, null]);
        await advanceHours(1);
        const single = await call(s, "collect", { buildingId: a });
        check("plain collect gets no bonus", single.fx.coins_collected.total === 1 && (await stats(u)).early_bird_on === null, single.fx.coins_collected);
        await advanceHours(1);
        const before = (await stats(u)).coins;
        r = await call(s, "collect_all");
        const paid = r.fx.coins_collected.items.reduce((n, i) => n + i.coins, 0);
        check("first collect_all with coins pays +3", paid >= 1 && r.fx.coins_collected.bonus === 3 && r.fx.coins_collected.total === paid + 3 && (await stats(u)).coins === before + paid + 3, r.fx.coins_collected);
        await advanceHours(1);
        r = await call(s, "collect_all");
        eq("second one that day pays no bonus", r.fx.coins_collected.bonus, 0);
        await advanceHours(24);
        r = await call(s, "collect_all");
        eq("next local day: bonus again", r.fx.coins_collected.bonus, 3);
    }
    {
        const { u, s } = await fresh("early2");
        await mkLine(u, "coding", 1, 4, 3);
        await addWorker(u, "ivy");
        await addWorker(u, "ivy");
        await settle(s);
        await advanceHours(10);
        const r = await call(s, "collect_all");
        eq("two Ivys: still +3", r.fx.coins_collected.bonus, 3);
    }
    {
        const { u, s } = await fresh("early3");
        await mkLine(u, "coding", 1, 4, 3);
        await settle(s);
        await advanceHours(10);
        eq("no Ivy: no bonus", (await call(s, "collect_all")).fx.coins_collected.bonus, 0);
    }

    section("sleepy: the 72h line");
    {
        const { u, s } = await fresh("sleepy");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await settle(s);
        await advanceHours(71);
        let st = await settle(s);
        eq("71h: awake", st.sleepy, false);
        eq("sleepyAt = last_active + 72h", st.sleepyAt, "2027-01-18T12:00:00.000Z");
        await call(s, "collect", { buildingId: a });
        await db.query("UPDATE buildings SET stored_milli=0 WHERE id=$1", [a]);
        await advanceHours(1);
        st = await settle(s);
        eq("exactly 72h: asleep", st.sleepy, true);
        eq("asleep: rate 0", B(st, a).rateMilliPerHour, 0);
        eq("the last hour before the line was earned", B(st, a).storedMilli, 150);
        await advanceHours(30);
        st = await settle(s);
        eq("30h later: nothing more, even across visits", B(st, a).storedMilli, 150);
        await call(s, "set_staff_mode", { buildingId: a, mode: "priority" });
        await advanceHours(5);
        await call(s, "collect_all");
        await call(s, "move_building", { buildingId: a, tileX: 6, tileY: 3 });
        check("collect, move and staff mode don't wake the town", (await settle(s)).sleepy === true);
        eq("none of those pay for sleep", await stored(a), 150);

        const late = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        await call(s, "place_building", { buildingId: late, tileX: 8, tileY: 3 });
        await advanceHours(10);
        eq("a building placed while asleep earns nothing", B(await settle(s), late).storedMilli, 0);

        const r = await call(s, "complete_task", await addTask(u));
        check("a completed task wakes the town", r.state?.sleepy === false, r.error);
        eq("the wake doesn't pay for the sleeping gap", await stored(a), 150);
        eq("sleepyAt moved on", r.state.sleepyAt, new Date(Date.parse("2027-01-18T12:00:00.000Z") + 45 * 3600000 + 72 * 3600000).toISOString());
        await advanceHours(1);
        eq("production resumes from the wake", B(await settle(s), a).storedMilli, 300);
    }
    {
        const { u, s } = await fresh("sleepy2");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await settle(s);
        await advanceHours(100);
        const st = await settle(s);
        check("100h with no visit: pays at most up to the line (cap here)", st.sleepy && B(st, a).storedMilli === 3000);
        await db.query("UPDATE buildings SET stored_milli=0 WHERE id=$1", [a]);
        const r = await call(s, "add_transaction", { amountCents: 100, direction: "expense", category: "Food" });
        check("a money log wakes the town too", r.state?.sleepy === false, r.moneyError);
        eq("and pays nothing for the gap", await stored(a), 0);
    }
    {
        const { u, s } = await fresh("sleepy3");
        const a = await mkLine(u, "coding", 1, 4, 3);
        await addWorker(u, "ivy");
        await addWorker(u, "mayor_star");
        await settle(s);
        await advanceHours(200);
        const r = await call(s, "collect_all");
        check("Early Bird pays nothing while asleep, and isn't burned", r.fx.coins_collected.total === 3 && r.fx.coins_collected.bonus === 0 && (await stats(u)).early_bird_on === null, r.fx.coins_collected);
        eq("Town Hero and speed bonuses show rate 0 while asleep", B(r.state, a).rateMilliPerHour, 0);
    }
    {
        const { u, s } = await fresh("sleepy4");
        await setStats(u, { last_active_at: new Date(Date.parse(T0) - 100 * 3600000) });
        await mkLine(u, "coding", 1, 0, 0, { state: "pooled" });
        await db.query("UPDATE buildings SET generated_on='2027-01-01' WHERE user_id=$1", [u.id]);
        const st = await settle(s);
        check("a catch-up release does not wake a sleepy town", st.sleepy === true && st.inventory.length === 1, { sleepy: st.sleepy, inv: st.inventory.length });
        eq("nor move last_active_at", new Date((await stats(u)).last_active_at).toISOString(), new Date(Date.parse(T0) - 100 * 3600000).toISOString());
        await call(s, "add_savings_goal", { title: "Bike", targetCents: 10000 });
        check("creating a savings goal is not activity", (await settle(s)).sleepy === true);
    }
    void q1;
}
