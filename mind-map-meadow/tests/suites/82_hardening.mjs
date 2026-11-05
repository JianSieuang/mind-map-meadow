// Fix round 1: socket origin allowlist, per-socket rate limit, builder.rev, logout scope,
// and the cap on unanswered friend requests.
import { io } from "socket.io-client";
import { check, eq, section, mkUser, loginAs, connect, init, call, http, sleep, until, PORT, CLOCK_PORT, qa, db } from "../lib/harness.mjs";

function tryOrigin(user, origin) {
    const s = io(`http://127.0.0.1:${PORT}`, { transports: ["websocket"], extraHeaders: { Cookie: user.cookie, ...(origin ? { Origin: origin } : {}) }, auth: { timezone: "UTC" }, forceNew: true, reconnection: false });
    return new Promise((resolve) => {
        const done = (connected) => {
            s.close();
            resolve(connected);
        };
        s.once("connect", () => done(true));
        s.once("connect_error", () => done(false));
        setTimeout(() => done(false), 3000);
    });
}

export async function run() {
    section("origin allowlist");
    {
        const u = await mkUser("origin");
        eq("another website is refused, even with a good cookie", await tryOrigin(u, "https://evil.example"), false);
        eq("a lookalike of localhost is refused", await tryOrigin(u, "http://localhost.evil.example:5173"), false);
        eq("Origin: null is refused", await tryOrigin(u, "null"), false);
        eq("a dev origin on localhost is allowed", await tryOrigin(u, "http://localhost:5173"), true);
        eq("the app's own origin is allowed", await tryOrigin(u, `http://127.0.0.1:${PORT}`), true);
        eq("no Origin (a native client) is allowed", await tryOrigin(u, null), true);
    }

    section("rate limit");
    {
        const u = await mkUser("limit");
        const flood = await connect(u), other = await connect(u);
        await init(flood);
        for (let i = 0; i < 400; i++) flood.emit("set_tutorial", { step: 1, done: false });
        await sleep(600);
        const errors = flood.events.filter(([e, d]) => e === "builder_error" && d.code === "RATE_LIMITED");
        check("a flood gets a friendly error", errors.length >= 1 && typeof errors[0][1].message === "string", errors.length);
        check("and only a few of them, not one per event", errors.length <= 2, errors.length);
        eq("the error goes only to the socket that flooded", other.events.filter(([e]) => e === "builder_error").length, 0);
        check("another socket of the same user still works", !!(await call(other, "auto_place")).state);
        check("reads still answer during a flood", !!(await call(flood, "request_builder_state")).state);
        flood.emit("player_move", { x: 321, y: 123 });
        await sleep(60);
        eq("player_move isn't limited", (await init(other)).player, { x: 321, y: 123 });
        await sleep(1000);
        check("the socket recovers after a pause", !!(await call(flood, "auto_place")).state);
    }

    section("builder.rev");
    {
        const u = await mkUser("rev");
        const s = await connect(u);
        const first = (await init(s)).builder;
        check("init_state's builder carries a rev on the Date.now()*1000 scale", Number.isSafeInteger(first.rev) && first.rev > Date.UTC(2026, 0, 1) * 1000, first.rev);
        const revs = [first.rev];
        for (let i = 0; i < 3; i++) revs.push((await call(s, "request_builder_state")).state.rev);
        revs.push((await call(s, "auto_place")).state.rev);
        check("each payload's rev is higher than the last", revs.every((rev, i) => i === 0 || rev > revs[i - 1]), revs);

        const start = s.events.length;
        for (let i = 0; i < 20; i++) s.emit("request_builder_state");
        await sleep(400);
        const burst = s.events.slice(start).filter(([e]) => e === "builder_state").map(([, d]) => d.rev);
        eq("a burst gets 20 payloads", burst.length, 20);
        eq("with 20 different revs", new Set(burst).size, 20);
    }

    section("logout only ends that session");
    {
        const u = await mkUser("twodevices");
        const phone = await loginAs(u.id);
        const laptopSocket = await connect(u), phoneSocket = await connect(phone);
        await init(laptopSocket);
        await init(phoneSocket);
        eq("logout -> 200", (await http("/auth/logout", { method: "POST", cookie: u.cookie })).status, 200);
        await sleep(200);
        eq("that session's socket is dropped", laptopSocket.connected, false);
        eq("the user's other device stays connected", phoneSocket.connected, true);
        check("and keeps working", !!(await call(phoneSocket, "auto_place")).state);
    }

    section("login makes a new session");
    {
        const before = await mkUser("relogin");
        const oldSocket = await connect(before, { port: CLOCK_PORT });
        const sub = `qa${Date.now()}`;
        const res = await http("/auth/google", { method: "POST", port: CLOCK_PORT, cookie: before.cookie, body: { credential: `qa-login:${sub}` } });
        const body = await res.json();
        eq("login -> 200 as the new account", [res.status, body.user?.email], [200, `${sub}@test.local`]);
        const setCookie = res.headers.get("set-cookie") || "";
        const cookie = setCookie.split(";")[0];
        check("a new session cookie is set, HttpOnly, not Secure outside production", cookie.startsWith("connect.sid=") && cookie !== before.cookie && /HttpOnly/i.test(setCookie) && !/Secure/i.test(setCookie), setCookie);
        eq("the old session id is gone", (await qa("SELECT sid FROM session WHERE sid=$1", [before.sid])).length, 0);
        eq("the old cookie no longer logs in", (await http("/auth/me", { port: CLOCK_PORT, cookie: before.cookie })).status, 401);
        const me = await (await http("/auth/me", { port: CLOCK_PORT, cookie })).json();
        eq("the new cookie does", me.user?.id, body.user?.id);
        await sleep(200);
        eq("a socket on the old session is dropped", oldSocket.connected, false);
        const s = await connect({ cookie }, { port: CLOCK_PORT });
        check("a socket on the new session works", (await init(s))?.stats?.user_id === body.user.id);
        await http("/auth/logout", { method: "POST", port: CLOCK_PORT, cookie });
        await sleep(200);
        eq("and logout drops it", s.connected, false);
    }

    section("friend requests can't walk through every account");
    {
        const u = await mkUser("walker");
        const s = await connect(u);
        await init(s);
        const targets = [];
        for (let i = 0; i < 51; i++) targets.push(await mkUser(`walked${i}`, { noStats: true }));
        for (const t of targets.slice(0, 50)) await db.query("INSERT INTO friendships (requester_id,addressee_id,status) VALUES ($1,$2,'pending')", [u.id, t.id]);
        const err = await until(s, "builder_error", "send_friend_request", { addresseeId: targets[50].id }, 1000);
        eq("the 51st unanswered request is refused with a message", err?.code, "RATE_LIMITED");
        eq("nothing was saved", (await qa("SELECT id FROM friendships WHERE requester_id=$1", [u.id])).length, 50);
    }
}
