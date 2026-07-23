import React, { useState } from "react";
import { estimateTaskReward } from "../utils/rewards";
import { minutesFromTimeRange } from "../utils/duration";

export default function RecurringTaskForm({ initialValues, onSubmit, onCancel, submitLabel = "Save" }) {
    const [title, setTitle] = useState(initialValues?.title || "");
    const [category, setCategory] = useState(initialValues?.category || "Fitness");
    const [startTime, setStartTime] = useState(initialValues?.start_time?.slice(0, 5) || "07:00");
    const [endTime, setEndTime] = useState(initialValues?.end_time?.slice(0, 5) || "08:00");

    const estimatedMinutes = minutesFromTimeRange(startTime, endTime);
    const reward = estimateTaskReward(estimatedMinutes, null);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ title, category, estimatedMinutes, startTime, endTime });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
                <label className="text-[11px] text-slate-400 font-semibold">Daily Goal</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Morning exercise"
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

            <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-0.5">
                    <label className="text-[11px] text-slate-400 font-semibold">Start Time</label>
                    <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                        className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                </div>
                <div className="flex-1 flex flex-col gap-0.5">
                    <label className="text-[11px] text-slate-400 font-semibold">End Time</label>
                    <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                        className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="flex items-center justify-between bg-[#1e1e24] border border-slate-700 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-400">Reward per completed day</span>
                <span className="text-xs font-bold text-yellow-400">
                    🪙 {reward.baseCoins} <span className="text-emerald-400">+{reward.bonusCoins} same-day</span>
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
