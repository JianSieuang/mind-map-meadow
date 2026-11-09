// The dashboard pages each have their own address, so the back button, refresh and bookmarks
// work. "/" is the meadow. Keep in step with APP_PATHS in server.js.
export const PAGE_PATHS = { goals: "/tasks", calendar: "/calendar", daily: "/daily-tasks", money: "/money" };

export function pageFromPath(pathname) {
    const clean = pathname.replace(/\/+$/, "") || "/";
    const hit = Object.entries(PAGE_PATHS).find(([, p]) => p === clean);
    return hit ? hit[0] : null;
}

export function pathForPage(page) {
    return page ? PAGE_PATHS[page] : "/";
}

// A friend's meadow: /visit/<their user id>. Read-only; the server checks you're friends.
export function visitIdFromPath(pathname) {
    const m = /^\/visit\/(\d{1,9})\/?$/.exec(pathname);
    return m ? Number(m[1]) : null;
}

export function pathForVisit(friendId) {
    return `/visit/${friendId}`;
}
