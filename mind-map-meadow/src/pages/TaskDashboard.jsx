import React, { useState } from "react";
import GoalsPage from "./GoalsPage";
import CalendarPage from "./CalendarPage";
import DailyTasksPage from "./DailyTasksPage";

const PAGES = [
    { key: "goals", label: "Goals", icon: "📋" },
    { key: "calendar", label: "Calendar", icon: "🗓️" },
    { key: "daily", label: "Daily Tasks", icon: "🔁" },
];

export default function TaskDashboard({
    isOpen,
    onClose,
    tasks,
    recurringTasks,
    onAddTask,
    onEditTask,
    onDeleteTask,
    onCompleteTask,
    onAddRecurringTask,
    onEditRecurringTask,
    onDeleteRecurringTask,
    onToggleRecurringTask,
}) {
    const [activePage, setActivePage] = useState("goals");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-[#1e1e24] z-40 flex text-white">
            {/* Left-hand page navigation */}
            <div className="w-48 shrink-0 border-r border-slate-700 flex flex-col py-4 px-3 gap-1">
                <h2 className="text-sm font-bold flex items-center gap-2 px-2 mb-3">📋 Dashboard</h2>
                {PAGES.map((page) => (
                    <button
                        key={page.key}
                        onClick={() => setActivePage(page.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-left transition ${
                            activePage === page.key ? "bg-[#2a2a35] text-white" : "text-slate-400 hover:text-slate-200 hover:bg-[#2a2a35]/50"
                        }`}
                    >
                        <span>{page.icon}</span> {page.label}
                    </button>
                ))}
                <div className="flex-1" />
                <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-xs font-semibold transition">
                    ← Back to Meadow
                </button>
            </div>

            {/* Active page content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                {activePage === "goals" && <GoalsPage tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onCompleteTask={onCompleteTask} />}
                {activePage === "calendar" && <CalendarPage tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onCompleteTask={onCompleteTask} />}
                {activePage === "daily" && (
                    <DailyTasksPage
                        recurringTasks={recurringTasks}
                        tasks={tasks}
                        onAddRecurringTask={onAddRecurringTask}
                        onEditRecurringTask={onEditRecurringTask}
                        onDeleteRecurringTask={onDeleteRecurringTask}
                        onToggleRecurringTask={onToggleRecurringTask}
                        onCompleteTask={onCompleteTask}
                    />
                )}
            </div>
        </div>
    );
}
