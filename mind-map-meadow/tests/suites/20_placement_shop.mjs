// §5.2, §5.10: place_building, auto_place, move_building, purchase_building, and §5.1 error routing.
import { check, eq, section, mkUser, connect, init, call, stats, setStats, mkLine, mkDeco, row, sleep, noOverlap, B, counts, q1 } from "../lib/harness.mjs";

const BAD_PLACEMENT = [
    ["float tile", (id) => ({ buildingId: id, tileX: 4.5, tileY: 3 })],
    ["string tile", (id) => ({ buildingId: id, tileX: "4", tileY: 3 })],
    ["missing tile", (id) => ({ buildingId: id, tileX: 4 })],
    ["null tile", (id) => ({ buildingId: id, tileX: null, tileY: 3 })],
    ["string id", () => ({ buildingId: "1", tileX: 4, tileY: 3 })],
    ["id 0", () => ({ buildingId: 0, tileX: 4, tileY: 3 })],
    ["negative id", () => ({ buildingId: -1, tileX: 4, tileY: 3 })],
    ["id above int4", () => ({ buildingId: 2147483648, tileX: 4, tileY: 3 })],
    ["boolean id", () => ({ buildingId: true, tileX: 4, tileY: 3 })],
    ["null payload", () => null],
    ["array payload", () => []],
    ["number payload", () => 7],
    ["string payload", () => "x"],
    ["no payload", () => undefined],
];

