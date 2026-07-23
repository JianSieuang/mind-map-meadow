import React, { useState } from "react";
import RecurringTaskForm from "./RecurringTaskForm";
import { formatTimeRange } from "../utils/duration";

function todayDateKey() {
    return new Date().toISOString().slice(0, 10);
}

export default function DailyTasksPage({ recurringTasks, tasks, onAddRecurringTask, onEditRecurringTask, onDeleteRecurringTask, onToggleRecurringTask, onCompleteTask }) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const todayKey = todayDateKey();

    const handleAdd = (values) => {
        onAddRecurringTask(values);
        setIsAdding(false);
    };

    const handleEdit = (id, values) => {
        onEditRecurringTask({ id, ...values });
        setEditingId(null);
    };

    const handleDelete = (id) => {
        onDeleteRecurringTask(id);
        setConfirmDeleteId(null);
    };

    return (
        <div className="flex flex-col gap-5 max-w-3xl w-full mx-auto">
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-3.5">
                <p className="text-xs text-slate-300 leading-relaxed">🔁 Plan a habit once, and it'll show up as a fresh task every day at its scheduled time — no need to re-add it manually.</p>
            </div>

            {isAdding ? (
                <div className="bg-[#2a2a35] border border-slate-700 rounded-xl p-4">
                    <h3 className="text-sm font-bold mb-3">📝 New Daily Task</h3>
                    <RecurringTaskForm onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Create Daily Task" />
                </div>
            ) : (
                <button onClick={() => setIsAdding(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs shadow transition">
                    ➕ New Daily Task
                </button>
            )}

            <div className="flex flex-col gap-2">
                {recurringTasks.map((template) => {
                    if (editingId === template.id) {
                        return (
                            <div key={template.id} className="bg-[#2a2a35] border border-blue-500/50 rounded-xl p-4">
                                <RecurringTaskForm
                                    initialValues={{
                                        title: template.title,
                                        category: template.category,
                                        start_time: template.start_time,
                                        end_time: template.end_time,
                                    }}
                                    onSubmit={(values) => handleEdit(template.id, values)}
                                    onCancel={() => setEditingId(null)}
                                    submitLabel="Save Changes"
                                />
                            </div>
                        );
                    }

                    const todayInstance = tasks.find((t) => t.recurring_task_id === template.id && typeof t.due_date === "string" && t.due_date.slice(0, 10) === todayKey);

                    return (
                        <div
                            key={template.id}
                            className={`bg-[#2a2a35] p-3 rounded-lg flex items-center justify-between gap-3 border-l-4 ${template.active ? "border-emerald-500" : "border-slate-600"} border-y border-r border-slate-700/60 ${!template.active ? "opacity-60" : ""}`}
                        >
                            <div className="min-w-0 flex-1">
                                <strong className="text-xs text-white block truncate">{template.title}</strong>
                                <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-slate-400 font-semibold">
                                    <span className="uppercase tracking-wide">{template.category}</span>
                                    <span>🕐 {formatTimeRange(template.start_time, template.end_time)}</span>
                                    {!template.active && <span className="text-slate-500">Paused</span>}
                                </div>
                                {template.active && (
                                    <p className="text-[10px] mt-1 font-semibold">
                                        {todayInstance?.status === "completed" ? (
                                            <span className="text-emerald-400">✓ Done today</span>
                                        ) : todayInstance ? (
                                            <span className="text-yellow-400">Pending today</span>
                                        ) : (
                                            <span className="text-slate-500">Generating today's task...</span>
                                        )}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                {todayInstance && todayInstance.status === "pending" && (
                                    <button onClick={() => onCompleteTask(todayInstance.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                        ✓ Done
                                    </button>
                                )}
                                <button
                                    onClick={() => onToggleRecurringTask({ id: template.id, active: !template.active })}
                                    className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[11px] transition"
                                >
                                    {template.active ? "⏸" : "▶"}
                                </button>
                                <button onClick={() => setEditingId(template.id)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                    ✏️
                                </button>
                                {confirmDeleteId === template.id ? (
                                    <button onClick={() => handleDelete(template.id)} className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                        Confirm?
                                    </button>
                                ) : (
                                    <button onClick={() => setConfirmDeleteId(template.id)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                        🗑️
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}

                {recurringTasks.length === 0 && !isAdding && <p className="text-[11px] text-slate-500 text-center py-6 italic">No daily tasks planned yet. Add one to build a routine!</p>}
            </div>
        </div>
    );
}
