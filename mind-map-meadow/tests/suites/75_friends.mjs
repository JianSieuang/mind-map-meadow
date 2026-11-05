// Friend requests and read-only visits (§5.11). A visit must not leak anything private.
import { check, eq, section, mkUser, connect, init, call, quiet, until, q1, qa, sleep, mkLine, mkDeco, userHash, db, addTask, stats } from "../lib/harness.mjs";

const friendship = (a, b) => q1("SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)", [a.id, b.id]);
const visit = async (s, friendId) => {
    const start = s.events.length;
    s.emit("visit_friend_map", { friendId });
    for (let i = 0; i < 100; i++) {
        const hit = s.events.slice(start).find(([e]) => e === "visit_state" || e === "visit_failed");
        if (hit) return hit;
        await sleep(20);
    }
    return undefined;
};

// The fixed wait alone lost the race when a DB commit stalled for a moment, so it also waits
// for this call's own friends_state to arrive.
const friendsCall = async (s, event, payload) => {
    const start = s.events.length;
    s.emit(event, payload);
    await sleep(250);
    for (let i = 0; i < 100 && !s.events.slice(start).some(([e]) => e === "friends_state"); i++) await sleep(20);
    return [...s.events].reverse().find(([e]) => e === "friends_state")?.[1];
};

