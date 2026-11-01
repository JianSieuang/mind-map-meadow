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
