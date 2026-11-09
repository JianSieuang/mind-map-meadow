import React, { useEffect, useRef, useState } from "react";
import { DeleteButton } from "../components/TaskRow";
import { BuildingThumb, Icon, PixelBar } from "../components/Sprites";
import { INPUT_CLASS, MUTED_TEXT_CLASS, PANEL_CLASS, btn } from "../components/hudStyles";
import { MIN_SAVINGS_TARGET_CENTS, categoryLabel, formatCents, parseAmountToCents, weeklySummary, goalPercent } from "../utils/money";

const MAX_ACTIVE_GOALS = 5;
const SUBMIT_WAIT_MS = 6000;
// The last "new savings goal" request already acted on, so coming back to this page later
// doesn't reopen the form.
let handledGoalRequest = null;

const SECTION_HEADING_CLASS = "font-pixel text-lg leading-none text-[#f6e6c8]";
const EMPTY_TEXT_CLASS = "text-xs text-[#e8c99a]";

function SummaryCard({ label, value, tone }) {
    return (
        <div className={`px-3 py-2 flex-1 min-w-[140px] ${PANEL_CLASS}`}>
            <p className={MUTED_TEXT_CLASS}>{label}</p>
            <p className={`font-pixel text-xl leading-tight ${tone}`}>{value}</p>
        </div>
    );
}

