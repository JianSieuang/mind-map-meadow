import { localDateKey, dueDateKey } from "./dates";

export function isTaskOverdue(dueDate) {
    const key = dueDateKey(dueDate);
    return key !== "" && key < localDateKey();
}

// Live preview only. The server decides what actually gets paid.
// Flat coins for the first few tasks of the day, then none; effort and deadlines don't change it.
export function taskRewardPreview(builder) {
    const coins = builder?.rules?.TASK_COINS;
    const paid = builder?.today_counts?.tasksPaid ?? 0;
    const cap = builder?.today_counts?.tasksPaidCap ?? builder?.rules?.TASK_COINS_PER_DAY;
    if (coins == null || cap == null) return { coins: null, label: "", chip: "" };
    if (paid >= cap) return { coins: 0, label: `${cap}/${cap} paid today, still builds your town`, chip: "" };
    return { coins, label: `${coins} coins · ${paid}/${cap} paid today`, chip: String(coins) };
}

// One-off tasks build the line of their category; unknown categories build coding.
export function lineForCategory(category) {
    const line = String(category || "").toLowerCase();
    return line === "fitness" || line === "finance" ? line : "coding";
}
