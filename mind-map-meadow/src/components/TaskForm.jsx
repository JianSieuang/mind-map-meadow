import React, { useState } from "react";
import { estimateTaskReward } from "../utils/rewards";
import { DURATION_UNITS, minutesFromDuration, dueDateFromDuration, durationFromMinutes } from "../utils/duration";

export default function TaskForm({ initialValues, onSubmit, onCancel, submitLabel = "Save" }) {
    const initialDuration = initialValues?.estimated_minutes ? durationFromMinutes(initialValues.estimated_minutes) : { amount: 1, unit: "hours" };

    const [title, setTitle] = useState(initialValues?.title || "");
    const [category, setCategory] = useState(initialValues?.category || "Coding");
    const [durationAmount, setDurationAmount] = useState(initialDuration.amount);
    const [durationUnit, setDurationUnit] = useState(initialDuration.unit);
    const [date, setDate] = useState(initialValues?.due_date || dueDateFromDuration(initialDuration.amount, initialDuration.unit));
    const [dateManuallySet, setDateManuallySet] = useState(!!initialValues?.due_date);

    const estimatedMinutes = minutesFromDuration(durationAmount, durationUnit);
    const reward = estimateTaskReward(estimatedMinutes, date);

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
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
                <label className="text-[11px] text-slate-400 font-semibold">Goal Description</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Complete Unity blueprints"
                    required
                    className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                />
            </div>

            <div className="flex flex-col gap-0.5">
                <label className="text-[11px] text-slate-400 font-semibold">Category</label>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                >
                    <option value="Coding">💻 Coding</option>
                    <option value="Fitness">🏋️ Fitness</option>
                    <option value="Finance">💰 Finance</option>
                </select>
            </div>

            <div className="flex flex-col gap-0.5">
                <label className="text-[11px] text-slate-400 font-semibold">Target Duration</label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        min="1"
                        value={durationAmount}
                        onChange={(e) => handleDurationChange(e.target.value, durationUnit)}
                        className="w-20 p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                    <select
                        value={durationUnit}
                        onChange={(e) => handleDurationChange(durationAmount, e.target.value)}
                        className="flex-1 p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                    >
                        {DURATION_UNITS.map((u) => (
                            <option key={u.value} value={u.value}>
                                {u.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-col gap-0.5">
                <label className="text-[11px] text-slate-400 font-semibold">
                    Deadline {!dateManuallySet && <span className="text-slate-600 normal-case font-normal">(auto-set from duration)</span>}
                </label>
                <input
                    type="date"
                    value={date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                    className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                />
            </div>

            <div className="flex items-center justify-between bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-400">Potential reward</span>
                <span className="text-xs font-bold text-yellow-400">
                    🪙 {reward.baseCoins}{" "}
                    {reward.bonusCoins > 0 ? <span className="text-emerald-400">+{reward.bonusCoins} on time</span> : <span className="text-slate-500 font-semibold">(deadline passed)</span>}
                </span>
            </div>

            <div className="flex gap-2 mt-1">
                {onCancel && (
                    <button type="button" onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg text-xs transition">
                        Cancel
                    </button>
                )}
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs shadow transition">
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
