import React, { useState } from "react";
import TaskForm from "./TaskForm";
import { estimateTaskReward, isTaskOverdue } from "../utils/rewards";

const TABS = [
    { key: "all", label: "All", icon: "📋" },
    { key: "due", label: "Due", icon: "⏰" },
    { key: "Coding", label: "Coding", icon: "💻" },
    { key: "Fitness", label: "Fitness", icon: "🏋️" },
    { key: "Finance", label: "Finance", icon: "💰" },
    { key: "completed", label: "Completed", icon: "✅" },
];

const NON_CATEGORY_TABS = ["all", "due", "completed"];

function formatDate(dueDate) {
    return typeof dueDate === "string" ? dueDate.slice(0, 10) : "";
}

// Overdue or due today — the tasks that need attention right now
function isDueOrOverdue(task) {
    return new Date(task.due_date) <= new Date(new Date().toDateString());
}

export default function TaskDashboard({ isOpen, onClose, tasks, onAddTask, onEditTask, onDeleteTask, onCompleteTask }) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    if (!isOpen) return null;

    const pendingAll = [...tasks.filter((t) => t.status === "pending")].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const completedAll = [...tasks.filter((t) => t.status === "completed")].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

    const countFor = (key) => {
        if (key === "all") return pendingAll.length;
        if (key === "due") return pendingAll.filter(isDueOrOverdue).length;
        if (key === "completed") return completedAll.length;
        return pendingAll.filter((t) => t.category === key).length;
    };

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = (task) => !query || task.title.toLowerCase().includes(query);

    const visibleTasks = (
        activeTab === "completed"
            ? completedAll
            : activeTab === "due"
              ? pendingAll.filter(isDueOrOverdue)
              : activeTab === "all"
                ? pendingAll
                : pendingAll.filter((t) => t.category === activeTab)
    ).filter(matchesSearch);

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

    const defaultAddCategory = NON_CATEGORY_TABS.includes(activeTab) ? "Coding" : activeTab;

    return (
        <div className="fixed inset-0 bg-[#1e1e24] z-40 flex flex-col text-white">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <h2 className="text-lg font-bold flex items-center gap-2">📋 Goal Dashboard</h2>
                <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                    ← Back to Meadow
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-5 max-w-3xl w-full mx-auto">
                    {isAdding ? (
                        <div className="bg-[#2a2a35] border border-slate-700 rounded-xl p-4">
                            <h3 className="text-sm font-bold mb-3">📝 New Goal</h3>
                            <TaskForm initialValues={{ category: defaultAddCategory }} onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Create Goal" />
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs shadow transition"
                        >
                            ➕ New Goal
                        </button>
                    )}

                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="🔍 Search goals..."
                        className="w-full p-2.5 rounded-lg border border-slate-700 bg-[#2a2a35] text-white text-xs focus:outline-none focus:border-blue-500"
                    />

                    <div className="flex gap-1.5 border-b border-slate-700 overflow-x-auto">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition whitespace-nowrap ${
                                    activeTab === tab.key ? "bg-[#2a2a35] text-white border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {tab.icon} {tab.label} ({countFor(tab.key)})
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2">
                        {visibleTasks.map((task) => {
                            if (activeTab === "completed") {
                                return (
                                    <div
                                        key={task.id}
                                        className="bg-[#23232e] p-3 rounded-lg flex items-center justify-between gap-3 border-l-4 border-emerald-600 border-y border-r border-slate-700/40 opacity-80"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <strong className="text-xs text-slate-300 block truncate line-through">{task.title}</strong>
                                            <div className="flex gap-2 mt-1 text-[10px] text-slate-500 font-semibold">
                                                <span className="uppercase tracking-wide">{task.category}</span>
                                                <span className="text-yellow-500">🪙 +{task.coins_earned}</span>
                                            </div>
                                        </div>
                                        {confirmDeleteId === task.id ? (
                                            <button
                                                onClick={() => handleDelete(task.id)}
                                                className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1 px-2 rounded text-[11px] transition shrink-0"
                                            >
                                                Confirm?
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(task.id)}
                                                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[11px] transition shrink-0"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                );
                            }

                            if (editingId === task.id) {
                                return (
                                    <div key={task.id} className="bg-[#2a2a35] border border-blue-500/50 rounded-xl p-4">
                                        <TaskForm
                                            initialValues={{
                                                title: task.title,
                                                category: task.category,
                                                due_date: formatDate(task.due_date),
                                                estimated_minutes: task.estimated_minutes,
                                            }}
                                            onSubmit={(values) => handleEdit(task.id, values)}
                                            onCancel={() => setEditingId(null)}
                                            submitLabel="Save Changes"
                                        />
                                    </div>
                                );
                            }

                            const reward = estimateTaskReward(task.estimated_minutes, task.due_date);
                            const overdue = isTaskOverdue(task.due_date);

                            return (
                                <div
                                    key={task.id}
                                    className={`bg-[#2a2a35] p-3 rounded-lg flex items-center justify-between gap-3 border-l-4 ${overdue ? "border-rose-500" : "border-yellow-500"} border-y border-r border-slate-700/60`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <strong className="text-xs text-white block truncate">{task.title}</strong>
                                        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-slate-400 font-semibold">
                                            <span className="uppercase tracking-wide">{task.category}</span>
                                            <span>⏱ {task.estimated_minutes}m</span>
                                            <span className={overdue ? "text-rose-400" : ""}>📅 {formatDate(task.due_date)}</span>
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
                                            <button
                                                onClick={() => setConfirmDeleteId(task.id)}
                                                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[11px] transition"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onCompleteTask(task.id)}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[11px] transition"
                                        >
                                            ✓ Done
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {visibleTasks.length === 0 && (
                            <p className="text-[11px] text-slate-500 text-center py-6 italic">
                                {query
                                    ? "No goals match your search."
                                    : activeTab === "completed"
                                      ? "Nothing completed yet."
                                      : activeTab === "due"
                                        ? "Nothing due right now — you're all caught up!"
                                        : "No goals here. Add one to get started!"}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
