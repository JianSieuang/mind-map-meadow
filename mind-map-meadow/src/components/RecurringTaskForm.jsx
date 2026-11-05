import React, { useState } from "react";
import { CategoryPicker, RewardPreview } from "./TaskForm";
import { INPUT_CLASS, LABEL_CLASS, btn } from "./hudStyles";
import { lineBuildingName } from "../utils/builder";
import { formatMinutes, isOvernight, minutesFromTimeRange } from "../utils/duration";

export default function RecurringTaskForm({ initialValues, onSubmit, onCancel, submitLabel = "Save", rewardPreview, rules }) {
    const [title, setTitle] = useState(initialValues?.title || "");
    const [category, setCategory] = useState(initialValues?.category || "Fitness");
    const [startTime, setStartTime] = useState(initialValues?.start_time?.slice(0, 5) || "07:00");
    const [endTime, setEndTime] = useState(initialValues?.end_time?.slice(0, 5) || "08:00");

    const estimatedMinutes = minutesFromTimeRange(startTime, endTime);
    const sameTime = startTime === endTime;
    const overnight = !sameTime && isOvernight(startTime, endTime);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (sameTime) return;
        onSubmit({ title, category, estimatedMinutes, startTime, endTime });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
                <label htmlFor="habit-title" className={LABEL_CLASS}>
                    Daily task
                </label>
                <input id="habit-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Morning exercise" required autoFocus={!initialValues?.title} className={INPUT_CLASS} />
            </div>

            <CategoryPicker value={category} onChange={setCategory} />

            <div className="flex gap-2">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <label htmlFor="habit-start" className={LABEL_CLASS}>
                        Start
                    </label>
                    <input id="habit-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={INPUT_CLASS} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <label htmlFor="habit-end" className={LABEL_CLASS}>
                        End
                    </label>
                    <input id="habit-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className={INPUT_CLASS} />
                </div>
            </div>
            {sameTime && <p className="text-xs font-semibold text-[#9c2f2b]">Start and end can't be the same time.</p>}
            {overnight && <p className="text-xs font-semibold text-[#9c2f2b]">Overnight: this ends the next day, {formatMinutes(estimatedMinutes)} later. Check the times if that's not what you meant.</p>}

            <RewardPreview rewardPreview={rewardPreview} line="habit" text={`Each day you finish it builds a ${lineBuildingName("habit", 1, rules)}.`} />

            <div className="flex gap-2 mt-0.5">
                {onCancel && (
                    <button type="button" onClick={onCancel} className={btn("muted", "flex-1")}>
                        Cancel
                    </button>
                )}
                <button type="submit" disabled={sameTime} className={btn("confirm", "flex-1")}>
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
