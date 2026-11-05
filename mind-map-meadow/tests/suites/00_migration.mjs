// Contract §3 and §8: the migration on old data, run repeatedly. Boots the servers at the end.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, eq, db, q1, qa, section, sleep } from "../lib/harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TABLES = ["users", "player_stats", "buildings", "tasks", "recurring_tasks", "transactions", "savings_goals", "friendships", "ai_analysis"];

async function snapshot() {
    const out = {};
    for (const t of TABLES) out[t] = await q1(`SELECT COUNT(*)::int n, md5(COALESCE(string_agg(x::text,'|' ORDER BY x.id),'')) h FROM ${t} x`);
    out.columns = (await q1(`SELECT md5(string_agg(table_name||column_name||data_type||is_nullable||COALESCE(column_default,''),'|' ORDER BY table_name,column_name)) h FROM information_schema.columns WHERE table_schema='public'`)).h;
    out.constraints = (await q1("SELECT md5(string_agg(conname||pg_get_constraintdef(oid),'|' ORDER BY conname)) h FROM pg_constraint WHERE connamespace='public'::regnamespace")).h;
    out.indexes = (await q1("SELECT md5(string_agg(indexdef,'|' ORDER BY indexname)) h FROM pg_indexes WHERE schemaname='public'")).h;
    return out;
}
const migrate = (appDir) => execFileSync(process.execPath, ["tests/lib/migrate_once.mjs"], { cwd: appDir, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sameData = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run({ startServers, startSampler, appDir }) {
    section("migration: setup on a copy of the real DB");
    const pre = await q1("SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='player_stats' AND column_name='town_xp'");
    eq("dump is genuinely pre-migration", pre.n, 0);
    await db.query(fs.readFileSync(path.join(here, "../fixtures/legacy_seed.sql"), "utf8"));

    const oldBuildings = await qa("SELECT id,type,x,y,content,user_id,created_at FROM buildings ORDER BY id");
    const oldStats = await qa("SELECT id,user_id,level,xp,coins,calories_burned FROM player_stats ORDER BY id");
    const oldTasks = await qa("SELECT id,title,status,coins_earned,building_id,user_id FROM tasks ORDER BY id");
    const realRowsBefore = await qa("SELECT id,asset_key FROM buildings WHERE COALESCE(user_id,0) NOT BETWEEN 9001 AND 9007 AND content<>'orphan'");

    section("migration: failure is all-or-nothing");
    {
        const client = await db.connect();
        await client.query("BEGIN");
        await client.query("UPDATE player_stats SET coins=-5 WHERE user_id=9003");
        let failed = null;
        try {
            await client.query("SAVEPOINT m");
            await client.query(fs.readFileSync(path.join(appDir, "db/15_builder_loop.sql"), "utf8"));
        } catch (err) {
            failed = err.message;
        }
        await client.query("ROLLBACK");
        client.release();
        // Not a contract rule on what to do with such a row, only that it can't half-apply.
        check("a legacy row with negative coins stops migration 15 outright", failed !== null && /chk_player_stats_coins/.test(failed), failed);
        eq("the failed run left no schema behind", (await q1("SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='player_stats' AND column_name='town_xp'")).n, 0);
    }

    section("migration: first run");
    eq("first run succeeds", migrate(appDir), "ok");
    const first = await snapshot();

    const buildings = await qa("SELECT * FROM buildings ORDER BY id");
    eq("no building row added or lost", buildings.length, oldBuildings.length);
    check("legacy x,y,type,content,created_at are preserved", sameData(await qa("SELECT id,type,x,y,content,user_id,created_at FROM buildings ORDER BY id"), oldBuildings));
    check("every old row has kind, tiles and legacy_asset_key", buildings.every((r) => r.kind && r.tile_x !== null && r.tile_y !== null && r.metadata?.legacy_asset_key), buildings.filter((r) => !r.kind || r.tile_x === null).map((r) => r.id));
    check("every old row is placed", buildings.every((r) => r.state === "placed"));
    check("tasks are untouched", sameData(await qa("SELECT id,title,status,coins_earned,building_id,user_id FROM tasks ORDER BY id"), oldTasks));
    check("legacy level/xp/coins/calories are untouched", sameData(await qa("SELECT id,user_id,level,xp,coins,calories_burned FROM player_stats ORDER BY id"), oldStats));

    const real = await qa("SELECT * FROM buildings WHERE COALESCE(user_id,0) NOT BETWEEN 9001 AND 9007 AND content<>'orphan'");
    eq("real user's row count survives", real.length, realRowsBefore.length);
    check("real houses -> habit_1 heritage, Lv1, 2x2, tile from pixels, legacy key kept", real.every((r) => r.kind === "line" && r.line === "habit" && r.level === 1 && r.asset_key === "habit_1" && r.footprint === 2 && r.heritage && r.source === "heritage" && r.metadata.legacy_asset_key === "house" && r.tile_x === Math.floor(r.x / 48) && r.tile_y === Math.floor(r.y / 48)), real.map((r) => r.id));

    const byContent = (c) => buildings.find((r) => r.content === c);
    const of = (uid, key) => buildings.find((r) => r.user_id === uid && r.metadata.legacy_asset_key === key);
    const sm = of(9001, "supermarket");
    check("supermarket -> finance_2 heritage, tile 17,4", sm.kind === "line" && sm.line === "finance" && sm.level === 2 && sm.asset_key === "finance_2" && sm.heritage && sm.footprint === 2 && sm.tile_x === 17 && sm.tile_y === 4, sm);
    check("purchase metadata survives the rewrite", sm.metadata.purchase_price === 250);
    const bench = of(9001, "cozy_bench"), fountain = of(9001, "garden_fountain");
    check("bench and fountain -> decoration heritage 1x1", bench.kind === "decoration" && fountain.kind === "decoration" && bench.footprint === 1 && fountain.footprint === 1 && bench.heritage && fountain.heritage && bench.line === null && bench.asset_key === "cozy_bench");
    const sav = of(9001, "savings_project");
    check("savings kept: kind, 2x2, stage, goal id, not heritage", sav.kind === "savings" && sav.footprint === 2 && sav.metadata.stage === 2 && sav.metadata.savingsGoalId === 77 && sav.heritage === false && sav.asset_key === "savings_project", sav);
    const odd = of(9001, "mystery_thing");
    check("unknown key -> legacy, clamped to the map's corner", odd.kind === "legacy" && odd.tile_x === 69 && odd.tile_y === 0 && odd.heritage && odd.asset_key === "mystery_thing", odd);
    const corner = byContent("bottom-right corner"), neg = byContent("negative");
    check("2x2 at the far corner clamps to 68,48", corner.tile_x === 68 && corner.tile_y === 48, corner);
    check("negative pixels clamp to 0,0", neg.tile_x === 0 && neg.tile_y === 0, neg);
    const nullMeta = byContent("null metadata");
    check("NULL metadata survives", nullMeta.metadata.legacy_asset_key === "house" && nullMeta.tile_x === 0);
    const frac = of(9007, "supermarket");
    check("fractional pixels floor to a tile", frac.tile_x === 4 && frac.tile_y === 3, frac);
    check("orphan row with no owner is migrated too", byContent("orphan").kind === "line" && byContent("orphan").user_id === null);
    const twin = buildings.filter((r) => r.user_id === 9001 && r.metadata.legacy_asset_key === "house");
    check("overlapping old rows both survive at the same tile", twin.length === 2 && twin[0].tile_x === twin[1].tile_x);

    const statOf = async (uid) => q1("SELECT * FROM player_stats WHERE user_id=$1", [uid]);
    const expected = { 9001: [3, 30, 2, 1000], 9002: [12, 280, 7, 50], 9003: [1, 0, 0, 7], 9004: [8, 280, 7, 0], 9005: [0, 0, 0, 3], 9006: [null, 0, 0, 4], 9007: [2, 10, 1, 5] };
    for (const [uid, [legacy, xp, summons, coins]] of Object.entries(expected)) {
        const s = await statOf(uid);
        check(`grandfather old level ${legacy} -> xp ${xp}, ${summons} summons, coins kept`, s.legacy_level === legacy && s.town_xp === xp && s.pending_summons === summons && s.coins === coins && s.builder_migrated && s.last_active_at !== null && s.zone_step === 0, { legacy: s.legacy_level, xp: s.town_xp, summons: s.pending_summons, coins: s.coins });
    }

    const constraints = (await qa("SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%'")).map((r) => r.conname);
    for (const name of ["chk_buildings_state", "chk_buildings_kind", "chk_buildings_line", "chk_buildings_placed_has_tile", "chk_buildings_staff_mode", "chk_buildings_footprint", "chk_buildings_stored", "chk_player_stats_coins", "chk_player_stats_town_xp", "chk_player_stats_zone_step", "chk_player_stats_pending_summons"]) check(`constraint ${name} exists`, constraints.includes(name));
    const indexes = (await qa("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).map((r) => r.indexname);
    for (const name of ["idx_buildings_user_state", "uq_buildings_source_task", "uq_buildings_daily_log_stall", "idx_workers_user_id"]) check(`index ${name} exists`, indexes.includes(name));
    eq("buildings.kind is NOT NULL, x/y nullable", (await qa("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_name='buildings' AND column_name IN ('kind','x','y') ORDER BY 1")).map((r) => r.is_nullable), ["NO", "YES", "YES"]);

    section("migration: run twice, then twice more");
    await sleep(1100); // so a NOW() rewrite would show up in the hash
    eq("second run succeeds", migrate(appDir), "ok");
    const second = await snapshot();
    check("second run changes no data, column, constraint or index", sameData(first, second), { first, second });
    eq("third run succeeds", migrate(appDir), "ok");
    check("third run changes nothing either", sameData(first, await snapshot()));

    section("migration: re-running over a live town");
    await db.query("UPDATE player_stats SET pending_summons=0, town_xp=31, coins=1 WHERE user_id=9001");
    await db.query("INSERT INTO users (id,google_id,email,name) VALUES (9100,'g9100','newbie@test.local','Newbie')");
    await db.query("INSERT INTO player_stats (user_id) VALUES (9100)");
    migrate(appDir);
    const live = await statOf(9001);
    check("opened summons aren't granted again, xp and coins stay", live.pending_summons === 0 && live.town_xp === 31 && live.coins === 1, live);
    const fresh = await statOf(9100);
    check("a stats row made after the migration is already on the new system", fresh.builder_migrated === true && fresh.last_active_at !== null && fresh.town_xp === 0 && fresh.pending_summons === 0, fresh);
    await db.query("UPDATE player_stats SET pending_summons=2, town_xp=30, coins=1000 WHERE user_id=9001");

    section("migration: two real server boots on the migrated DB");
    const preBoot = { buildings: await q1("SELECT md5(string_agg(x::text,'|' ORDER BY x.id)) h FROM buildings x"), stats: await q1("SELECT md5(string_agg(x::text,'|' ORDER BY x.id)) h FROM player_stats x") };
    await startServers();
    const postBoot = { buildings: await q1("SELECT md5(string_agg(x::text,'|' ORDER BY x.id)) h FROM buildings x"), stats: await q1("SELECT md5(string_agg(x::text,'|' ORDER BY x.id)) h FROM player_stats x") };
    check("booting the servers changes no building or stats row", sameData(preBoot, postBoot));
    await startSampler();
}
