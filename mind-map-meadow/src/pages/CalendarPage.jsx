import React, { useState } from "react";
import TaskForm from "../components/TaskForm";
import { CompletedTaskRow, PendingTaskRow } from "../components/TaskRow";
import { Coin } from "../components/Sprites";
import { MUTED_TEXT_CLASS, PANEL_CLASS, btn } from "../components/hudStyles";
import { localDateKey, dueDateKey, completedDateKey } from "../utils/dates";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMonthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CalendarPage({ tasks, onAddTask, onEditTask, onDeleteTask, onCompleteTask, rewardPreview, rules }) {
    const today = new Date();
    const todayKey = localDateKey(today);

    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedDate, setSelectedDate] = useState(todayKey);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);

    // Group all tasks by due date (unfinished) and completion date (done), across every day
    const pendingByDate = {};
    const completedByDate = {};
    tasks.forEach((task) => {
        const dueKey = dueDateKey(task.due_date);
        if (task.status === "pending" && dueKey) pendingByDate[dueKey] = (pendingByDate[dueKey] || 0) + 1;
        if (task.status === "completed" && task.completed_at) {
            const doneKey = completedDateKey(task.completed_at);
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

    const selectedPending = tasks.filter((t) => t.status === "pending" && dueDateKey(t.due_date) === selectedDate);
    const selectedCompleted = tasks.filter((t) => t.status === "completed" && completedDateKey(t.completed_at) === selectedDate);

    const handleAdd = (values) => {
        onAddTask(values);
        setIsAdding(false);
    };

    const handleEdit = (id, values) => {
        onEditTask({ id, ...values });
        setEditingId(null);
    };

    return (
        <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
            <div className="flex items-center justify-between">
                <button onClick={() => goToMonth(-1)} aria-label="Previous month" className={btn("muted", "font-pixel !text-base w-11 lg:w-9")}>
                    ‹
                </button>
                <h3 className="font-pixel text-xl leading-none text-[#f6e6c8]">{formatMonthLabel(viewYear, viewMonth)}</h3>
                <button onClick={() => goToMonth(1)} aria-label="Next month" className={btn("muted", "font-pixel !text-base w-11 lg:w-9")}>
                    ›
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="text-center text-xs font-bold text-[#e8c99a] pb-0.5">
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
                            aria-pressed={isSelected}
                            aria-label={`${dateKey}${isToday ? ", today" : ""}${pendingCount ? `, ${pendingCount} to do` : ""}${completedCount ? `, ${completedCount} done` : ""}`}
                            className={`relative h-14 rounded-sm border-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                                isSelected ? "bg-[#e0a526] border-[#2b1e1a] text-[#2b1e1a]" : isToday ? "bg-[#f6e6c8] border-[#e0a526] text-[#2b1e1a]" : "bg-[#e8c99a] border-[#2b1e1a] text-[#2b1e1a] hover:bg-[#f6e6c8]"
                            }`}
                        >
                            <span className="font-pixel text-sm leading-none">{day}</span>
                            {pendingCount > 0 && <span className="font-pixel text-xs bg-[#2b1e1a] text-[#ffd65a] px-1 rounded-sm leading-tight">{pendingCount}</span>}
                            {completedCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-[#3f7a3a] border border-[#2b1e1a]" />}
                        </button>
                    );
                })}
            </div>

            <div className={`p-3 flex flex-col gap-1 ${PANEL_CLASS}`}>
                <div className="flex items-center justify-between gap-2">
                    <h4 className="font-pixel text-base leading-none">{selectedDate === todayKey ? "Today" : selectedDate}</h4>
                    {!isAdding && (
                        <button onClick={() => setIsAdding(true)} className={btn("muted")}>
                            Add a task for this day
                        </button>
                    )}
                </div>

                {isAdding && <TaskForm initialValues={{ due_date: selectedDate }} onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Add task" rewardPreview={rewardPreview} rules={rules} />}

                {!isAdding && selectedPending.length === 0 && selectedCompleted.length === 0 && <p className={`${MUTED_TEXT_CLASS} text-center py-3`}>Nothing scheduled this day.</p>}

                {!isAdding &&
                    selectedPending.map((task) => {
                        if (editingId === task.id) {
                            return (
                                <TaskForm
                                    key={task.id}
                                    initialValues={{ title: task.title, category: task.category, due_date: selectedDate, estimated_minutes: task.estimated_minutes }}
                                    onSubmit={(values) => handleEdit(task.id, values)}
                                    onCancel={() => setEditingId(null)}
                                    submitLabel="Save changes"
                                    rewardPreview={rewardPreview}
                                    rules={rules}
                                />
                            );
                        }
                        return (
                            <PendingTaskRow
                                key={task.id}
                                task={task}
                                meta={
                                    rewardPreview?.chip && (
                                        <span className="flex items-center gap-1">
                                            <Coin /> <span className="font-pixel text-sm leading-none text-[#2b1e1a]">{rewardPreview.chip}</span>
                                        </span>
                                    )
                                }
                                onEdit={() => setEditingId(task.id)}
                                onDelete={() => onDeleteTask(task.id)}
                                onComplete={() => onCompleteTask(task.id)}
                            />
                        );
                    })}

                {!isAdding && selectedCompleted.map((task) => <CompletedTaskRow key={task.id} task={task} />)}
            </div>
        </div>
    );
}
