// Session and auth rejection. A successful Google login can't be tested here (no real tokens are used).
import { check, eq, section, mkUser, loginAs, connect, init, call, probe, http, cookieFor, q1, qa, db, stats, addTask, sleep, quiet } from "../lib/harness.mjs";

export async function run() {
    section("sockets without a valid session");
    const u = await mkUser("auth");
    for (const transports of [["websocket"], ["polling"]]) {
        const label = transports[0];
        const none = await probe(null, { transports });
        check(`${label}: no cookie -> disconnected, no data`, !none.connected && !none.events.includes("init_state"), none);
        const garbage = await probe("connect.sid=not-a-real-cookie", { transports });
        check(`${label}: garbage cookie -> disconnected`, !garbage.connected && !garbage.events.includes("init_state"), garbage);
        const unsigned = await probe(`connect.sid=${encodeURIComponent("s:" + u.sid)}`, { transports });
        check(`${label}: right sid, no signature -> disconnected`, !unsigned.connected && !unsigned.events.includes("init_state"), unsigned);
        const forged = await probe(cookieFor(u.sid, "the-wrong-secret"), { transports });
        check(`${label}: signed with another secret -> disconnected`, !forged.connected && !forged.events.includes("init_state"), forged);
        const unknown = await probe(cookieFor("00000000-0000-0000-0000-000000000000"), { transports });
        check(`${label}: well-signed unknown sid -> disconnected`, !unknown.connected && !unknown.events.includes("init_state"), unknown);
    }
    const expired = await loginAs(u.id, { expire: "2020-01-01T00:00:00.000Z" });
    const exp = await probe(expired.cookie);
    check("expired session -> disconnected", !exp.connected && !exp.events.includes("init_state"), exp);
    const authOnly = await probe(null, { auth: { userId: u.id, timezone: "UTC" } });
    check("userId in the handshake auth means nothing", !authOnly.connected && !authOnly.events.includes("init_state"), authOnly);

    section("a socket can't pick its identity");
    {
        const other = await mkUser("auth-other");
        const s = await connect(u, { auth: { timezone: "UTC", userId: other.id } });
        const st = await init(s);
        const rows = await q1("SELECT user_id FROM player_stats WHERE user_id=$1", [other.id]);
        check("handshake userId ignored, cookie decides", rows && st.stats.user_id === u.id, st.stats.user_id);
        const task = await addTask(other);
        s.emit("complete_task", task);
        s.emit("complete_task", { id: task, userId: other.id });
        await sleep(120);
        eq("the other user's task stays pending", (await q1("SELECT status FROM tasks WHERE id=$1", [task])).status, "pending");
    }

    section("timezone in the handshake");
    for (const [label, auth, expected] of [
        ["valid", { timezone: "Asia/Tokyo" }, "Asia/Tokyo"],
        ["unknown zone", { timezone: "Mars/Olympus" }, "UTC"],
        ["number", { timezone: 5 }, "UTC"],
        ["object", { timezone: { a: 1 } }, "UTC"],
        ["very long", { timezone: "A".repeat(100) }, "UTC"],
        ["sql", { timezone: "'; DROP TABLE users;--" }, "UTC"],
        ["missing", {}, "UTC"],
    ]) {
        const t = await mkUser("tzval");
        const s = await connect(t, { auth });
        await init(s);
        eq(`${label} -> users.timezone ${expected}`, (await q1("SELECT timezone FROM users WHERE id=$1", [t.id])).timezone, expected);
    }

    section("HTTP: /auth/me");
    {
        const none = await http("/auth/me");
        eq("no cookie -> 401 and a null user", [none.status, await none.json()], [401, { user: null }]);
        const bad = await http("/auth/me", { cookie: cookieFor(u.sid, "wrong") });
        eq("bad signature -> 401", bad.status, 401);
        const ok = await http("/auth/me", { cookie: u.cookie });
        const body = await ok.json();
        eq("valid -> 200 with the right id", [ok.status, body.user?.id], [200, u.id]);
        eq("public fields only", Object.keys(body.user).sort(), ["avatarUrl", "email", "id", "name"]);
        const expiredMe = await http("/auth/me", { cookie: expired.cookie });
        eq("expired session -> 401", expiredMe.status, 401);
    }

    section("HTTP: /auth/google rejects everything without a real token");
    {
        const missing = await http("/auth/google", { method: "POST", body: {} });
        eq("no credential -> 400", missing.status, 400);
        const garbage = await http("/auth/google", { method: "POST", body: { credential: "not.a.jwt" } });
        eq("garbage credential -> 401", garbage.status, 401);
        const num = await http("/auth/google", { method: "POST", body: { credential: 12345 } });
        eq("non-string credential -> 401", num.status, 401);
        const fake = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: "x", email: "x@x", aud: "qa-dummy-client-id" })).toString("base64url") + ".";
        const none = await http("/auth/google", { method: "POST", body: { credential: fake } });
        eq("unsigned alg:none token -> 401", none.status, 401);
        eq("no user was created", (await qa("SELECT id FROM users WHERE google_id='x'")).length, 0);
        check("no session cookie on failure", !none.headers.get("set-cookie"));
        const broken = await http("/auth/google", { method: "POST", body: "{not json" });
        check("malformed JSON is a client error, not a crash", broken.status >= 400 && broken.status < 500, broken.status);
    }

    section("HTTP: logout");
    {
        const v = await mkUser("logout");
        const open = await connect(v);
        await init(open);
        const res = await http("/auth/logout", { method: "POST", cookie: v.cookie });
        eq("logout -> 200 ok", [res.status, await res.json()], [200, { ok: true }]);
        check("clears the cookie", /connect\.sid=;/.test(res.headers.get("set-cookie") || ""), res.headers.get("set-cookie"));
        eq("session row is gone", (await qa("SELECT sid FROM session WHERE sid=$1", [v.sid])).length, 0);
        eq("/auth/me -> 401 afterwards", (await http("/auth/me", { cookie: v.cookie })).status, 401);
        const retry = await probe(v.cookie);
        check("a new socket with the old cookie is refused", !retry.connected && !retry.events.includes("init_state"), retry);
        const idem = await http("/auth/logout", { method: "POST" });
        eq("logout with no session is harmless", idem.status, 200);

        // The socket opened before the logout must not stay authorised.
        const task = await addTask(v);
        await quiet(open, "complete_task", task, 300);
        const after = await stats(v);
        check("a socket opened before logout can't earn coins after it", after.coins === 0 && open.connected === false, { coins: after.coins, stillConnected: open.connected });
    }

    section("a session for a deleted user");
    {
        const gone = await mkUser("deleted");
        const session = await loginAs(gone.id);
        const s = await connect(session);
        await db.query("DELETE FROM users WHERE id=$1", [gone.id]);
        const me = await http("/auth/me", { cookie: session.cookie });
        eq("/auth/me -> 401", me.status, 401);
        const r = await call(s, "auto_place");
        eq("mutation -> clean SERVER error, no crash", r.code, "SERVER");
        eq("no stats row comes back", (await qa("SELECT id FROM player_stats WHERE user_id=$1", [gone.id])).length, 0);
        s.emit("request_init_state");
        s.emit("request_friends_state");
        s.emit("search_users", { query: "ab" });
        await sleep(200);
        const post = await http("/auth/me");
        eq("the server is still up", post.status, 401);
    }
}
