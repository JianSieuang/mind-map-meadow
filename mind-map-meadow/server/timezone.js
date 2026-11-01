export function isValidTimeZone(timeZone) {
    if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

// "YYYY-MM-DD" for the given instant as seen in `timeZone` (en-CA formats dates in that order).
export function localDateKey(date, timeZone = "UTC") {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 0=Sunday..6=Saturday, matching recurring_tasks.days_of_week
export function localDayOfWeek(date, timeZone = "UTC") {
    return WEEKDAYS.indexOf(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date));
}

// Strict "YYYY-MM-DD" check: rejects impossible dates like 2026-02-31 that Date.parse accepts.
export function isRealDate(str) {
    if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [year, month, day] = str.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Shifts a "YYYY-MM-DD" key by `days` (negative = earlier), staying in calendar-date space.
export function addDaysToDateKey(dateKey, days) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