// The form stays open with what you typed until the new goal is really in the list, so a
// refused one (the daily cap, say) doesn't lose your input.
function SavingsGoalForm({ savingsGoals, onSubmit, onCancel }) {
    const [title, setTitle] = useState("");
    const [target, setTarget] = useState("");
    const [deadline, setDeadline] = useState("");
    const [waiting, setWaiting] = useState(false);
    const countAtSubmit = useRef(null);
    const waitTimer = useRef(null);

    useEffect(() => () => clearTimeout(waitTimer.current), []);

    useEffect(() => {
        if (countAtSubmit.current != null && savingsGoals.length > countAtSubmit.current) onCancel();
    }, [savingsGoals.length, onCancel]);

    const targetCents = parseAmountToCents(target);
    const belowMinimum = targetCents !== null && targetCents < MIN_SAVINGS_TARGET_CENTS;
    const canSubmit = title.trim().length > 0 && targetCents !== null && !belowMinimum && !waiting;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        countAtSubmit.current = savingsGoals.length;
        setWaiting(true);
        clearTimeout(waitTimer.current);
        waitTimer.current = setTimeout(() => setWaiting(false), SUBMIT_WAIT_MS);
        onSubmit({ title: title.trim().slice(0, 80), targetCents, deadline: deadline || null });
    };

    return (
        <form onSubmit={handleSubmit} className={`p-3 flex flex-col gap-2 ${PANEL_CLASS}`}>
            <input autoFocus type="text" maxLength={80} placeholder="What are you saving for? (e.g. New laptop)" aria-label="Savings goal name" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    inputMode="decimal"
                    placeholder={`Target (at least ${formatCents(MIN_SAVINGS_TARGET_CENTS)})`}
                    aria-label="Target amount"
                    value={target}
                    onChange={(e) => setTarget(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className={`${INPUT_CLASS} !w-auto flex-1 min-w-[160px]`}
                />
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${INPUT_CLASS} !w-auto`} title="Deadline (optional)" aria-label="Deadline (optional)" />
            </div>
            {belowMinimum && <p className="text-xs font-semibold text-[#9c2f2b]">Savings goals start at {formatCents(MIN_SAVINGS_TARGET_CENTS)}.</p>}
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={onCancel} className={btn("muted")}>
                    Cancel
                </button>
                <button type="submit" disabled={!canSubmit} className={btn("confirm")}>
                    {waiting ? "Breaking ground..." : "Start construction"}
                </button>
            </div>
        </form>
    );
}

function signedAmount(t) {
    if (t.direction === "expense") return { text: `−${formatCents(t.amount_cents)}`, tone: "text-[#9c2f2b]" };
    if (t.direction === "income") return { text: `+${formatCents(t.amount_cents)}`, tone: "text-[#3f7a3a]" };
    return { text: `→${formatCents(t.amount_cents)}`, tone: "text-[#2f6f9a]" };
}

function SavingsGoalCard({ goal, onDelete }) {
    const pct = goalPercent(goal);
    const done = goal.status === "completed";
    return (
        <div className={`p-3 flex flex-col gap-2 ${PANEL_CLASS}`}>
            <div className="flex items-start gap-2.5">
                <BuildingThumb assetKey={`savings_project_${goal.stage ?? 0}`} size={44} />
                <div className="min-w-0 flex-1">
                    <p className="font-pixel text-base leading-tight truncate">{goal.title}</p>
                    <p className={MUTED_TEXT_CLASS}>
                        Stage {goal.stage}/4 · {done ? "Completed" : "Under construction"}
                        {goal.deadline ? ` · by ${String(goal.deadline).slice(0, 10)}` : ""}
                    </p>
                </div>
                <DeleteButton onDelete={onDelete} />
            </div>
            <PixelBar pct={pct} tone={done ? "gold" : "blue"} />
            <p className="text-xs">
                <span className="font-pixel text-sm">{formatCents(goal.saved_cents)}</span> / <span className="font-pixel text-sm">{formatCents(goal.target_cents)}</span> <span className="text-[#6b3f22]">({pct}%)</span>
            </p>
        </div>
    );
}

export default function MoneyPage({ transactions, savingsGoals, onAddSavingsGoal, onDeleteSavingsGoal, onDeleteTransaction, onOpenQuickAdd, newGoalRequest }) {
    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const goalSectionRef = useRef(null);

    // Sent here from the Quick log's "Start a savings goal": open the form and show it.
    useEffect(() => {
        if (newGoalRequest == null || newGoalRequest === handledGoalRequest) return;
        handledGoalRequest = newGoalRequest;
        setIsAddingGoal(true);
        goalSectionRef.current?.scrollIntoView({ block: "start" });
    }, [newGoalRequest]);
    const closeGoalForm = useRef(() => setIsAddingGoal(false)).current;

    const summary = weeklySummary(transactions);
    const netCents = summary.incomeCents - summary.spentCents;
    const categoryRows = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    const maxCategory = categoryRows.length ? categoryRows[0][1] : 0;

    const goalTitleById = Object.fromEntries(savingsGoals.map((g) => [g.id, g.title]));
    const activeGoalCount = savingsGoals.filter((g) => g.status === "active").length;
    const recent = transactions.slice(0, 50);

    return (
        <div className="max-w-3xl w-full mx-auto flex flex-col gap-6">
            {onOpenQuickAdd && (
                <button onClick={onOpenQuickAdd} className={btn("next", "sm:self-start")}>
                    <Icon name="log" /> Quick log
                </button>
            )}

            {/* This week */}
            <section className="flex flex-col gap-2.5">
                <h3 className={SECTION_HEADING_CLASS}>This week</h3>
                <div className="flex flex-wrap gap-2.5">
                    <SummaryCard label="Spent" value={formatCents(summary.spentCents)} tone="text-[#9c2f2b]" />
                    <SummaryCard label="Income" value={formatCents(summary.incomeCents)} tone="text-[#3f7a3a]" />
                    <SummaryCard label="Income − spent" value={`${netCents < 0 ? "−" : ""}${formatCents(Math.abs(netCents))}`} tone={netCents < 0 ? "text-[#9c2f2b]" : "text-[#3f7a3a]"} />
                    <SummaryCard label="Put into savings" value={formatCents(summary.savedCents)} tone="text-[#2f6f9a]" />
                </div>
                {categoryRows.length > 0 ? (
                    <div className={`p-3 flex flex-col gap-2 ${PANEL_CLASS}`}>
                        {categoryRows.map(([category, cents]) => (
                            <div key={category} className="flex items-center gap-2 text-xs">
                                <span className="w-24 shrink-0 truncate">{category}</span>
                                <PixelBar pct={maxCategory ? (cents / maxCategory) * 100 : 0} tone="red" className="flex-1" />
                                <span className="font-pixel text-sm leading-none w-20 text-right">{formatCents(cents)}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className={EMPTY_TEXT_CLASS}>No spending logged this week yet. Every log earns coins, whatever the amount.</p>
                )}
            </section>

            {/* Savings goals */}
            <section ref={goalSectionRef} className="flex flex-col gap-2.5 scroll-mt-4">
                <div className="flex justify-between items-center gap-2">
                    <h3 className={SECTION_HEADING_CLASS}>Savings goals</h3>
                    {!isAddingGoal && (
                        <button onClick={() => setIsAddingGoal(true)} disabled={activeGoalCount >= MAX_ACTIVE_GOALS} title={activeGoalCount >= MAX_ACTIVE_GOALS ? `Up to ${MAX_ACTIVE_GOALS} active savings goals` : undefined} className={btn("muted")}>
                            New savings goal
                        </button>
                    )}
                </div>

                {isAddingGoal && <SavingsGoalForm savingsGoals={savingsGoals} onSubmit={onAddSavingsGoal} onCancel={closeGoalForm} />}

                {savingsGoals.length === 0 && !isAddingGoal && <p className={EMPTY_TEXT_CLASS}>No savings goals yet. Start one and a construction site appears in your meadow. It grows at every 25% you save.</p>}

                {savingsGoals.map((goal) => (
                    <SavingsGoalCard key={goal.id} goal={goal} onDelete={() => onDeleteSavingsGoal(goal.id)} />
                ))}
            </section>

            {/* Recent transactions */}
            <section className="flex flex-col gap-2.5">
                <h3 className={SECTION_HEADING_CLASS}>Recent logs</h3>
                {recent.length === 0 ? (
                    <p className={EMPTY_TEXT_CLASS}>Nothing logged yet. Tap Log in the meadow. It takes five seconds.</p>
                ) : (
                    <div className={`px-3 py-1 flex flex-col ${PANEL_CLASS}`}>
                        {recent.map((t) => {
                            const amount = signedAmount(t);
                            const label = t.direction === "saving" ? goalTitleById[t.savings_goal_id] || "Savings" : categoryLabel(t);
                            return (
                                <div key={t.id} className="flex items-center gap-2.5 py-1.5 text-xs border-b-2 border-[#e8c99a] last:border-b-0">
                                    <span className="hidden sm:block w-20 shrink-0 text-[#6b3f22]">{String(t.occurred_on).slice(0, 10)}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate">{label}</p>
                                        {t.note && <p className="text-[#6b3f22] truncate">{t.note}</p>}
                                    </div>
                                    <span className={`font-pixel text-sm leading-none ${amount.tone}`}>{amount.text}</span>
                                    <DeleteButton onDelete={() => onDeleteTransaction(t.id)} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
