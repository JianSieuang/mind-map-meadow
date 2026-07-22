import React, { useState } from "react";

export default function TaskModal({ isOpen, onClose, onCreateTask }) {
    if (!isOpen) return null;

    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("Coding");
    const [date, setDate] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreateTask({ title, category, date });
        setTitle("");
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity">
            <div className="bg-[#2a2a35] w-[380px] p-5 rounded-xl border border-slate-600 shadow-2xl flex flex-col gap-3.5">
                <div className="flex justify-between items-center border-b border-slate-700 pb-1.5">
                    <h3 className="text-sm font-bold text-white">📝 Add New Goal</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-base px-1">
                        &times;
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[11px] text-slate-400 font-semibold">Goal Description</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Complete Unity blueprints" required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[11px] text-slate-400 font-semibold">Category Type</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500">
                            <option value="Coding">💻 Coding Assignment</option>
                            <option value="Fitness">🏋️ Fitness Exercise</option>
                            <option value="Finance">💰 Expense Record</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[11px] text-slate-400 font-semibold">Target Deadline</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500" />
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs shadow transition mt-1">
                        Log to Database
                    </button>
                </form>
            </div>
        </div>
    );
}
