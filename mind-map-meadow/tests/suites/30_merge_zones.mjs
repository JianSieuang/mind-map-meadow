// §5.6 merge and §5.8 zones.
import { check, eq, section, mkUser, connect, init, call, stats, setStats, mkLine, mkDeco, row, addWorker, B, db, q1 } from "../lib/harness.mjs";
import { ZONES } from "../../server/builderRules.js";

export async function run() {
    section("merge_buildings: every error code");
    const u = await mkUser("merge"), other = await mkUser("merge-other");
    const s = await connect(u);
    await init(s);
    await setStats(u, { coins: 1000 });
    const a = await mkLine(u, "coding", 1, 4, 3), b = await mkLine(u, "coding", 1, 6, 3);
    const fit = await mkLine(u, "fitness", 1, 8, 3), lv2 = await mkLine(u, "coding", 2, 10, 3), lv2b = await mkLine(u, "coding", 2, 12, 3);
    const lv3 = await mkLine(u, "coding", 3, 14, 3), lv3b = await mkLine(u, "coding", 3, 4, 5);
    const invRow = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" }), pool = await mkLine(u, "coding", 1, 0, 0, { state: "pooled" });
    const theirs = await mkLine(other, "coding", 1, 4, 3);
    const deco = await mkDeco(u, "cozy_bench", 6, 5), deco2 = await mkDeco(u, "cozy_bench", 7, 5);
    const sav = await mkDeco(u, "savings_project", 8, 5, "savings", 2), sav2 = await mkDeco(u, "savings_project", 10, 5, "savings", 2);
    const legacy = await mkDeco(u, "old", 12, 5, "legacy"), legacy2 = await mkDeco(u, "old", 13, 5, "legacy");
    const m = async (targetId, sourceId) => (await call(s, "merge_buildings", { targetId, sourceId })).code;

    eq("different line", await m(a, fit), "MISMATCH");
    eq("different level", await m(a, lv2), "MISMATCH");
    eq("Lv3 + Lv3", await m(lv3, lv3b), "MAX_LEVEL");
    eq("source in inventory", await m(a, invRow), "NOT_PLACED");
    eq("target in inventory", await m(invRow, a), "NOT_PLACED");
    eq("source pooled", await m(a, pool), "NOT_PLACED");
    eq("same id twice", await m(a, a), "BAD_PAYLOAD");
    eq("another user's source", await m(a, theirs), "NOT_FOUND");
    eq("another user's target", await m(theirs, a), "NOT_FOUND");
    eq("no such id", await m(a, 2147483000), "NOT_FOUND");
    eq("decorations can't merge", await m(deco, deco2), "MISMATCH");
    eq("savings projects can't merge", await m(sav, sav2), "MISMATCH");
    eq("legacy rows can't merge", await m(legacy, legacy2), "MISMATCH");
    for (const [label, p] of [["string id", { targetId: "1", sourceId: 2 }], ["missing", { targetId: 1 }], ["null", null], ["array", []], ["float", { targetId: 1.5, sourceId: 2 }]]) eq(`bad payload: ${label}`, (await call(s, "merge_buildings", p)).code, "BAD_PAYLOAD");

    section("merge: town level gate and coin gate");
    await setStats(u, { town_xp: 99, coins: 1000 });
    eq("Lv2->3 at xp 99 (TL4)", await m(lv2, lv2b), "TOWN_LEVEL");
    await setStats(u, { town_xp: 0, coins: 24 });
    eq("24 coins for a 25 merge", await m(a, b), "COINS");
    check("failed merge changes nothing", (await row(a)).level === 1 && (await row(b)).state === "placed" && (await stats(u)).coins === 24 && (await stats(u)).town_xp === 0);

    section("merge: success");
    await setStats(u, { coins: 25 });
    await db.query("UPDATE buildings SET stored_milli=CASE WHEN id=$1 THEN 700 ELSE 1500 END WHERE id IN ($1,$2)", [a, b]);
    const pinned = await addWorker(u, "ben", b);
    const ok = await call(s, "merge_buildings", { targetId: a, sourceId: b });
    const src = await row(b), tgt = await row(a), st = await stats(u);
    check("exact coins spent, to 0", !ok.error && st.coins === 0, { err: ok.error, coins: st.coins });
    check("source row stays as merged, with no position", src.state === "merged" && src.merged_into === a && src.tile_x === null && src.tile_y === null && src.x === null);
    check("target Lv2, asset key updated", tgt.level === 2 && tgt.asset_key === "coding_2");
    eq("storage is added together", tgt.stored_milli, 2200);
    eq("Lv1->2 gives +1 town xp", st.town_xp, 1);
    check("a worker pinned to the source isn't left pinned there", (await q1("SELECT assigned_building_id a FROM workers WHERE id=$1", [pinned])).a === null);
    eq("merge_done", [ok.fx.merge_done?.retiredId, ok.fx.merge_done?.cost, ok.fx.merge_done?.building?.level, ok.fx.merge_done?.building?.id], [b, 25, 2, a]);
    check("retired row is gone from placed and inventory", !B(ok.state, b));
    await setStats(u, { coins: 1000 });
    eq("retired row can't be merged again", await m(a, b), "NOT_PLACED");
    eq("retired row can't be placed", (await call(s, "place_building", { buildingId: b, tileX: 4, tileY: 7 })).code, "NOT_IN_INVENTORY");
    eq("retired row can't be moved", (await call(s, "move_building", { buildingId: b, tileX: 4, tileY: 7 })).code, "NOT_PLACED");
    eq("retired row can't be collected", (await call(s, "collect", { buildingId: b })).code, "NOT_PLACED");
    eq("retired row can't take a staff mode", (await call(s, "set_staff_mode", { buildingId: b, mode: "off" })).code, "NOT_PLACED");

    await setStats(u, { town_xp: 100, coins: 150, pending_summons: 0 });
    const big = await call(s, "merge_buildings", { targetId: lv2, sourceId: lv2b });
    const after = await stats(u);
    check("Lv2->3 at exactly TL5: 150 coins, +3 xp", !big.error && after.coins === 0 && after.town_xp === 103 && (await row(lv2)).level === 3 && (await row(lv2)).asset_key === "coding_3", { err: big.error, coins: after.coins, xp: after.town_xp });

    section("merge: other lines, heritage, level-ups, beds");
    {
        const v = await mkUser("merge2");
        const c = await connect(v);
        await init(c);
        await setStats(v, { coins: 500, town_xp: 9 });
        const h1 = await mkLine(v, "fitness", 1, 4, 3, { heritage: true }), h2 = await mkLine(v, "fitness", 1, 6, 3);
        const r = await call(c, "merge_buildings", { targetId: h1, sourceId: h2 });
        check("heritage target keeps its badge, fitness_2", B(r.state, h1).heritage === true && B(r.state, h1).asset_key === "fitness_2", B(r.state, h1));
        const lvl = await stats(v);
        check("merge crossing TL2 grants exactly one summon", lvl.town_xp === 10 && lvl.pending_summons === 1 && r.state.town.level === 2, { xp: lvl.town_xp, p: lvl.pending_summons });
        const f1 = await mkLine(v, "finance", 1, 8, 3), f2 = await mkLine(v, "finance", 1, 10, 3);
        check("finance -> finance_2", B((await call(c, "merge_buildings", { targetId: f1, sourceId: f2 })).state, f1).asset_key === "finance_2");
        const c1 = await mkLine(v, "habit", 1, 4, 6), c2 = await mkLine(v, "habit", 1, 6, 6);
        let hs = await call(c, "request_builder_state");
        hs = await call(c, "set_tutorial", { step: 0, done: false });
        const beds0 = (await call(c, "auto_place")).state.workers.beds;
        eq("two Cottages = 2 beds", beds0, 2);
        const h = await call(c, "merge_buildings", { targetId: c1, sourceId: c2 });
        check("Cottage + Cottage = House, 2 beds, none lost", h.state.workers.beds === 2 && B(h.state, c1).beds === 2 && B(h.state, c1).asset_key === "habit_2", h.state.workers);
        const c3 = await mkLine(v, "habit", 2, 8, 6);
        await setStats(v, { town_xp: 100, coins: 500 });
        const manor = await call(c, "merge_buildings", { targetId: c1, sourceId: c3 });
        check("House + House = Manor, 4 beds, none lost", manor.state.workers.beds === 4 && B(manor.state, c1).beds === 4 && B(manor.state, c1).asset_key === "habit_3", manor.state.workers);
    }

    section("expand_zone: every step, exact costs");
    {
        const z = await mkUser("zone");
        const c = await connect(z);
        await init(c);
        for (let step = 1; step <= 7; step++) {
            const next = ZONES[step];
            const need = 5 * (next.townLevel - 1) * next.townLevel; // first xp of that town level
            await setStats(z, { town_xp: Math.max(0, need - 1), coins: next.cost });
            eq(`step ${step}: one xp short -> TOWN_LEVEL`, (await call(c, "expand_zone")).code, "TOWN_LEVEL");
            await setStats(z, { town_xp: need, coins: next.cost - 1 });
            eq(`step ${step}: one coin short -> COINS`, (await call(c, "expand_zone")).code, "COINS");
            eq(`step ${step}: rejects change nothing`, [(await stats(z)).zone_step, (await stats(z)).coins], [step - 1, next.cost - 1]);
            await setStats(z, { coins: next.cost });
            const r = await call(c, "expand_zone");
            const st2 = await stats(z);
            check(`step ${step}: costs exactly ${next.cost}, zone is ${next.w}x${next.h}`, !r.error && st2.zone_step === step && st2.coins === 0 && r.state.zone.step === step && r.state.zone.w === next.w && r.state.zone.h === next.h, r.error);
            eq(`step ${step}: zone_expanded`, r.fx.zone_expanded, { step, zone: { x: next.x, y: next.y, w: next.w, h: next.h } });
            eq(`step ${step}: next step advertised`, r.state.zone.next?.step ?? null, step < 7 ? step + 1 : null);
        }
        await setStats(z, { coins: 100000, town_xp: 100000 });
        eq("step 7 -> MAX_ZONE", (await call(c, "expand_zone")).code, "MAX_ZONE");
        eq("MAX_ZONE costs nothing", (await stats(z)).coins, 100000);
    }

    section("expand_zone: real effects on heritage, beds and placement");
    {
        const z = await mkUser("zone2");
        const c = await connect(z);
        await init(c);
        const outProducer = await mkLine(z, "finance", 2, 17, 4, { heritage: true });
        const outHome = await mkLine(z, "habit", 1, 16, 5, { heritage: true });
        const invRow = await mkLine(z, "coding", 1, 0, 0, { state: "inventory" });
        let st = await init(c);
        check("before: outside producer unstaffed, outside home has no bed", B(st.builder, outProducer).staffed === false && B(st.builder, outHome).beds === 0 && st.builder.workers.beds === 0);
        eq("can't place on the next step's land yet", (await call(c, "place_building", { buildingId: invRow, tileX: 3, tileY: 2 })).code, "OUT_OF_ZONE");
        await setStats(z, { town_xp: 10, coins: 200 });
        const r1 = await call(c, "expand_zone");
        check("step 1 (x 3..18): producer at 17,4 (ends 19) now inside and staffed; home inside with a bed", B(r1.state, outProducer).insideZone && B(r1.state, outProducer).staffed && B(r1.state, outHome).beds === 1 && r1.state.workers.total === 4, { p: B(r1.state, outProducer), w: r1.state.workers });
        eq("new land is placeable", (await call(c, "place_building", { buildingId: invRow, tileX: 3, tileY: 2 })).code, undefined);
    }
}
