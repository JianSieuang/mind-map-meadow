import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Sprites";
import { CLOSE_BTN_CLASS, INPUT_CLASS, PANEL_CLASS, SEGMENT_GROUP_CLASS, btn, chip, segment } from "./hudStyles";
import { CATEGORIES, DIRECTIONS, parseAmountToCents, formatCents, subcategoryNames } from "../utils/money";

export default function QuickAddMoney({ isOpen, onClose, onSubmit, savingsGoals, onStartSavingsGoal }) {
    const [direction, setDirection] = useState("expense");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState(CATEGORIES.expense[0]);
    const [subcategory, setSubcategory] = useState(null);
    const [note, setNote] = useState("");
    const [goalId, setGoalId] = useState(null);
    const amountRef = useRef(null);

    const activeGoals = (savingsGoals || []).filter((g) => g.status === "active");

    useEffect(() => {
        if (!isOpen) return;
        setDirection("expense");
        setAmount("");
        setCategory(CATEGORIES.expense[0]);
        setSubcategory(null);
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

    const pickCategory = (c) => {
        setCategory(c);
        setSubcategory(null);
    };
    const subcategories = direction === "saving" ? [] : subcategoryNames(direction, category);

    const switchDirection = (key) => {
        setDirection(key);
        pickCategory(CATEGORIES[key][0]);
    };

    const submit = () => {
        if (!canSubmit) return;
        onSubmit({
            amountCents,
            direction,
            category,
            subcategory: subcategory || undefined,
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

    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-end pb-24 z-50" onMouseDown={onClose}>
            <div className={`w-[360px] max-w-[calc(100vw-2rem)] p-3 flex flex-col gap-2.5 ${PANEL_CLASS}`} onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
                <div className="flex justify-between items-center">
                    <h3 className="font-pixel text-lg leading-none flex items-center gap-2">
                        <Icon name="log" /> Quick log
                    </h3>
                    <button onClick={onClose} aria-label="Close" className={CLOSE_BTN_CLASS}>
                        &times;
                    </button>
                </div>

                <div className={`${SEGMENT_GROUP_CLASS} grid-cols-3`}>
                    {DIRECTIONS.map((d) => (
                        <button key={d.key} onClick={() => switchDirection(d.key)} aria-pressed={direction === d.key} className={segment(direction === d.key)}>
                            {d.label}
                        </button>
                    ))}
                </div>

                <input
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className={`${INPUT_CLASS} font-pixel !text-3xl text-center !py-1.5`}
                />

                {direction !== "saving" ? (
                    <>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
                            {CATEGORIES[direction].map((c) => (
                                <button key={c} onClick={() => pickCategory(c)} aria-pressed={category === c} className={chip(category === c)}>
                                    {c}
                                </button>
                            ))}
                        </div>
                        {subcategories.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pl-2 border-l-2 border-[#cfa877]" role="group" aria-label={`${category}, more detail (optional)`}>
                                {subcategories.map((sc) => (
                                    <button key={sc} onClick={() => setSubcategory(subcategory === sc ? null : sc)} aria-pressed={subcategory === sc} className={chip(subcategory === sc, "!font-semibold")}>
                                        {sc}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                ) : activeGoals.length === 0 ? (
                    <div className="flex items-center justify-between gap-2 text-xs bg-[#f4efe6] border-2 border-[#cfa877] rounded-sm px-2 py-1.5">
                        <span>Saving needs a goal to save toward.</span>
                        {onStartSavingsGoal && (
                            <button onClick={onStartSavingsGoal} className={btn("next", "shrink-0")}>
                                Start a savings goal
                            </button>
                        )}
                    </div>
                ) : (
                    <select value={goalId ?? ""} onChange={(e) => setGoalId(Number(e.target.value))} aria-label="Savings goal" className={INPUT_CLASS}>
                        {activeGoals.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.title} ({formatCents(g.saved_cents)} / {formatCents(g.target_cents)})
                            </option>
                        ))}
                    </select>
                )}

                <input type="text" maxLength={140} placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />

                <button onClick={submit} disabled={!canSubmit} className={btn("confirm")}>
                    Log it
                </button>
            </div>
        </div>
    );
}
