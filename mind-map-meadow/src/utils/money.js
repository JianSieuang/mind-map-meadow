import { localDateKey } from "./dates";

export const DIRECTIONS = [
    { key: "expense", label: "Expense", icon: "💸" },
    { key: "income", label: "Income", icon: "💵" },
    { key: "saving", label: "Save", icon: "🏦" },
];

export const CATEGORIES = {
    expense: [
        { key: "Food", icon: "🍜" },
        { key: "Transport", icon: "🚌" },
        { key: "Shopping", icon: "🛍️" },
        { key: "Bills", icon: "🧾" },
        { key: "Fun", icon: "🎮" },
        { key: "Health", icon: "💊" },
        { key: "Other", icon: "📦" },
    ],
    income: [
        { key: "Salary", icon: "💼" },
        { key: "Side Income", icon: "🛠️" },
        { key: "Gift", icon: "🎁" },
        { key: "Other", icon: "📦" },
    ],
    saving: [{ key: "Savings", icon: "🏦" }],
};

export function categoryIcon(direction, category) {
    const match = (CATEGORIES[direction] || []).find((c) => c.key === category);
    return match ? match.icon : "📦";
}

export const MAX_AMOUNT_CENTS = 100_000_000; // 1,000,000.00

export function parseAmountToCents(input) {
    const value = Number(String(input ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(value) || value <= 0) return null;
    const cents = Math.round(value * 100);
    if (cents <= 0 || cents > MAX_AMOUNT_CENTS) return null;
    return cents;
}

export function formatCents(cents) {
    return ((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Monday of the current local week, as "YYYY-MM-DD".
export function startOfWeekKey(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysSinceMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - daysSinceMonday);
    return localDateKey(d);
}

export function isInCurrentWeek(occurredOn, now = new Date()) {
    const key = typeof occurredOn === "string" ? occurredOn.slice(0, 10) : "";
    return key !== "" && key >= startOfWeekKey(now) && key <= localDateKey(now);
}

export function weeklySummary(transactions, now = new Date()) {
    const summary = { spentCents: 0, incomeCents: 0, savedCents: 0, byCategory: {} };
    for (const t of transactions) {
        if (!isInCurrentWeek(t.occurred_on, now)) continue;
        const amount = Number(t.amount_cents) || 0;
        if (t.direction === "expense") {
            summary.spentCents += amount;
            summary.byCategory[t.category] = (summary.byCategory[t.category] || 0) + amount;
        } else if (t.direction === "income") {
            summary.incomeCents += amount;
        } else if (t.direction === "saving") {
            summary.savedCents += amount;
        }
    }
    return summary;
}

export function goalPercent(goal) {
    const target = Number(goal.target_cents) || 0;
    if (target <= 0) return 0;
    return Math.min(100, Math.round(((Number(goal.saved_cents) || 0) / target) * 100));
}
