export const DURATION_OPTIONS = [
    { minutes: 15, label: "15 min" },
    { minutes: 30, label: "30 min" },
    { minutes: 60, label: "1 hr" },
    { minutes: 120, label: "2 hr" },
    { minutes: 240, label: "4 hr" },
];

export const ON_TIME_BONUS = 20;

export function isTaskOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
}

export function estimateTaskReward(estimatedMinutes, dueDate) {
    const minutes = Number(estimatedMinutes) || 30;
    const baseCoins = Math.max(10, Math.round(minutes * 1.5));
    const bonusCoins = isTaskOverdue(dueDate) ? 0 : ON_TIME_BONUS;
    return { baseCoins, bonusCoins, totalCoins: baseCoins + bonusCoins };
}
