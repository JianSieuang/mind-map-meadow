import pg from "pg";
const { Pool, types } = pg;

// DATE columns stay as plain "YYYY-MM-DD" strings instead of being turned into a
// JS Date at the Node process's local midnight (which shifts the day when the
// server isn't running in UTC).
types.setTypeParser(types.builtins.DATE, (value) => value);

// Timezone-less TIMESTAMP columns are written by Postgres NOW() in UTC (the
// container's default), so read them back as UTC regardless of Node's local zone.
types.setTypeParser(types.builtins.TIMESTAMP, (value) => new Date(value.replace(" ", "T") + "Z"));

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
