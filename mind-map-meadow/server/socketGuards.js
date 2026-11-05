// Connection-level protection for Socket.IO: who may connect, and how fast a socket may act.

// ---------------------------------------------------------------------------
// Origin allowlist. Stops another website opening a socket with the visitor's cookie.
// ALLOWED_ORIGINS is a comma-separated list, e.g. "https://meadow.example.com".
// ---------------------------------------------------------------------------
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizedOrigin(value) {
    try {
        return new URL(value).origin.toLowerCase();
    } catch {
        return null;
    }
}

const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((entry) => normalizedOrigin(entry.trim())).filter(Boolean));

export function isAllowedOrigin(origin, host) {
    // Browsers always send Origin on a cross-site request, so no header means same-origin
    // polling or a native client, and either one still needs a valid session cookie.
    if (!origin) return true;
    let url;
    try {
        url = new URL(origin);
    } catch {
        return false; // includes "null" from sandboxed frames and file:// pages
    }
    if (allowedOrigins.has(url.origin.toLowerCase())) return true;
    if (url.host === host) return true; // same-origin
    return process.env.NODE_ENV !== "production" && LOCAL_HOSTNAMES.has(url.hostname);
}

export function allowRequest(req, callback) {
    const allowed = isAllowedOrigin(req.headers.origin, req.headers.host);
    callback(allowed ? null : "Origin not allowed", allowed);
}

// ---------------------------------------------------------------------------
// Per-socket rate limit: a token bucket, far above what a person can do by hand.
// ---------------------------------------------------------------------------
const BUCKET_CAPACITY = 60;
const REFILL_PER_SECOND = 20;
const ERROR_INTERVAL_MS = 2000;

// Events that write to the database, plus search_users, which could otherwise be used to
// page through accounts. player_move only touches memory and fires constantly.
const LIMITED_EVENTS = new Set([
    "request_init_state",
    "place_building",
    "auto_place",
    "move_building",
    "merge_buildings",
    "collect",
    "collect_all",
    "set_staff_mode",
    "expand_zone",
    "open_summon",
    "assign_worker",
    "set_tutorial",
    "purchase_building",
    "complete_task",
    "add_task",
    "edit_task",
    "delete_task",
    "add_recurring_task",
    "edit_recurring_task",
    "toggle_recurring_task",
    "delete_recurring_task",
    "add_transaction",
    "delete_transaction",
    "add_savings_goal",
    "delete_savings_goal",
    "search_users",
    "send_friend_request",
    "respond_friend_request",
    "remove_friend",
]);

export function attachRateLimit(socket) {
    let tokens = BUCKET_CAPACITY;
    let refilledAt = performance.now();
    let lastErrorAt = -Infinity;

    socket.use(([event], next) => {
        if (!LIMITED_EVENTS.has(event)) return next();

        const now = performance.now();
        tokens = Math.min(BUCKET_CAPACITY, tokens + ((now - refilledAt) / 1000) * REFILL_PER_SECOND);
        refilledAt = now;

        if (tokens >= 1) {
            tokens -= 1;
            return next();
        }
        if (now - lastErrorAt >= ERROR_INTERVAL_MS) {
            lastErrorAt = now;
            socket.emit("builder_error", { code: "RATE_LIMITED", message: "Whoa, that's a lot at once! Give it a second and try again." });
        }
    });
}
