export const DURATION_UNITS = [
    { value: "hours", label: "Hour(s)" },
    { value: "days", label: "Day(s)" },
];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function minutesFromDuration(amount, unit) {
    const n = Math.max(1, Number(amount) || 1);
    return unit === "days" ? n * 24 * 60 : n * 60;
}

// Hour-scale tasks are due today; day-scale tasks are due N days out.
// Keeps "1-2 hrs" reading as "finish today" rather than crossing midnight edge cases.
export function dueDateFromDuration(amount, unit) {
    const n = Math.max(1, Number(amount) || 1);
    const due = new Date();
    if (unit === "days") due.setDate(due.getDate() + n);
    return due.toISOString().slice(0, 10);
}

// Best-effort reverse mapping for editing an existing task that only has estimated_minutes stored.
export function durationFromMinutes(minutes) {
    const n = Number(minutes) || 60;
    if (n >= 24 * 60 && n % (24 * 60) === 0) {
        return { amount: n / (24 * 60), unit: "days" };
    }
    return { amount: Math.max(1, Math.round(n / 60)), unit: "hours" };
}

// Daily-task time block helpers — habits are scheduled as "start–end", not a raw duration.
export function minutesFromTimeRange(startTime, endTime) {
    const [sh, sm] = (startTime || "07:00").split(":").map(Number);
    const [eh, em] = (endTime || "08:00").split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60; // crosses midnight
    return endMinutes - startMinutes;
}

export function formatTimeRange(startTime, endTime) {
    const format = (time) => {
        const [h, m] = (time || "00:00").split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
    };
    return `${format(startTime)} - ${format(endTime)}`;
}
