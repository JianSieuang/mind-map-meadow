import { localDateKey } from "./timezone.js";

export const ON_TIME_BONUS = 20;

// dueDate is a "YYYY-MM-DD" string; on time means completed on or before that day in the user's timezone.
export function computeTaskReward(estimatedMinutes, dueDate, completedAt = new Date(), timeZone = "UTC") {
    const minutes = Number(estimatedMinutes) || 30;
    const baseCoins = Math.max(10, Math.round(minutes * 1.5));

    const isOnTime = !dueDate || localDateKey(completedAt, timeZone) <= String(dueDate).slice(0, 10);

    const bonusCoins = isOnTime ? ON_TIME_BONUS : 0;
    return { baseCoins, bonusCoins, totalCoins: baseCoins + bonusCoins, isOnTime };
}

export function applyLevelUp(level, xp) {
    let newLevel = level;
    let newXp = xp;
    let threshold = newLevel * 100;
    while (newXp >= threshold) {
        newXp -= threshold;
        newLevel += 1;
        threshold = newLevel * 100;
    }
    return { level: newLevel, xp: newXp };
}
