import React, { useState } from "react";
import { categoryIcon, formatCents, parseAmountToCents, weeklySummary, goalPercent } from "../utils/money";

const MAX_ACTIVE_GOALS = 5;

function SummaryCard({ label, value, tone }) {
    return (
        <div className="bg-[#2a2a35] border border-slate-700 rounded-xl px-4 py-3 flex-1 min-w-[140px]">
            <p className="text-[11px] text-slate-400">{label}</p>
            <p className={`text-lg font-bold ${tone}`}>{value}</p>
        </div>
    );
}

function GoalForm({ onSubmit, onCancel }) {
    const [title, setTitle] = useState("");
    const [target, setTarget] = useState("");
    const [deadline, setDeadline] = useState("");

    const targetCents = parseAmountToCents(target);
    const canSubmit = title.trim().length > 0 && targetCents !== null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit({ title: title.trim().slice(0, 80), targetCents, deadline: deadline || null });
    };

    return (
        <form onSubmit={handleSubmit} className="bg-[#2a2a35] border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
            <input
                autoFocus
                type="text"
                maxLength={80}
                placeholder="What are you saving for? (e.g. New laptop)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Target amount"
                    value={target}
                    onChange={(e) => setTarget(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className="flex-1 bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400"
                />
                <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400 text-slate-300"
                    title="Deadline (optional)"
                />
            </div>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                >
                    Start Construction 🏗️
                </button>
            </div>
        </form>
    );
}

function signedAmount(t) {
    if (t.direction === "expense") return { text: `−${formatCents(t.amount_cents)}`, tone: "text-rose-400" };
    if (t.direction === "income") return { text: `+${formatCents(t.amount_cents)}`, tone: "text-emerald-400" };
    return { text: `→${formatCents(t.amount_cents)}`, tone: "text-sky-400" };
}

export default function MoneyPage({ transactions, savingsGoals, onAddSavingsGoal, onDeleteSavingsGoal, onDeleteTransaction, onOpenQuickAdd }) {
    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState(null);
    const [confirmDeleteTxId, setConfirmDeleteTxId] = useState(null);

    const summary = weeklySummary(transactions);
    const netCents = summary.incomeCents - summary.spentCents;
    const categoryRows = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    const maxCategory = categoryRows.length ? categoryRows[0][1] : 0;

    const goalTitleById = Object.fromEntries(savingsGoals.map((g) => [g.id, g.title]));
    const activeGoalCount = savingsGoals.filter((g) => g.status === "active").length;
    const recent = transactions.slice(0, 50);

    return (
        <div className="max-w-3xl flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">💰 Money</h2>
                {onOpenQuickAdd && (
                    <button onClick={onOpenQuickAdd} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                        💸 Quick Log
                    </button>
                )}
            </div>

            {/* This week */}
            <section className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-slate-200">This week</h3>
                <div className="flex flex-wrap gap-3">
                    <SummaryCard label="Spent" value={formatCents(summary.spentCents)} tone="text-rose-400" />
                    <SummaryCard label="Income" value={formatCents(summary.incomeCents)} tone="text-emerald-400" />
                    <SummaryCard label="Income − spent" value={`${netCents < 0 ? "−" : ""}${formatCents(Math.abs(netCents))}`} tone={netCents < 0 ? "text-rose-300" : "text-emerald-300"} />
                    <SummaryCard label="Put into savings" value={formatCents(summary.savedCents)} tone="text-sky-400" />
                </div>
                {categoryRows.length > 0 ? (
                    <div className="bg-[#2a2a35] border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
                        {categoryRows.map(([category, cents]) => (
                            <div key={category} className="flex items-center gap-2 text-xs">
                                <span className="w-28 shrink-0 text-slate-300">
                                    {categoryIcon("expense", category)} {category}
                                </span>
                                <div className="flex-1 h-2 bg-[#1e1e24] rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500/80 rounded-full" style={{ width: `${maxCategory ? (cents / maxCategory) * 100 : 0}%` }} />
                                </div>
                                <span className="w-24 text-right text-slate-200 font-semibold">{formatCents(cents)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-slate-500">No spending logged this week yet. Every log earns coins — honest logs count, big or small.</p>
                )}
            </section>

            {/* Savings goals */}
            <section className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200">🏗️ Savings goals</h3>
                    {!isAddingGoal && (
                        <button
                            onClick={() => setIsAddingGoal(true)}
                            disabled={activeGoalCount >= MAX_ACTIVE_GOALS}
                            title={activeGoalCount >= MAX_ACTIVE_GOALS ? `Up to ${MAX_ACTIVE_GOALS} active goals` : undefined}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                        >
                            + New goal
                        </button>
                    )}
                </div>

                {isAddingGoal && (
                    <GoalForm
                        onSubmit={(values) => {
                            onAddSavingsGoal(values);
                            setIsAddingGoal(false);
                        }}
                        onCancel={() => setIsAddingGoal(false)}
                    />
                )}

                {savingsGoals.length === 0 && !isAddingGoal && (
                    <p className="text-xs text-slate-500">No savings goals yet. Start one and a construction site appears in your meadow — it grows at every 25% you save.</p>
                )}

                {savingsGoals.map((goal) => {
                    const pct = goalPercent(goal);
                    const done = goal.status === "completed";
                    return (
                        <div key={goal.id} className="bg-[#2a2a35] border border-slate-700 rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <p className="text-sm font-bold">
                                        {done ? "🏛️" : "🏗️"} {goal.title}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                        Stage {goal.stage}/4 · {done ? "Completed 🎉" : "Under construction"}
                                        {goal.deadline ? ` · by ${String(goal.deadline).slice(0, 10)}` : ""}
                                    </p>
                                </div>
                                {confirmDeleteGoalId === goal.id ? (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => {
                                                onDeleteSavingsGoal(goal.id);
                                                setConfirmDeleteGoalId(null);
                                            }}
                                            className="bg-rose-600 hover:bg-rose-500 px-2 py-1 rounded text-[11px] font-bold"
                                        >
                                            Delete
                                        </button>
                                        <button onClick={() => setConfirmDeleteGoalId(null)} className="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-[11px]">
                                            Keep
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setConfirmDeleteGoalId(goal.id)} className="text-slate-500 hover:text-rose-400 text-xs px-1" title="Delete goal">
                                        🗑️
                                    </button>
                                )}
                            </div>
                            <div className="h-2.5 bg-[#1e1e24] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${done ? "bg-amber-400" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[11px] text-slate-300">
                                {formatCents(goal.saved_cents)} / {formatCents(goal.target_cents)} <span className="text-slate-500">({pct}%)</span>
                            </p>
                        </div>
                    );
                })}
            </section>

            {/* Recent transactions */}
            <section className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-slate-200">Recent logs</h3>
                {recent.length === 0 ? (
                    <p className="text-xs text-slate-500">Nothing logged yet. Tap 💸 Log in the meadow — it takes five seconds.</p>
                ) : (
                    <div className="bg-[#2a2a35] border border-slate-700 rounded-xl divide-y divide-slate-700/60">
                        {recent.map((t) => {
                            const amount = signedAmount(t);
                            const label = t.direction === "saving" ? goalTitleById[t.savings_goal_id] || "Savings" : t.category;
                            return (
                                <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                    <span className="w-20 shrink-0 text-slate-500">{String(t.occurred_on).slice(0, 10)}</span>
                                    <span className="text-base">{categoryIcon(t.direction, t.category)}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-200 font-semibold truncate">{label}</p>
                                        {t.note && <p className="text-slate-500 truncate">{t.note}</p>}
                                    </div>
                                    <span className={`font-bold ${amount.tone}`}>{amount.text}</span>
                                    {confirmDeleteTxId === t.id ? (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => {
                                                    onDeleteTransaction(t.id);
                                                    setConfirmDeleteTxId(null);
                                                }}
                                                className="bg-rose-600 hover:bg-rose-500 px-2 py-0.5 rounded text-[11px] font-bold"
                                            >
                                                Delete
                                            </button>
                                            <button onClick={() => setConfirmDeleteTxId(null)} className="bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded text-[11px]">
                                                Keep
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setConfirmDeleteTxId(t.id)} className="text-slate-500 hover:text-rose-400 px-1" title="Delete log">
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