export async function run() {
    section("place_building: every error code");
    const u = await mkUser("place"), other = await mkUser("place-other");
    const s = await connect(u), tab2 = await connect(u), stranger = await connect(other);
    await init(s);
    const inv = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
    const pooled = await mkLine(u, "coding", 1, 0, 0, { state: "pooled" });
    const merged = await mkLine(u, "coding", 1, 0, 0, { state: "merged" });
    const foreign = await mkLine(other, "coding", 1, 0, 0, { state: "inventory" });
    const her = await mkLine(u, "habit", 1, 6, 6, { heritage: true });
    const bench = await mkDeco(u, "cozy_bench", 10, 10);
    const place = async (id, tileX, tileY) => (await call(s, "place_building", { buildingId: id, tileX, tileY })).code;

    eq("left of zone", await place(inv, 3, 3), "OUT_OF_ZONE");
    eq("above zone", await place(inv, 4, 2), "OUT_OF_ZONE");
    eq("right edge: footprint sticks out", await place(inv, 15, 3), "OUT_OF_ZONE");
    eq("bottom edge: footprint sticks out", await place(inv, 4, 12), "OUT_OF_ZONE");
    eq("far outside the zone, on the map", await place(inv, 40, 40), "OUT_OF_ZONE");
    eq("negative x", await place(inv, -1, 3), "OUT_OF_MAP");
    eq("negative y", await place(inv, 4, -1), "OUT_OF_MAP");
    eq("past the right of the map", await place(inv, 69, 3), "OUT_OF_MAP");
    eq("past the bottom of the map", await place(inv, 4, 49), "OUT_OF_MAP");
    eq("absurd tile", await place(inv, 1e9, 3), "OUT_OF_MAP");
    eq("overlap: same tile as heritage", await place(inv, 6, 6), "OVERLAP");
    eq("overlap: one tile off, heritage", await place(inv, 7, 7), "OVERLAP");
    eq("overlap: 2x2 over a 1x1 decoration", await place(inv, 9, 9), "OVERLAP");
    eq("placed row", await place(her, 4, 3), "NOT_IN_INVENTORY");
    eq("pooled row", await place(pooled, 4, 3), "NOT_IN_INVENTORY");
    eq("merged row", await place(merged, 4, 3), "NOT_IN_INVENTORY");
    eq("another user's inventory row", await place(foreign, 4, 3), "NOT_FOUND");
    eq("id that doesn't exist", await place(2147483000, 4, 3), "NOT_FOUND");
    for (const [label, make] of BAD_PLACEMENT) eq(`bad payload: ${label}`, (await call(s, "place_building", make(inv))).code, "BAD_PAYLOAD");
    const untouched = await row(inv);
    check("after all those rejects the row is still in inventory", untouched.state === "inventory" && untouched.tile_x === null);
    check("rejected foreign row is unchanged", (await row(foreign)).state === "inventory");

    section("§5.1: errors go to the emitter only; success goes to the room");
    {
        const before = tab2.events.length, beforeOther = stranger.events.length;
        await place(inv, 3, 3);
        await sleep(80);
        eq("second tab sees no builder_error", tab2.events.slice(before).filter(([e]) => e === "builder_error").length, 0);
        const ok = await call(s, "place_building", { buildingId: inv, tileX: 4, tileY: 3 });
        await sleep(80);
        check("success: no error", !ok.error);
        const r = await row(inv);
        check("writes tiles, state and centre pixels", r.state === "placed" && r.tile_x === 4 && r.tile_y === 3 && r.x === 4 * 48 + 48 && r.y === 3 * 48 + 48, r);
        check("second tab got builder_state", tab2.events.slice(before).some(([e]) => e === "builder_state"));
        eq("another user got nothing", stranger.events.length, beforeOther);
    }
    check("adjacent is not overlap (x+2)", (await place(await mkLine(u, "coding", 1, 0, 0, { state: "inventory" }), 6, 3)) === undefined);
    check("zone's far corner fits exactly", (await place(await mkLine(u, "coding", 1, 0, 0, { state: "inventory" }), 14, 11)) === undefined);

    section("move_building");
    {
        const r0 = await call(s, "move_building", { buildingId: inv, tileX: 8, tileY: 3 });
        const r = await row(inv);
        check("moves: new tile and pixels", !r0.error && r.tile_x === 8 && r.x === 8 * 48 + 48, r0.error);
        eq("onto its own footprint (one tile over) is fine", (await call(s, "move_building", { buildingId: inv, tileX: 9, tileY: 3 })).code, undefined);
        eq("retired building_moved isn't sent", r0.all.filter(([e]) => e === "building_moved").length, 0);
        const heldInv = await mkLine(u, "coding", 1, 0, 0, { state: "inventory" });
        const far = await mkLine(u, "coding", 1, 30, 30, { heritage: true });
        const foreignPlaced = await mkLine(other, "coding", 1, 4, 3);
        const move = async (id, tileX, tileY) => (await call(s, "move_building", { buildingId: id, tileX, tileY })).code;
        eq("inventory row", await move(heldInv, 4, 8), "NOT_PLACED");
        eq("another user's row", await move(foreignPlaced, 4, 8), "NOT_FOUND");
        eq("overlap", await move(inv, 6, 6), "OVERLAP");
        eq("out of map", await move(inv, 70, 3), "OUT_OF_MAP");
        eq("out of zone", await move(inv, 2, 3), "OUT_OF_ZONE");
        eq("outside heritage can't shuffle around outside", await move(far, 31, 30), "OUT_OF_ZONE");
        const rule = await call(s, "move_building", { buildingId: far, tileX: 4, tileY: 8 });
        check("outside heritage can move to a valid spot inside, then counts as inside", !rule.error && B(rule.state, far).insideZone === true, rule.error);
        eq("old {id,x,y} payload rejected", (await call(s, "move_building", { id: inv, x: 1, y: 1 })).code, "BAD_PAYLOAD");
        for (const [label, make] of BAD_PLACEMENT) eq(`bad payload: ${label}`, (await call(s, "move_building", make(inv))).code, "BAD_PAYLOAD");
        const dr = await call(s, "move_building", { buildingId: bench, tileX: 15, tileY: 3 });
        const dd = await row(bench);
        check("1x1 decoration moves, pixels use its own footprint", !dr.error && dd.x === 15 * 48 + 24 && dd.y === 3 * 48 + 24, dd);
    }

    section("auto_place");
    {
        const a = await mkUser("auto");
        const c = await connect(a);
        await init(c);
        let r = await call(c, "auto_place");
        eq("nothing to place: 0/0, no error", r.fx.auto_place_done, { placed: 0, remaining: 0 });
        const low = await mkLine(a, "coding", 1, 0, 0, { state: "inventory" });
        const high = await mkLine(a, "coding", 3, 0, 0, { state: "inventory" });
        r = await call(c, "auto_place");
        const [hb, lb] = [B(r.state, high), B(r.state, low)];
        check("level DESC first: Lv3 takes the first spot", hb.tileX === 4 && hb.tileY === 3 && lb.tileX === 6 && lb.tileY === 3, { hb, lb });
        for (let i = 0; i < 40; i++) await mkLine(a, "fitness", 1, 0, 0, { state: "inventory" });
        r = await call(c, "auto_place");
        eq("fills the 30-plot start zone, reports the rest", r.fx.auto_place_done, { placed: 28, remaining: 12 });
        eq("inventory matches remaining", r.state.inventory.length, 12);
        check("all placed rows inside the zone, none overlapping", r.state.placed.every((b) => b.insideZone) && noOverlap(r.state.placed));
        eq("auto_place with no room: 0 placed, no error", (await call(c, "auto_place")).fx.auto_place_done, { placed: 0, remaining: 12 });
        const skip = await mkUser("auto2");
        const c2 = await connect(skip);
        await init(c2);
        await mkDeco(skip, "cozy_bench", 5, 3);
        await mkLine(skip, "coding", 1, 0, 0, { state: "inventory" });
        const r2 = await call(c2, "auto_place");
        const placed = r2.state.placed.find((b) => b.kind === "line");
        check("the scan steps around an existing decoration", placed.tileX === 6 && placed.tileY === 3, placed);
    }

    section("purchase_building");
    {
        const p = await mkUser("shop");
        const c = await connect(p);
        await init(c);
        await setStats(p, { coins: 60 });
        const buy = (assetKey, tileX, tileY) => call(c, "purchase_building", { assetKey, tileX, tileY });
        for (const key of ["supermarket", "constructor", "__proto__", "toString", "", "house"]) eq(`unknown item ${JSON.stringify(key)}`, (await buy(key, 4, 8)).code, "UNKNOWN_ITEM");
        eq("non-string key", (await call(c, "purchase_building", { assetKey: 5, tileX: 4, tileY: 8 })).code, "UNKNOWN_ITEM");
        eq("missing tiles", (await call(c, "purchase_building", { assetKey: "cozy_bench" })).code, "BAD_PAYLOAD");
        eq("float tile", (await buy("cozy_bench", 4.5, 8)).code, "BAD_PAYLOAD");
        eq("null payload", (await call(c, "purchase_building", null)).code, "BAD_PAYLOAD");
        eq("out of zone", (await buy("cozy_bench", 3, 3)).code, "OUT_OF_ZONE");
        eq("out of map", (await buy("cozy_bench", 70, 3)).code, "OUT_OF_MAP");
        eq("can't afford", (await buy("garden_fountain", 4, 8)).code, "COINS");
        eq("rejects cost nothing", (await stats(p)).coins, 60);
        const r = await buy("cozy_bench", 15, 12);
        const bought = r.state?.placed.find((b) => b.asset_key === "cozy_bench");
        check("buys: exact price, decoration, 1x1, far corner of the zone fits", !r.error && (await stats(p)).coins === 10 && bought.kind === "decoration" && bought.footprint === 1 && bought.tileX === 15 && bought.tileY === 12, r.error);
        eq("retired events aren't sent", r.all.filter(([e]) => e === "building_spawned" || e === "purchase_failed").length, 0);
        const dbRow = await row(bought.id);
        check("row: source purchase, pixels for a 1x1", dbRow.source === "purchase" && dbRow.x === 15 * 48 + 24 && dbRow.y === 12 * 48 + 24 && dbRow.metadata.purchase_price === 50);
        await setStats(p, { coins: 150 });
        eq("occupied spot", (await buy("garden_fountain", 15, 12)).code, "OVERLAP");
        eq("occupied spot costs nothing", (await stats(p)).coins, 150);
        const f = await buy("garden_fountain", 4, 8);
        check("fountain costs exactly 150, leaving 0", !f.error && (await stats(p)).coins === 0);
        eq("0 coins, can't buy a bench", (await buy("cozy_bench", 4, 9)).code, "COINS");
        eq("no inventory row was made", (await counts(p)).inventory, undefined);
    }

    section("savings project placement (§5.10)");
    {
        const g = await mkUser("spot");
        const c = await connect(g);
        await init(c);
        const r = await call(c, "add_savings_goal", { title: "Bike", targetCents: 10000 });
        const proj = r.state.placed.find((b) => b.kind === "savings");
        check("first free spot inside the zone", proj.tileX === 4 && proj.tileY === 3 && proj.insideZone && proj.footprint === 2 && proj.metadata.stage === 0, proj);
        for (let y = 3; y < 13; y += 2) for (let x = 4; x < 16; x += 2) if (!(x === 4 && y === 3)) await mkLine(g, "coding", 1, x, y);
        const full = await call(c, "add_savings_goal", { title: "Car", targetCents: 10000 });
        const second = full.state?.placed.filter((b) => b.kind === "savings")[1];
        check("zone full: still created, on the first free spot on the map", second && second.tileX === 0 && second.tileY === 0 && second.insideZone === false, second ?? full.moneyError);
        const fromDb = await q1("SELECT source FROM buildings WHERE id=$1", [second.id]);
        eq("row source", fromDb.source, "savings");
    }
}
