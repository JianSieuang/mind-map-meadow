// All "which day is it" logic uses the browser's local calendar day, never UTC
// (toISOString().slice(0, 10) is the UTC day, which is wrong for non-UTC users near midnight).

export function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// due_date arrives from the server as a plain "YYYY-MM-DD" string.
export function dueDateKey(dueDate) {
    return typeof dueDate === "string" ? dueDate.slice(0, 10) : "";
}

// completed_at is a UTC instant; convert to the local day it happened on.
export function completedDateKey(completedAt) {
    return completedAt ? localDateKey(new Date(completedAt)) : "";
}

export function browserTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}
