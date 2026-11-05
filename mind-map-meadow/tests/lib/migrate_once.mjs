// Runs the real migration list once against DATABASE_URL.
if (!/\/meadow_qa_api$/.test(process.env.DATABASE_URL || "")) throw new Error("refusing: not the test DB");
const { pool } = await import("../../server/db.js");
const { runMigrations } = await import("../../db/index.js");
const log = console.log;
console.log = () => {};
try {
    await runMigrations(pool);
    console.log = log;
    console.log("ok");
} finally {
    await pool.end();
}
