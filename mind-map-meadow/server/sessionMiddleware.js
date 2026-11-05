import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

const PgSession = connectPgSimple(session);

// Production runs behind TLS (see `trust proxy` in server.js). A secure cookie is never
// sent over plain http, so this stays off in dev.
export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
};

// Shared instance: mounted on the Express app via app.use(), and on the raw
// Socket.IO engine via io.engine.use() (see server.js), so both HTTP requests
// and the Socket.IO handshake read/write the exact same session.
export const sessionMiddleware = session({
    store: new PgSession({ pool, tableName: "session", createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        ...SESSION_COOKIE_OPTIONS,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
});

// Every socket joins the room of the session it logged in with, so ending a session can
// drop exactly that session's sockets and leave the user's other devices alone.
export function sessionRoomFor(sessionId) {
    return `session:${sessionId}`;
}
