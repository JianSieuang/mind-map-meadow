import React, { useEffect, useRef, useState } from "react";
import { CATEGORIES, DIRECTIONS, parseAmountToCents, formatCents } from "../utils/money";

export default function QuickAddMoney({ isOpen, onClose, onSubmit, savingsGoals }) {
    const [direction, setDirection] = useState("expense");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState(CATEGORIES.expense[0].key);
    const [note, setNote] = useState("");
    const [goalId, setGoalId] = useState(null);
    const amountRef = useRef(null);

    const activeGoals = (savingsGoals || []).filter((g) => g.status === "active");

    useEffect(() => {
        if (!isOpen) return;
        setDirection("expense");
        setAmount("");
        setCategory(CATEGORIES.expense[0].key);
        setNote("");
        setTimeout(() => amountRef.current?.focus(), 0);
    }, [isOpen]);

    useEffect(() => {
        if (direction === "saving" && !activeGoals.some((g) => g.id === goalId)) {
            setGoalId(activeGoals[0]?.id ?? null);
        }
    }, [direction, activeGoals, goalId]);

    if (!isOpen) return null;

    const amountCents = parseAmountToCents(amount);
    const needsGoal = direction === "saving";
    const canSubmit = amountCents !== null && (!needsGoal || goalId !== null);

    const switchDirection = (key) => {
        setDirection(key);
        setCategory(CATEGORIES[key][0].key);
    };

    const submit = () => {
        if (!canSubmit) return;
        onSubmit({
            amountCents,
            direction,
            category,
            note: note.trim() || undefined,
            savingsGoalId: needsGoal ? goalId : undefined,
        });
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    };

    const amountFocusClass = direction === "expense" ? "focus:border-rose-400" : direction === "income" ? "focus:border-emerald-400" : "focus:border-sky-400";

    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-end pb-24 z-50" onMouseDown={onClose}>
            <div
                className="bg-[#23232e] w-[360px] p-4 rounded-xl border border-slate-700 shadow-2xl flex flex-col gap-3 text-white"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold">💸 Quick Log</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-base px-1">
                        &times;
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-1 bg-[#1e1e24] p-1 rounded-lg">
                    {DIRECTIONS.map((d) => (
                        <button
                            key={d.key}
                            onClick={() => switchDirection(d.key)}
                            className={`py-1.5 rounded-md text-xs font-bold transition ${direction === d.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                        >
                            {d.icon} {d.label}
                        </button>
                    ))}
                </div>

                <input
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className={`w-full bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2.5 text-2xl font-bold text-center outline-none ${amountFocusClass}`}
                />

                {direction !== "saving" ? (
                    <div className="flex flex-wrap gap-1.5">
                        {CATEGORIES[direction].map((c) => (
                            <button
                                key={c.key}
                                onClick={() => setCategory(c.key)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                                    category === c.key ? "bg-indigo-600 border-indigo-400 text-white" : "border-slate-700 text-slate-300 hover:border-slate-500"
                                }`}
                            >
                                {c.icon} {c.key}
                            </button>
                        ))}
                    </div>
                ) : activeGoals.length === 0 ? (
                    <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">Create a savings goal first (Goals → 💰 Money).</p>
                ) : (
                    <select
                        value={goalId ?? ""}
                        onChange={(e) => setGoalId(Number(e.target.value))}
                        className="w-full bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-sky-400"
                    >
                        {activeGoals.map((g) => (
                            <option key={g.id} value={g.id}>
                                🏗️ {g.title} ({formatCents(g.saved_cents)} / {formatCents(g.target_cents)})
                            </option>
                        ))}
                    </select>
                )}

                <input
                    type="text"
                    maxLength={140}
                    placeholder="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-400"
                />

                <button
                    onClick={submit}
                    disabled={!canSubmit}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2 rounded-lg text-xs transition"
                >
                    Log it ↵
                </button>
            </div>
        </div>
    );
}
