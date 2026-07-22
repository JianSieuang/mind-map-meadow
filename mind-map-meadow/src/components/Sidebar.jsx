import React from "react";

export default function Sidebar({ stats, tasks, aiThought, onCompleteTask }) {
    const pendingTasks = tasks.filter((t) => t.status === "pending");

    return (
        <div id="sidebar" className="absolute top-6 right-6 z-20 w-[340px] max-h-[calc(100vh-8rem)] p-4 flex flex-col gap-4 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-2xl overflow-y-auto">
            {/* AI Narrative Monitor Component */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border border-indigo-500/30 p-3.5 rounded-xl shadow-inner">
                <h3 className="text-[11px] uppercase tracking-wider text-indigo-300 font-bold mb-1 flex items-center gap-1">
                    <span className="animate-pulse text-rose-400">🔴</span> Llama 3 Companion Brain
                </h3>
                <p className="text-xs text-slate-200 font-medium leading-relaxed italic">"{aiThought}"</p>
            </div>

            {/* Metric Counters Tracker Blocks */}
            <div className="flex gap-3">
                <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                    <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Level</h4>
                    <p className="text-lg font-bold text-blue-400">{stats.level}</p>
                </div>
                <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                    <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Coins</h4>
                    <p className="text-lg font-bold text-yellow-400">{stats.coins}</p>
                </div>
                <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                    <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Calories</h4>
                    <p className="text-lg font-bold text-emerald-400">{stats.calories_burned}</p>
                </div>
            </div>

            {/* Realtime Active Agenda Checklist Layout */}
            <div className="flex gap-2 flex-col min-h-0">
                <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center gap-1">📅 Active Agenda</h3>
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {pendingTasks.map((task) => (
                        <div key={task.id} className="bg-[#2a2a35] p-2.5 rounded-lg flex justify-between items-center border-l-4 border-yellow-500 border-y border-r border-slate-700/60">
                            <div className="max-w-[70%] truncate">
                                <strong className="text-xs text-white block mb-0.5 truncate">{task.title}</strong>
                                <small className="text-[9px] text-slate-400 font-semibold tracking-wide uppercase">{task.category}</small>
                            </div>
                            <button onClick={() => onCompleteTask(task.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[11px] transition shrink-0">
                                ✓ Done
                            </button>
                        </div>
                    ))}
                    {pendingTasks.length === 0 && <p className="text-[11px] text-slate-500 text-center py-4 italic">Meadow clear! Click grass to add goals.</p>}
                </div>
            </div>
        </div>
    );
}
