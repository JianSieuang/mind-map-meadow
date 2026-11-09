// The dashboard pages each have their own address, so the back button, refresh and bookmarks
// work. "/" is the meadow. Keep in step with DASHBOARD_PATHS in server.js.
export const PAGE_PATHS = { goals: "/tasks", calendar: "/calendar", daily: "/daily-tasks", money: "/money" };

export function pageFromPath(pathname) {
    const clean = pathname.replace(/\/+$/, "") || "/";
    const hit = Object.entries(PAGE_PATHS).find(([, p]) => p === clean);
    return hit ? hit[0] : null;
}

export function pathForPage(page) {
    return page ? PAGE_PATHS[page] : "/";
}