export async function run() {
    const unique = `Zebra${Date.now()}`;
    const a = await mkUser("frienda", { name: `${unique} Alice` }), b = await mkUser("friendb", { name: `${unique} Bob` }), c = await mkUser("friendc", { name: `${unique} Carol` });
    const sa = await connect(a), sb = await connect(b), sc = await connect(c);
    for (const s of [sa, sb, sc]) await init(s);

    section("search_users");
    {
        const found = await until(sa, "search_users_result", "search_users", { query: unique });
        eq("finds others by name, not yourself", found.map((r) => r.id).sort(), [b.id, c.id].sort());
        check("result has relationship fields", found.every((r) => r.friendshipStatus === null && r.isIncomingRequest === false));
        check("no google_id or timezone in results", found.every((r) => !("google_id" in r) && !("googleId" in r) && !("timezone" in r)), Object.keys(found[0]));
        check("a stranger's email isn't handed out by a name search", found.every((r) => !r.email), found.map((r) => Object.keys(r)));
        eq("under 2 chars: empty", await until(sa, "search_users_result", "search_users", { query: "z" }), []);
        eq("non-string: empty", await until(sa, "search_users_result", "search_users", { query: 5 }), []);
        eq("null payload: empty", await until(sa, "search_users_result", "search_users", null), []);
        const wild = await until(sa, "search_users_result", "search_users", { query: "%%" });
        check("% is literal: can't list every account", Array.isArray(wild) && wild.length === 0, { returned: wild?.length });
        const under = await until(sa, "search_users_result", "search_users", { query: "__" });
        check("_ is literal: can't list every account", Array.isArray(under) && under.length === 0, { returned: under?.length });
        const inj = await until(sa, "search_users_result", "search_users", { query: "' OR 1=1 --" });
        eq("SQL in the query is just text", inj, []);
        const bEmail = (await q1("SELECT email FROM users WHERE id=$1", [b.id])).email;
        const exact = await until(sa, "search_users_result", "search_users", { query: bEmail.toUpperCase() });
        eq("an exact email finds them, in any case", exact.map((r) => r.id), [b.id]);
        check("and still doesn't return the email of a non-friend", !exact[0].email, exact[0]);
        eq("part of an email finds nobody", await until(sa, "search_users_result", "search_users", { query: bEmail.slice(0, -3) }), []);
    }

    section("requests");
    {
        await quiet(sa, "send_friend_request", { addresseeId: a.id });
        eq("can't friend yourself", (await qa("SELECT id FROM friendships WHERE requester_id=$1 AND addressee_id=$1", [a.id])).length, 0);
        for (const bad of [null, {}, { addresseeId: "1" }, { addresseeId: 1.5 }, { addresseeId: 2147483648 }]) await quiet(sa, "send_friend_request", bad, 40);
        await quiet(sa, "send_friend_request", { addresseeId: 2147483000 });
        eq("no such user: nothing saved", (await qa("SELECT id FROM friendships WHERE requester_id=$1", [a.id])).length, 0);

        const stA = await friendsCall(sa, "send_friend_request", { addresseeId: b.id });
        const gotB = [...sb.events].reverse().find(([e]) => e === "friends_state")?.[1];
        eq("sender sees it as outgoing", stA.outgoing.map((f) => f.id), [b.id]);
        eq("receiver sees it as incoming", gotB.incoming.map((f) => f.id), [a.id]);
        const f = await friendship(a, b);
        eq("row is pending", f.status, "pending");
        check("friends_state has only the public shape", Object.keys(gotB.incoming[0]).sort().join() === "avatarUrl,email,friendshipId,id,name", Object.keys(gotB.incoming[0]));
        check("a pending request shows no email on either side", gotB.incoming[0].email === null && stA.outgoing[0].email === null, { incoming: gotB.incoming[0], outgoing: stA.outgoing[0] });
        await friendsCall(sa, "send_friend_request", { addresseeId: b.id });
        eq("sending twice makes one row", (await qa("SELECT id FROM friendships WHERE requester_id=$1 AND addressee_id=$2", [a.id, b.id])).length, 1);

        eq("pending: can't visit", (await visit(sa, b.id))?.[0], "visit_failed");
        await quiet(sa, "respond_friend_request", { requestId: f.id, accept: true });
        eq("the sender can't accept their own request", (await friendship(a, b)).status, "pending");
        await quiet(sc, "respond_friend_request", { requestId: f.id, accept: true });
        eq("a third user can't accept it", (await friendship(a, b)).status, "pending");
        await quiet(sc, "respond_friend_request", { requestId: f.id, accept: false });
        check("a third user can't reject it", await friendship(a, b));
        await quiet(sc, "remove_friend", { friendshipId: f.id });
        check("nor remove it", await friendship(a, b));
        await quiet(sa, "remove_friend", { friendshipId: f.id });
        check("remove_friend leaves a pending row alone", await friendship(a, b));
        for (const bad of [null, {}, { requestId: "1", accept: true }]) await quiet(sb, "respond_friend_request", bad, 40);

        await friendsCall(sb, "respond_friend_request", { requestId: f.id, accept: false });
        check("reject deletes the row", !(await friendship(a, b)));
        await friendsCall(sa, "send_friend_request", { addresseeId: b.id });
        check("a rejected request can be sent again", await friendship(a, b));
        const f2 = await friendship(a, b);
        const acc = await friendsCall(sb, "respond_friend_request", { requestId: f2.id, accept: true });
        eq("accept: both are friends", [(await friendship(a, b)).status, acc.friends.map((x) => x.id)], ["accepted", [a.id]]);
        check("an accepted friend's email is visible in the list", acc.friends[0]?.email === (await q1("SELECT email FROM users WHERE id=$1", [a.id])).email, acc.friends[0]);
        const asFriend = await until(sa, "search_users_result", "search_users", { query: unique });
        check("and in search, for that friend only", asFriend.find((r) => r.id === b.id)?.email && !asFriend.find((r) => r.id === c.id)?.email, asFriend);

        await friendsCall(sc, "send_friend_request", { addresseeId: a.id });
        await friendsCall(sa, "send_friend_request", { addresseeId: c.id });
        eq("a request back auto-accepts, with one row", [(await friendship(a, c)).status, (await qa("SELECT id FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)", [a.id, c.id])).length], ["accepted", 1]);
        await friendsCall(sc, "send_friend_request", { addresseeId: a.id });
        eq("re-sending when friends changes nothing", (await friendship(a, c)).status, "accepted");
    }

    section("visits: what a friend sees");
    {
        const placed = await mkLine(b, "coding", 2, 4, 3);
        await mkLine(b, "coding", 1, 0, 0, { state: "inventory" });
        await mkLine(b, "coding", 1, 0, 0, { state: "pooled" });
        await mkLine(b, "coding", 1, 0, 0, { state: "merged" });
        await db.query(`UPDATE buildings SET stored_milli=999, staffed=true, content='PRIVATE CONTENT', metadata='{"stage":1,"savingsGoalId":5,"legacy_asset_key":"x","purchase_price":250,"note":"secret","flipX":true}' WHERE id=$1`, [placed]);
        const tid = await addTask(b, "Coding", { title: "PRIVATE TASK TITLE" });
        await call(sb, "complete_task", tid);
        const sav = await call(sb, "add_savings_goal", { title: "PRIVATE GOAL TITLE", targetCents: 10000 });
        await call(sb, "add_transaction", { amountCents: 7777, direction: "expense", note: "PRIVATE NOTE" });
        await db.query("UPDATE buildings SET content='PRIVATE GOAL TITLE' WHERE id=$1", [sav.state.placed.find((x) => x.kind === "savings").id]);
        const hostBefore = await userHash(b.id);
        const visitorBefore = await userHash(a.id);

        const v = await visit(sa, b.id);
        eq("a friend can visit", v?.[0], "visit_state");
        const body = v[1];
        eq("host: id, name, avatar only", Object.keys(body.host).sort(), ["avatarUrl", "id", "name"]);
        eq("top level: host and buildings only", Object.keys(body).sort(), ["buildings", "host"]);
        eq("placed rows only", body.buildings.map((x) => x.kind).sort(), ["line", "savings"]);
        const expected = "asset_key,footprint,heritage,id,kind,level,line,metadata,tile_x,tile_y";
        check("each building has exactly the §5.11 fields", body.buildings.every((x) => Object.keys(x).sort().join() === expected), Object.keys(body.buildings[0]).sort().join());
        const lv2 = body.buildings.find((x) => x.id === placed);
        eq("metadata is filtered to render keys", lv2.metadata, { stage: 1, flipX: true });
        const text = JSON.stringify(body);
        for (const secret of ["stored", "staffed", "worker", "speed", "PRIVATE", "savingsGoalId", "purchase_price", "legacy_asset_key", "coins", "email", "source_task_id", "accrued", "7777", "@test.local"]) check(`visit payload has no "${secret}"`, !text.includes(secret));
        eq("visiting changes nothing for the host", await userHash(b.id), hostBefore);
        eq("visiting changes nothing for the visitor", await userHash(a.id), visitorBefore);

        const startHost = sb.events.length;
        for (const [ev, p] of [["collect", { buildingId: placed }], ["move_building", { buildingId: placed, tileX: 8, tileY: 8 }], ["set_staff_mode", { buildingId: placed, mode: "off" }], ["merge_buildings", { targetId: placed, sourceId: placed + 1 }], ["place_building", { buildingId: placed, tileX: 8, tileY: 8 }]]) {
            eq(`while visiting, ${ev} on the host's building -> NOT_FOUND`, (await call(sa, ev, p)).code, "NOT_FOUND");
        }
        eq("host's data still untouched", await userHash(b.id), hostBefore);
        await sleep(60);
        eq("the host receives none of it", sb.events.slice(startHost).filter(([e]) => e !== "ai_thought_broadcast").length, 0);
    }

    section("visits: permission");
    {
        const d = await mkUser("friendd");
        const sd = await connect(d);
        await init(sd);
        const v = await visit(sd, b.id);
        eq("not a friend -> visit_failed", v?.[0], "visit_failed");
        check("visit_failed leaks nothing", typeof v[1] === "string" && !v[1].includes("@"), v[1]);
        eq("visiting yourself -> visit_failed", (await visit(sd, d.id))?.[0], "visit_failed");
        eq("no such user -> visit_failed", (await visit(sd, 2147483000))?.[0], "visit_failed");
        for (const bad of [null, {}, { friendId: "1" }, { friendId: 1.5 }]) eq(`bad id ${JSON.stringify(bad)}: no state`, (await quiet(sd, "visit_friend_map", bad, 40)).filter(([e]) => e === "visit_state").length, 0);

        const f = await friendship(a, b);
        await friendsCall(sc, "request_friends_state");
        await quiet(sc, "remove_friend", { friendshipId: f.id });
        eq("a third user can't remove someone else's friendship", (await friendship(a, b)).status, "accepted");
        for (const bad of [null, {}, { friendshipId: "1" }]) await quiet(sa, "remove_friend", bad, 40);
        const st = await friendsCall(sa, "remove_friend", { friendshipId: f.id });
        check("remove_friend works from either side", !(await friendship(a, b)) && !st.friends.some((x) => x.id === b.id));
        eq("a removed friend can't visit", (await visit(sa, b.id))?.[0], "visit_failed");
    }

    section("friends: coins don't leak through the stats broadcast");
    {
        const x = await mkUser("leakx"), y = await mkUser("leaky");
        const sx = await connect(x), sy = await connect(y);
        await init(sx);
        await init(sy);
        await friendsCall(sx, "send_friend_request", { addresseeId: y.id });
        const f = await friendship(x, y);
        await friendsCall(sy, "respond_friend_request", { requestId: f.id, accept: true });
        await sleep(100);
        const start = sy.events.length;
        await call(sx, "complete_task", await addTask(x));
        await call(sx, "add_transaction", { amountCents: 100, direction: "expense" });
        await sleep(100);
        eq("a friend gets none of my task, money or builder events", sy.events.slice(start).map(([e]) => e).filter((e) => e !== "ai_thought_broadcast"), []);
        eq("their own coins are untouched", (await stats(y)).coins, 0);
    }
    void mkDeco;
}
