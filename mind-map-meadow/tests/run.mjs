// One command: builds the throwaway DB from a dump of the real one, boots the servers, runs every
// suite, then stops the servers and drops the DB and role. Run from mind-map-meadow/:
//     node tests/run.mjs            everything
//     node tests/run.mjs money      the migration suite plus suites whose file name contains "money"
//     node tests/run.mjs --keep     leave the DB and role behind for debugging
// The real DB is only ever read (pg_dump and a before/after fingerprint). .env is never read:
// the servers log in as a throwaway role with a random per-run password.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DB = "meadow_qa_api";
const TEST_ROLE = "meadow_qa_api_role";
const REAL_DB = "mind_map_meadow";
const CONTAINER = "meadow-db";
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.dirname(here);
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const filter = args.find((a) => !a.startsWith("--"));
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-qa-"));

// Runs inside the container, so the admin name comes from the container's env and is never printed.
function inContainer(script) {
    return execFileSync("docker", ["exec", "-i", CONTAINER, "sh", "-c", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
}
const adminSql = (database, sql) => inContainer(`psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${database} -Atc "${sql}"`);
const realFingerprint = () =>
    adminSql(
        REAL_DB,
        ["users", "player_stats", "buildings", "tasks", "recurring_tasks", "transactions", "savings_goals", "friendships"]
            .map((t) => `select '${t}', count(*), md5(coalesce(string_agg(x::text, '|' order by x.id), '')) from ${t} x`)
            .join(" union all "),
    );
function dropTestDb() {
    adminSql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    adminSql("postgres", `DROP ROLE IF EXISTS ${TEST_ROLE}`);
}

const password = crypto.randomBytes(24).toString("hex");
const env = {
    ...process.env,
    DATABASE_URL: `postgres://${TEST_ROLE}:${password}@127.0.0.1:5432/${TEST_DB}`,
    SESSION_SECRET: "dummy-qa-secret-not-real",
    PORT: "5011",
    CLOCK_PORT: "5012",
    CLOCK_CONTROL_PORT: "5112",
    GOOGLE_CLIENT_ID: "qa-dummy-client-id",
};
Object.assign(process.env, env);

// Another tester's server may hold a port. Never mistake it for ours, and never touch it.
const portInUse = (port) =>
    new Promise((resolve) => {
        const c = net.connect(port, "127.0.0.1");
        c.once("connect", () => (c.destroy(), resolve(true)));
        c.once("error", () => resolve(false));
    });

function startServer(name, port, preload) {
    const log = fs.openSync(path.join(logDir, `${name}.log`), "w");
    const child = spawn(process.execPath, [...(preload ? ["--import", "./tests/lib/fakeClock.mjs"] : []), "server.js"], { cwd: appDir, env: { ...env, PORT: String(port) }, stdio: ["ignore", log, log] });
    child.exited = null;
    child.on("exit", (code) => (child.exited = code ?? "signal"));
    return child;
}
async function waitUp(port, child) {
    for (let i = 0; i < 150; i++) {
        if (child.exited !== null) throw new Error(`server on ${port} exited during boot, see ${logDir}`);
        try {
            await fetch(`http://127.0.0.1:${port}/auth/me`);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    throw new Error(`server on ${port} did not come up`);
}

const servers = [];
let stopSampler = null;
let code = 1;
const before = realFingerprint();
try {
    dropTestDb();
    adminSql("postgres", `CREATE ROLE ${TEST_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
    adminSql("postgres", `CREATE DATABASE ${TEST_DB} OWNER ${TEST_ROLE}`);
    adminSql(TEST_DB, "CREATE EXTENSION IF NOT EXISTS vector");
    // Pre-Builder-Loop schema built from the migration files, so the suite doesn't depend on the
    // real DB's state, and no real data is copied around.
    const dbDir = path.join(appDir, "db");
    const oldSql = fs.readdirSync(dbDir).filter((f) => /^\d+_.*\.sql$/.test(f) && parseInt(f, 10) < 15).sort().map((f) => fs.readFileSync(path.join(dbDir, f), "utf8")).join(";\n");
    execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", TEST_ROLE, "-d", TEST_DB], { input: oldSql, stdio: ["pipe", "ignore", "pipe"] });

    const h = await import(pathToFileURL(path.join(here, "lib/harness.mjs")).href);
    const hooks = {
        startServers: async () => {
            for (const port of [5011, 5012, 5112]) if (await portInUse(port)) throw new Error(`port ${port} is already in use by something else`);
            servers.push(startServer("plain", 5011, false), startServer("clock", 5012, true));
            await waitUp(5011, servers[0]);
            await waitUp(5012, servers[1]);
        },
        // Separate from startServers because it creates its own user, which isn't the boot's doing.
        startSampler: async () => {
            stopSampler = await h.startSampler();
        },
        appDir,
    };

    // Migration has to see the old schema, so it runs first and boots the servers itself.
    const files = fs.readdirSync(path.join(here, "suites")).filter((f) => f.endsWith(".mjs")).sort();
    const chosen = files.filter((f) => !filter || f.includes(filter) || f.startsWith("00"));
    for (const f of chosen) {
        const suite = await import(pathToFileURL(path.join(here, "suites", f)).href);
        try {
            await suite.run(hooks);
        } catch (err) {
            h.check(`suite ${f} ran to the end`, false, err.stack);
        }
        h.closeAll();
        for (const s of servers) if (s.exited !== null) h.check(`server still alive after ${f}`, false, { exit: s.exited });
    }

    if (stopSampler) console.log("Worst latency, ms:", JSON.stringify(await stopSampler()));
    h.section("real DB untouched, logs clean");
    h.check("real DB fingerprint unchanged", realFingerprint() === before);
    for (const name of ["plain", "clock"]) {
        const text = fs.readFileSync(path.join(logDir, `${name}.log`), "utf8");
        const bad = text.match(/.*(Unhandled|TypeError|ReferenceError|deadlock).*/);
        h.check(`no uncaught errors or deadlocks in the ${name} server log`, !bad, bad?.[0]);
    }
    await h.db.end();

    console.log(`\n${h.results.pass + h.results.fail} checks: ${h.results.pass} passed, ${h.results.fail} failed. Server logs: ${logDir}`);
    for (const f of h.results.failures) console.log(`FAIL [${f.section}] ${f.name}\n     ${f.at} ${f.detail}`);
    code = h.results.fail ? 1 : 0;
} catch (err) {
    console.error("Harness error:", err.message);
} finally {
    for (const s of servers) s.kill();
    await new Promise((r) => setTimeout(r, 500));
    if (!keep) dropTestDb();
}
process.exit(code);
