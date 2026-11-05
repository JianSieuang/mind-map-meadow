// Test-only preload: `node --import ./tests/lib/fakeClock.mjs server.js`. App code is untouched.
// Lets the suites freeze and move the server's clock, and stubs Ollama so prompts can be inspected.
import http from "node:http";
import { OAuth2Client } from "google-auth-library";

// Real Google tokens are never used in tests. On this server only, "qa-login:<sub>" stands in
// for one, so the login route can be run end to end.
const realVerify = OAuth2Client.prototype.verifyIdToken;
OAuth2Client.prototype.verifyIdToken = function (options) {
    const match = /^qa-login:(.+)$/.exec(options.idToken);
    if (!match) return realVerify.call(this, options);
    return Promise.resolve({ getPayload: () => ({ sub: match[1], email: `${match[1]}@test.local`, name: match[1], picture: null }) });
};

const RealDate = Date;
let frozen = null;
class FakeDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) super(frozen ?? RealDate.now());
        else super(...args);
    }
    static now() {
        return frozen ?? RealDate.now();
    }
}
globalThis.Date = FakeDate;

const prompts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (String(url).includes("ollama:11434")) {
        prompts.push(JSON.parse(options.body).prompt);
        return new Response(JSON.stringify({ response: "ACTION: WANDER | THOUGHT: stub thought" }), { status: 200 });
    }
    return realFetch(url, options);
};

http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/set") frozen = RealDate.parse(url.searchParams.get("iso"));
    if (url.pathname === "/advance") frozen = (frozen ?? RealDate.now()) + Number(url.searchParams.get("ms"));
    if (url.pathname === "/prompts") return res.end(JSON.stringify(prompts));
    res.end(new RealDate(frozen ?? RealDate.now()).toISOString());
}).listen(Number(process.env.CLOCK_CONTROL_PORT), "127.0.0.1");
