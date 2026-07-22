export const ON_TIME_BONUS = 20;

export function computeTaskReward(estimatedMinutes, dueDate, completedAt = new Date()) {
    const minutes = Number(estimatedMinutes) || 30;
    const baseCoins = Math.max(10, Math.round(minutes * 1.5));

    const dueEnd = new Date(dueDate);
    dueEnd.setUTCHours(23, 59, 59, 999);
    const isOnTime = completedAt <= dueEnd;

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
