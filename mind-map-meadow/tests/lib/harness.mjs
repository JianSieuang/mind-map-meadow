// Shared test helpers. Refuses to run against anything but the throwaway DB.
import crypto from "node:crypto";
import pg from "pg";
import { io } from "socket.io-client";
import signature from "cookie-signature";

if (!/\/meadow_qa_api$/.test(process.env.DATABASE_URL || "")) throw new Error("refusing: DATABASE_URL is not meadow_qa_api");

pg.types.setTypeParser(1082, (v) => v); // DATE stays "YYYY-MM-DD", same as server/db.js
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
export const PORT = Number(process.env.PORT);
export const CLOCK_PORT = Number(process.env.CLOCK_PORT);
export const CONTROL_PORT = Number(process.env.CLOCK_CONTROL_PORT);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- results
export const results = { pass: 0, fail: 0, failures: [] };
let current = "";
export function section(name) {
    current = name;
    console.log(`\n== ${name}`);
}
function where() {
    const line = new Error().stack.split("\n").find((l) => /[\\/]tests[\\/]suites[\\/]/.test(l)) || "";
    const m = line.match(/tests[\\/]suites[\\/]([^:]+:\d+)/);
    return m ? `tests/suites/${m[1]}` : "?";
}
export function check(name, ok, info) {
    if (ok) {
        results.pass++;
        console.log(`  ok   ${name}`);
        return true;
    }
    results.fail++;
    const at = where();
    const detail = info === undefined ? "" : JSON.stringify(info);
    results.failures.push({ section: current, name, at, detail });
    console.log(`  FAIL ${name} (${at}) ${detail}`);
    return false;
}
export const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

// ---------- users and sessions (test DB only)
let nextId = 100000;
const FAR = "2099-01-01T00:00:00.000Z";
export function cookieFor(sid, secret = process.env.SESSION_SECRET) {
    return "connect.sid=" + encodeURIComponent("s:" + signature.sign(sid, secret));
}
export async function loginAs(id, { expire = FAR } = {}) {
    const sid = crypto.randomUUID();
    const sess = { cookie: { originalMaxAge: 86400000, expires: FAR, httpOnly: true, path: "/" }, userId: id };
    await db.query("INSERT INTO session (sid,sess,expire) VALUES ($1,$2,$3)", [sid, JSON.stringify(sess), expire]);
    return { id, sid, cookie: cookieFor(sid) };
}
// `active` sets last_active_at, needed when the clock server is running at a fake time.
export async function mkUser(label, { active = null, noStats = false, name = null } = {}) {
    const id = nextId++;
    await db.query("INSERT INTO users (id,google_id,email,name) VALUES ($1,$2,$3,$4)", [id, "g" + id, `${label}${id}@test.local`, name ?? label]);
    if (!noStats) await db.query("INSERT INTO player_stats (user_id,last_active_at) VALUES ($1,COALESCE($2::timestamptz,NOW()))", [id, active]);
    return loginAs(id);
}

// ---------- sockets
const open = new Set();
let connectWorst = 0;
export async function connect(user, { tz = "UTC", port = PORT, transports = ["websocket"], auth } = {}) {
    const began = Date.now();
    const s = io(`http://127.0.0.1:${port}`, { transports, extraHeaders: { Cookie: user.cookie }, auth: auth ?? { timezone: tz }, forceNew: true, reconnection: false });
    s.events = [];
    s.onAny((e, d) => {
        if (e !== "state_update") s.events.push([e, d]);
    });
    open.add(s);
    await new Promise((res, rej) => {
        s.once("connect", res);
        s.once("connect_error", rej);
        setTimeout(() => rej(new Error("connect timeout")), 15000);
    });
    connectWorst = Math.max(connectWorst, Date.now() - began);
    return s;
}
export const closeAll = () => {
    for (const s of open) s.close();
    open.clear();
};
// What the server does to a connection with these headers.
export async function probe(cookie, { port = PORT, transports = ["websocket"], auth } = {}) {
    const s = io(`http://127.0.0.1:${port}`, { transports, extraHeaders: cookie ? { Cookie: cookie } : {}, auth, forceNew: true, reconnection: false });
    const seen = [];
    s.onAny((e) => seen.push(e));
    s.emit("request_init_state");
    await sleep(500);
    const out = { connected: s.connected, events: seen };
    s.close();
    return out;
}
const emit = (s, event, payload) => (payload === undefined ? s.emit(event) : s.emit(event, payload));
// Emits and resolves at the next builder_state / builder_error / money_error, with the fx seen on the way.
export function call(s, event, payload, timeout = 5000) {
    const start = s.events.length;
    return new Promise((resolve) => {
        const finish = (error, moneyError, state) => {
            clearTimeout(t);
            s.off("builder_state", ok);
            s.off("builder_error", bad);
            s.off("money_error", moneyBad);
            setTimeout(() => {
                const all = s.events.slice(start);
                resolve({ error, code: error?.code, moneyError, state, fx: Object.fromEntries(all), all });
            }, 25);
        };
        const ok = (st) => finish(null, null, st);
        const bad = (e) => finish(e, null, null);
        const moneyBad = (m) => finish(null, m, null);
        const t = setTimeout(() => finish({ code: "TIMEOUT" }, null, null), timeout);
        s.once("builder_state", ok);
        s.once("builder_error", bad);
        s.once("money_error", moneyBad);
        emit(s, event, payload);
    });
}
// For handlers that stay silent on rejection: emit, wait, return what came back.
export async function quiet(s, event, payload, ms = 150) {
    const start = s.events.length;
    emit(s, event, payload);
    await sleep(ms);
    return s.events.slice(start);
}
// Emits and waits for one named reply. Resolves null on timeout.
export function until(s, reply, event, payload, timeout = 5000) {
    return new Promise((resolve) => {
        const on = (d) => {
            clearTimeout(t);
            resolve(d ?? true);
        };
        const t = setTimeout(() => {
            s.off(reply, on);
            resolve(null);
        }, timeout);
        s.once(reply, on);
        emit(s, event, payload);
    });
}
export const init = (s) => until(s, "init_state", "request_init_state", undefined, 8000);
export const visit = async (s) => (await init(s))?.builder;

