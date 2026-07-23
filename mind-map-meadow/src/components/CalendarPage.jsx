import React, { useState } from "react";
import TaskForm from "./TaskForm";
import { estimateTaskReward } from "../utils/rewards";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date) {
    return date.toISOString().slice(0, 10);
}

function formatMonthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarPage({ tasks, onAddTask, onEditTask, onDeleteTask, onCompleteTask }) {
    const today = new Date();
    const todayKey = toDateKey(today);

    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedDate, setSelectedDate] = useState(todayKey);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    // Group all tasks by due date (unfinished) and completion date (done), across every day
    const pendingByDate = {};
    const completedByDate = {};
    tasks.forEach((task) => {
        const dueKey = typeof task.due_date === "string" ? task.due_date.slice(0, 10) : "";
        if (task.status === "pending" && dueKey) pendingByDate[dueKey] = (pendingByDate[dueKey] || 0) + 1;
        if (task.status === "completed" && task.completed_at) {
            const doneKey = task.completed_at.slice(0, 10);
            completedByDate[doneKey] = (completedByDate[doneKey] || 0) + 1;
        }
    });

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay();

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const goToMonth = (delta) => {
        let m = viewMonth + delta;
        let y = viewYear;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        if (m > 11) {
            m = 0;
            y += 1;
        }
        setViewMonth(m);
        setViewYear(y);
    };

    const dateKeyForDay = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const selectDay = (dateKey) => {
        setSelectedDate(dateKey);
        setIsAdding(false);
        setEditingId(null);
    };

    const selectedPending = tasks.filter((t) => t.status === "pending" && typeof t.due_date === "string" && t.due_date.slice(0, 10) === selectedDate);
    const selectedCompleted = tasks.filter((t) => t.status === "completed" && t.completed_at && t.completed_at.slice(0, 10) === selectedDate);

    const handleAdd = (values) => {
        onAddTask(values);
        setIsAdding(false);
    };

    const handleEdit = (id, values) => {
        onEditTask({ id, ...values });
        setEditingId(null);
    };

    const handleDelete = (id) => {
        onDeleteTask(id);
        setConfirmDeleteId(null);
    };

    return (
        <div className="flex flex-col gap-5 max-w-3xl w-full mx-auto">
            <div className="flex items-center justify-between">
                <button onClick={() => goToMonth(-1)} className="bg-[#2a2a35] hover:bg-slate-700 text-white w-8 h-8 rounded-lg text-sm font-bold transition">
                    ‹
                </button>
                <h3 className="text-sm font-bold text-white">{formatMonthLabel(viewYear, viewMonth)}</h3>
                <button onClick={() => goToMonth(1)} className="bg-[#2a2a35] hover:bg-slate-700 text-white w-8 h-8 rounded-lg text-sm font-bold transition">
                    ›
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="text-center text-[10px] font-bold text-slate-500 uppercase pb-1">
                        {label}
                    </div>
                ))}
                {cells.map((day, idx) => {
                    if (day === null) return <div key={`blank-${idx}`} />;
                    const dateKey = dateKeyForDay(day);
                    const pendingCount = pendingByDate[dateKey] || 0;
                    const completedCount = completedByDate[dateKey] || 0;
                    const isToday = dateKey === todayKey;
                    const isSelected = dateKey === selectedDate;

                    return (
                        <button
                            key={dateKey}
                            onClick={() => selectDay(dateKey)}
                            className={`relative h-14 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition ${
                                isSelected
                                    ? "bg-emerald-600/20 border-emerald-500 text-white"
                                    : isToday
                                      ? "bg-[#2a2a35] border-blue-500 text-white"
                                      : "bg-[#242430] border-slate-700 text-slate-300 hover:border-slate-500"
                            }`}
                        >
                            <span>{day}</span>
                            {pendingCount > 0 && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded-full leading-none">{pendingCount}</span>}
                            {completedCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        </button>
                    );
                })}
            </div>

            <div className="bg-[#2a2a35] border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white">{selectedDate === todayKey ? "Today" : selectedDate}</h4>
                    {!isAdding && (
                        <button onClick={() => setIsAdding(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] transition">
                            ➕ Add for this day
                        </button>
                    )}
                </div>

                {isAdding && <TaskForm initialValues={{ due_date: selectedDate }} onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Create Goal" />}

                {!isAdding && selectedPending.length === 0 && selectedCompleted.length === 0 && (
                    <p className="text-[11px] text-slate-500 text-center py-3 italic">Nothing scheduled this day.</p>
                )}

                {!isAdding &&
                    selectedPending.map((task) => {
                        if (editingId === task.id) {
                            return (
                                <TaskForm
                                    key={task.id}
                                    initialValues={{ title: task.title, category: task.category, due_date: selectedDate, estimated_minutes: task.estimated_minutes }}
                                    onSubmit={(values) => handleEdit(task.id, values)}
                                    onCancel={() => setEditingId(null)}
                                    submitLabel="Save Changes"
                                />
                            );
                        }
                        const reward = estimateTaskReward(task.estimated_minutes, task.due_date);
                        return (
                            <div key={task.id} className="bg-[#1e1e24] p-2.5 rounded-lg flex items-center justify-between gap-2 border-l-4 border-yellow-500">
                                <div className="min-w-0 flex-1">
                                    <strong className="text-xs text-white block truncate">{task.title}</strong>
                                    <div className="flex gap-2 mt-0.5 text-[10px] text-slate-400 font-semibold">
                                        <span className="uppercase">{task.category}</span>
                                        <span className="text-yellow-400">🪙 {reward.bonusCoins > 0 ? `${reward.baseCoins}+${reward.bonusCoins}` : reward.baseCoins}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <button onClick={() => setEditingId(task.id)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                        ✏️
                                    </button>
                                    {confirmDeleteId === task.id ? (
                                        <button onClick={() => handleDelete(task.id)} className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                            Confirm?
                                        </button>
                                    ) : (
                                        <button onClick={() => setConfirmDeleteId(task.id)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                            🗑️
                                        </button>
                                    )}
                                    <button onClick={() => onCompleteTask(task.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[11px] transition">
                                        ✓ Done
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                {!isAdding &&
                    selectedCompleted.map((task) => (
                        <div key={task.id} className="bg-[#1e1e24] p-2.5 rounded-lg flex items-center justify-between gap-2 border-l-4 border-emerald-600 opacity-75">
                            <div className="min-w-0 flex-1">
                                <strong className="text-xs text-slate-300 block truncate line-through">{task.title}</strong>
                                <div className="flex gap-2 mt-0.5 text-[10px] text-slate-500 font-semibold">
                                    <span className="uppercase">{task.category}</span>
                                    <span className="text-yellow-500">🪙 +{task.coins_earned}</span>
                                </div>
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}
