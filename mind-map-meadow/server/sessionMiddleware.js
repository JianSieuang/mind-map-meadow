import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

const PgSession = connectPgSimple(session);

// Shared instance: mounted on the Express app via app.use(), and on the raw
// Socket.IO engine via io.engine.use() (see server.js), so both HTTP requests
// and the Socket.IO handshake read/write the exact same session.
export const sessionMiddleware = session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
});