// ---------- data
export const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
export const qa = async (sql, p) => (await db.query(sql, p)).rows;
export const stats = (u) => q1("SELECT * FROM player_stats WHERE user_id=$1", [u.id]);
export const setStats = (u, fields) => {
    const keys = Object.keys(fields);
    return db.query(`UPDATE player_stats SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")} WHERE user_id=$1`, [u.id, ...keys.map((k) => fields[k])]);
};
export async function counts(u) {
    const rows = await qa("SELECT state,COUNT(*)::int n FROM buildings WHERE user_id=$1 GROUP BY state", [u.id]);
    return Object.fromEntries(rows.map((x) => [x.state, x.n]));
}
export const row = (id) => q1("SELECT * FROM buildings WHERE id=$1", [id]);
export async function addTask(u, category = "Coding", { recurring = null, title = "t", due = "2026-11-05" } = {}) {
    return (await q1("INSERT INTO tasks (title,category,due_date,user_id,recurring_task_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [title, category, due, u.id, recurring])).id;
}
export async function mkLine(u, line, level, tx, ty, { state = "placed", mode = "auto", heritage = false } = {}) {
    const placed = state === "placed";
    return (
        await q1(
            `INSERT INTO buildings (type,asset_key,user_id,kind,line,level,state,tile_x,tile_y,x,y,footprint,staff_mode,heritage,generated_on)
             VALUES ('Building',$1,$2,'line',$3,$4,$5,$6,$7,$8,$9,2,$10,$11,'2026-11-05') RETURNING id`,
            [`${line}_${level}`, u.id, line, level, state, placed ? tx : null, placed ? ty : null, placed ? tx * 48 + 48 : null, placed ? ty * 48 + 48 : null, mode, heritage],
        )
    ).id;
}
export async function mkDeco(u, assetKey, tx, ty, kind = "decoration", footprint = 1) {
    return (await q1(`INSERT INTO buildings (type,asset_key,user_id,kind,state,tile_x,tile_y,x,y,footprint,metadata) VALUES ('Deco',$1,$2,$3,'placed',$4,$5,0,0,$6,'{}') RETURNING id`, [assetKey, u.id, kind, tx, ty, footprint])).id;
}
export const addWorker = async (u, key, pin = null) => (await q1("INSERT INTO workers (user_id,worker_key,assigned_building_id) VALUES ($1,$2,$3) RETURNING id", [u.id, key, pin])).id;
export const B = (state, id) => state.placed.find((x) => x.id === id) ?? state.inventory.find((x) => x.id === id);
export const noOverlap = (list) =>
    !list.some((a, i) => list.some((b, j) => i < j && a.tileX < b.tileX + b.footprint && b.tileX < a.tileX + a.footprint && a.tileY < b.tileY + b.footprint && b.tileY < a.tileY + a.footprint));

// Everything a user owns, as one hash. Identical before and after = nothing was touched.
export async function userHash(id) {
    const parts = [];
    for (const t of ["player_stats", "buildings", "tasks", "recurring_tasks", "transactions", "savings_goals", "workers"]) {
        const r = await q1(`SELECT md5(COALESCE(string_agg(x::text,'|' ORDER BY x.id),'')) h FROM ${t} x WHERE user_id=$1`, [id]);
        parts.push(r.h);
    }
    return parts.join(":");
}

// ---------- clock server
export const setClock = (iso) => fetch(`http://127.0.0.1:${CONTROL_PORT}/set?iso=${encodeURIComponent(iso)}`).then((r) => r.text());
export const advanceHours = (h) => fetch(`http://127.0.0.1:${CONTROL_PORT}/advance?ms=${Math.round(h * 3600000)}`).then((r) => r.text());
export const prompts = () => fetch(`http://127.0.0.1:${CONTROL_PORT}/prompts`).then((r) => r.json());
export const http = (path, { method = "GET", cookie, body, port = PORT } = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });

// ---------- stall sampler: tells a slow DB apart from a stuck server when a run hiccups
export async function startSampler() {
    await db.query("CREATE TABLE IF NOT EXISTS qa_probe (id SERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT NOW())");
    const session = await mkUser("sampler");
    const worst = {};
    const timed = async (name, fn) => {
        const began = Date.now();
        try {
            await fn();
        } catch {
            worst[name + " errors"] = (worst[name + " errors"] || 0) + 1;
        }
        worst[name] = Math.max(worst[name] || 0, Date.now() - began);
    };
    let running = true;
    const loop = (async () => {
        while (running) {
            await Promise.all([
                timed("db commit", () => db.query("INSERT INTO qa_probe DEFAULT VALUES")),
                timed("plain http, no db", () => http("/auth/me")),
                timed("plain http, session db", () => http("/auth/me", { cookie: session.cookie })),
                timed("clock http, no db", () => http("/auth/me", { port: CLOCK_PORT })),
                timed("clock http, session db", () => http("/auth/me", { port: CLOCK_PORT, cookie: session.cookie })),
            ]);
            await sleep(200);
        }
    })();
    return async () => {
        running = false;
        await loop;
        return { ...worst, "socket connect": connectWorst };
    };
}
