import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Sprites";
import { CLOSE_BTN_CLASS, INPUT_CLASS, LABEL_CLASS, PANEL_CLASS, SEGMENT_GROUP_CLASS, btn, segment } from "./hudStyles";
import { CATEGORIES, DIRECTIONS, categoryLabel, parseAmountToCents, formatCents, subcategoryNames } from "../utils/money";

// Most categories sit in the first two rows; the rest wait behind "More" so the box stays short.
const SHOWN_CATEGORIES = 7;

// One equal-sized tile: a calm grid instead of a ragged wrap of chips.
const tile = (active) =>
    `min-h-11 lg:min-h-9 px-1 rounded-sm border-2 text-xs font-bold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f9a] ${
        active ? "bg-[#6b3f22] border-[#2b1e1a] text-[#f6e6c8]" : "bg-[#f4efe6] border-[#cfa877] text-[#2b1e1a] hover:border-[#2b1e1a]"
    }`;

// Small text-only pills for the optional detail and the recent shortcuts.
const pill = (active) =>
    `shrink-0 min-h-9 lg:min-h-7 px-2.5 rounded-full border-2 text-xs font-semibold whitespace-nowrap transition-colors ${
        active ? "bg-[#6b3f22] border-[#6b3f22] text-[#f6e6c8]" : "bg-transparent border-[#cfa877] text-[#6b3f22] hover:border-[#6b3f22]"
    }`;

// The last few distinct category + detail pairs you logged, newest first: most logs are repeats.
function recentPicks(transactions, direction) {
    const seen = new Set();
    const picks = [];
    for (const t of transactions || []) {
        if (t.direction !== direction) continue;
        const key = `${t.category}|${t.subcategory || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picks.push({ category: t.category, subcategory: t.subcategory || null });
        if (picks.length === 3) break;
    }
    return picks;
}

export default function QuickAddMoney({ isOpen, onClose, onSubmit, savingsGoals, transactions, onStartSavingsGoal }) {
    const [direction, setDirection] = useState("expense");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState(CATEGORIES.expense[0]);
    const [subcategory, setSubcategory] = useState(null);
    const [showAll, setShowAll] = useState(false);
    const [note, setNote] = useState("");
    const [goalId, setGoalId] = useState(null);
    const amountRef = useRef(null);

    const activeGoals = (savingsGoals || []).filter((g) => g.status === "active");
    const recent = useMemo(() => recentPicks(transactions, direction), [transactions, direction]);

    useEffect(() => {
        if (!isOpen) return;
        setDirection("expense");
        setAmount("");
        setCategory(CATEGORIES.expense[0]);
        setSubcategory(null);
        setShowAll(false);
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

    const all = CATEGORIES[direction];
    const hasMore = all.length > SHOWN_CATEGORIES + 1;
    // A chosen category from behind "More" stays visible after the list folds again.
    const shown = !hasMore || showAll ? all : all.slice(0, SHOWN_CATEGORIES).concat(all.slice(SHOWN_CATEGORIES).includes(category) ? [category] : []);
    const subcategories = needsGoal ? [] : subcategoryNames(direction, category);

    const pick = (c, sc = null) => {
        setCategory(c);
        setSubcategory(sc);
    };

    const switchDirection = (key) => {
        setDirection(key);
        setShowAll(false);
        pick(CATEGORIES[key][0]);
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

                {!needsGoal ? (
                    <>
                        {recent.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Recent">
                                <span className={`${LABEL_CLASS} shrink-0`}>Recent</span>
                                {recent.map((r) => (
                                    <button key={`${r.category}|${r.subcategory}`} onClick={() => pick(r.category, r.subcategory)} aria-pressed={category === r.category && subcategory === r.subcategory} className={pill(category === r.category && subcategory === r.subcategory)}>
                                        {categoryLabel(r)}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Category">
                            {shown.map((c) => (
                                <button key={c} onClick={() => pick(c)} aria-pressed={category === c} className={tile(category === c)}>
                                    {c}
                                </button>
                            ))}
                            {hasMore && (
                                <button onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className={`${tile(false)} !border-dashed !text-[#6b3f22]`}>
                                    {showAll ? "Less" : "More…"}
                                </button>
                            )}
                        </div>

                        {subcategories.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label={`${category} detail, optional`}>
                                {subcategories.map((sc) => (
                                    <button key={sc} onClick={() => setSubcategory(subcategory === sc ? null : sc)} aria-pressed={subcategory === sc} className={pill(subcategory === sc)}>
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
