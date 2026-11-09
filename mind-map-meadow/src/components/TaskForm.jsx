import React, { useState } from "react";
import { BuildingThumb, Coin, Glyph } from "./Sprites";
import { INPUT_CLASS, LABEL_CLASS, MUTED_TEXT_CLASS, btn } from "./hudStyles";
import { lineForCategory } from "../utils/rewards";
import { lineBuildingName } from "../utils/builder";
import { localDateKey } from "../utils/dates";
import { TASK_CATEGORIES, TASK_IDEAS, taskCategoryLabel } from "../utils/taskCategories";
import { DURATION_UNITS, minutesFromDuration, dueDateFromDuration, durationFromMinutes, formatMinutes } from "../utils/duration";

export { TASK_CATEGORIES };

// Equal tiles; on the task form each one shows the building its category makes, which is the
// real difference between them.
export function CategoryPicker({ value, onChange, showBuildings = false }) {
    return (
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Category">
            {TASK_CATEGORIES.map((category) => {
                const active = value === category;
                return (
                    <button
                        key={category}
                        type="button"
                        onClick={() => onChange(category)}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-1.5 min-h-11 px-1.5 py-1 rounded-sm border-2 text-xs font-bold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f9a] ${
                            active ? "bg-[#6b3f22] border-[#2b1e1a] text-[#f6e6c8]" : "bg-[#f4efe6] border-[#cfa877] text-[#2b1e1a] hover:border-[#2b1e1a]"
                        }`}
                    >
                        {showBuildings && <BuildingThumb assetKey={`${lineForCategory(category)}_1`} size={28} />}
                        <span className="text-left">{taskCategoryLabel(category)}</span>
                    </button>
                );
            })}
        </div>
    );
}

// While the title is empty: one row of ready-made tasks for the chosen category. Tap fills it in.
function TaskIdeas({ category, onPick }) {
    const ideas = TASK_IDEAS[category]?.ideas;
    if (!ideas) return null;
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Ideas">
            <span className={`${LABEL_CLASS} shrink-0`}>Try</span>
            {ideas.map((idea) => (
                <button
                    key={idea}
                    type="button"
                    onClick={() => onPick(idea)}
                    className="shrink-0 min-h-9 lg:min-h-7 px-2.5 rounded-full border-2 border-[#cfa877] text-xs font-semibold text-[#6b3f22] whitespace-nowrap hover:border-[#6b3f22] transition-colors"
                >
                    {idea}
                </button>
            ))}
        </div>
    );
}

export function RewardPreview({ rewardPreview, line, text }) {
    if (!rewardPreview?.label) return null;
    return (
        <div className="flex items-center gap-2 bg-[#f4efe6] border-2 border-[#cfa877] rounded-sm px-2 py-1.5">
            <BuildingThumb assetKey={`${line}_1`} size={40} />
            <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-xs font-bold flex items-center gap-1">
                    <Coin /> {rewardPreview.label}
                </span>
                <span className={MUTED_TEXT_CLASS}>{text}</span>
            </div>
        </div>
    );
}

// Title and category are all a task needs, so the rest waits behind "More".
export default function TaskForm({ initialValues, onSubmit, onCancel, submitLabel = "Save", rewardPreview, rules }) {
    const initialDuration = initialValues?.estimated_minutes ? durationFromMinutes(initialValues.estimated_minutes) : { amount: 1, unit: "hours" };

    const [title, setTitle] = useState(initialValues?.title || "");
    const [category, setCategory] = useState(initialValues?.category || "Coding");
    const [durationAmount, setDurationAmount] = useState(initialDuration.amount);
    const [durationUnit, setDurationUnit] = useState(initialDuration.unit);
    const [date, setDate] = useState(initialValues?.due_date || dueDateFromDuration(initialDuration.amount, initialDuration.unit));
    const [dateManuallySet, setDateManuallySet] = useState(!!initialValues?.due_date);
    const [showMore, setShowMore] = useState(false);

    const estimatedMinutes = minutesFromDuration(durationAmount, durationUnit);
    const line = lineForCategory(category);

    const handleDurationChange = (amount, unit) => {
        setDurationAmount(amount);
        setDurationUnit(unit);
        if (!dateManuallySet) setDate(dueDateFromDuration(amount, unit));
    };

    const handleDateChange = (value) => {
        setDate(value);
        setDateManuallySet(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ title, category, date, estimatedMinutes });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <input
                id="task-title"
                type="text"
                aria-label="Task"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={TASK_IDEAS[category]?.placeholder || "What will you do?"}
                required
                autoFocus={!initialValues?.title}
                className={INPUT_CLASS}
            />

            <CategoryPicker value={category} onChange={setCategory} showBuildings />

            {!title.trim() && <TaskIdeas category={category} onPick={setTitle} />}

            <div className="flex items-center justify-between gap-2 flex-wrap">
                <button type="button" onClick={() => setShowMore((open) => !open)} aria-expanded={showMore} className="inline-flex items-center gap-1.5 min-h-9 lg:min-h-7 px-2.5 rounded-full border-2 border-[#cfa877] text-xs font-semibold text-[#6b3f22] hover:border-[#6b3f22] transition-colors">
                    <Glyph name="calendar" size={14} /> {formatMinutes(estimatedMinutes)} · due {date === localDateKey() ? "today" : date} <span aria-hidden="true">{showMore ? "▴" : "▾"}</span>
                </button>
                {rewardPreview?.label && (
                    <span className="text-xs font-bold flex items-center gap-1" title={`Finishing it builds a ${lineBuildingName(line, 1, rules)}.`}>
                        <Coin /> {rewardPreview.label}
                    </span>
                )}
            </div>

            {showMore && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col gap-0.5">
                        <span className={LABEL_CLASS}>Duration</span>
                        <div className="flex gap-2">
                            <input type="number" min="1" aria-label="Duration" value={durationAmount} onChange={(e) => handleDurationChange(e.target.value, durationUnit)} className={`${INPUT_CLASS} !w-20`} />
                            <select aria-label="Duration unit" value={durationUnit} onChange={(e) => handleDurationChange(durationAmount, e.target.value)} className={`${INPUT_CLASS} flex-1`}>
                                {DURATION_UNITS.map((u) => (
                                    <option key={u.value} value={u.value}>
                                        {u.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label htmlFor="task-deadline" className={LABEL_CLASS}>
                            Deadline {!dateManuallySet && <span className="font-normal">(set from duration)</span>}
                        </label>
                        <input id="task-deadline" type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} required className={INPUT_CLASS} />
                    </div>
                </div>
            )}

            <div className="flex gap-2 mt-0.5">
                {onCancel && (
                    <button type="button" onClick={onCancel} className={btn("muted", "flex-1")}>
                        Cancel
                    </button>
                )}
                <button type="submit" className={btn("confirm", "flex-1")}>
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
