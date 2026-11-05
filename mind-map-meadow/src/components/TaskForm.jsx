import React, { useState } from "react";
import { BuildingThumb, Coin } from "./Sprites";
import { INPUT_CLASS, LABEL_CLASS, LINK_BTN_CLASS, MUTED_TEXT_CLASS, SEGMENT_GROUP_CLASS, btn, segment } from "./hudStyles";
import { lineForCategory } from "../utils/rewards";
import { lineBuildingName } from "../utils/builder";
import { localDateKey } from "../utils/dates";
import { DURATION_UNITS, minutesFromDuration, dueDateFromDuration, durationFromMinutes, formatMinutes } from "../utils/duration";

export const TASK_CATEGORIES = ["Coding", "Fitness", "Finance"];

export function CategoryPicker({ value, onChange }) {
    return (
        <div className={`${SEGMENT_GROUP_CLASS} grid-cols-3`} role="group" aria-label="Category">
            {TASK_CATEGORIES.map((category) => (
                <button key={category} type="button" onClick={() => onChange(category)} aria-pressed={value === category} className={segment(value === category)}>
                    {category}
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
            <div className="flex flex-col gap-0.5">
                <label htmlFor="task-title" className={LABEL_CLASS}>
                    Task
                </label>
                <input id="task-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Finish the report" required autoFocus={!initialValues?.title} className={INPUT_CLASS} />
            </div>

            <CategoryPicker value={category} onChange={setCategory} />

            <button type="button" onClick={() => setShowMore((open) => !open)} aria-expanded={showMore} className={`${LINK_BTN_CLASS} self-start`}>
                {showMore ? "Less" : `More: ${formatMinutes(estimatedMinutes)}, due ${date === localDateKey() ? "today" : date}`}
            </button>

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

            <RewardPreview rewardPreview={rewardPreview} line={line} text={`Finishing it builds a ${lineBuildingName(line, 1, rules)}.`} />

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
