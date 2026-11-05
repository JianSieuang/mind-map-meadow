// Town level: the smallest L with xp < 5*L*(L+1). TL2@10, TL3@30, TL4@60, TL5@100 ...
export function townLevel(xp) {
    const value = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    while (value >= 5 * level * (level + 1)) level += 1;
    return level;
}

// XP at which `level` starts, and XP at which the next level starts.
export function xpBounds(level) {
    return { xpForThis: 5 * (level - 1) * level, xpForNext: 5 * level * (level + 1) };
}
