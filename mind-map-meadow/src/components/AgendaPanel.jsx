import React from "react";

export default function AgendaPanel({ tasks, onCompleteTask }) {
    const pendingTasks = tasks.filter((t) => t.status === "pending");

    return (
        <div className="absolute top-6 right-20 z-20 w-[300px] max-h-[calc(100vh-8rem)] p-4 flex flex-col gap-2 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-[0_0_40px_-10px_rgba(99,102,241,0.35)] overflow-y-auto">
            <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center gap-1.5">
                📅 Active Agenda
                {pendingTasks.length > 0 && <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingTasks.length}</span>}
            </h3>
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
    );
}
