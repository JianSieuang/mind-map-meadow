import React, { useState } from "react";
import GoalsPage from "./GoalsPage";
import CalendarPage from "./CalendarPage";
import DailyTasksPage from "./DailyTasksPage";
import MoneyPage from "./MoneyPage";
import { Glyph, Icon } from "../components/Sprites";
import { btn } from "../components/hudStyles";

const PAGES = [
    { key: "goals", label: "Tasks", icon: <Icon name="goals" /> },
    { key: "calendar", label: "Calendar", icon: <Glyph name="calendar" /> },
    { key: "daily", label: "Daily tasks", icon: <Glyph name="repeat" /> },
    { key: "money", label: "Money", icon: <Icon name="coin" /> },
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
    transactions,
    savingsGoals,
    onAddSavingsGoal,
    onDeleteSavingsGoal,
    onDeleteTransaction,
    onOpenQuickAdd,
    rewardPreview,
    rules,
}) {
    const [activePage, setActivePage] = useState("goals");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-[#3a2820] z-40 flex flex-col sm:flex-row text-[#f6e6c8] select-text">
            {/* Page navigation: a left rail, or a scrolling top strip at phone width */}
            <div className="sm:w-48 shrink-0 bg-[#2b1e1a] flex sm:flex-col items-center sm:items-stretch py-2 sm:py-4 px-2 sm:px-3 gap-1 overflow-x-auto [scrollbar-width:none] sm:[scrollbar-width:thin]">
                <h2 className="hidden sm:block font-pixel text-xl leading-none px-1 mb-3">Town ledger</h2>
                <button onClick={onClose} className={btn("muted", "sm:hidden shrink-0 font-pixel !text-base w-11")} aria-label="Back to meadow">
                    ‹
                </button>
                {PAGES.map((page) => (
                    <button
                        key={page.key}
                        onClick={() => setActivePage(page.key)}
                        aria-pressed={activePage === page.key}
                        className={`shrink-0 flex items-center gap-2 min-h-11 px-2 py-1 rounded-sm text-xs font-bold text-left whitespace-nowrap transition-colors ${activePage === page.key ? "bg-[#f6e6c8] text-[#2b1e1a]" : "text-[#e8c99a] hover:bg-[#3a2820]"}`}
                    >
                        {page.icon} {page.label}
                    </button>
                ))}
                <div className="hidden sm:block flex-1" />
                <button onClick={onClose} className={btn("muted", "hidden sm:inline-flex")}>
                    Back to meadow
                </button>
            </div>

            {/* Active page content */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
                {activePage === "goals" && <GoalsPage tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onCompleteTask={onCompleteTask} rewardPreview={rewardPreview} rules={rules} />}
                {activePage === "calendar" && <CalendarPage tasks={tasks} onAddTask={onAddTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onCompleteTask={onCompleteTask} rewardPreview={rewardPreview} rules={rules} />}
                {activePage === "daily" && (
                    <DailyTasksPage
                        recurringTasks={recurringTasks}
                        tasks={tasks}
                        onAddRecurringTask={onAddRecurringTask}
                        onEditRecurringTask={onEditRecurringTask}
                        onDeleteRecurringTask={onDeleteRecurringTask}
                        onToggleRecurringTask={onToggleRecurringTask}
                        onCompleteTask={onCompleteTask}
                        rewardPreview={rewardPreview}
                        rules={rules}
                    />
                )}
                {activePage === "money" && <MoneyPage transactions={transactions} savingsGoals={savingsGoals} onAddSavingsGoal={onAddSavingsGoal} onDeleteSavingsGoal={onDeleteSavingsGoal} onDeleteTransaction={onDeleteTransaction} onOpenQuickAdd={onOpenQuickAdd} />}
            </div>
        </div>
    );
}
