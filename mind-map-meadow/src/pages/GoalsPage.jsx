import React, { useState } from "react";
import TaskForm from "../components/TaskForm";
import { CompletedTaskRow, PendingTaskRow } from "../components/TaskRow";
import { Coin, Icon } from "../components/Sprites";
import { INPUT_CLASS, PANEL_CLASS, btn } from "../components/hudStyles";
import { isTaskOverdue } from "../utils/rewards";
import { formatMinutes } from "../utils/duration";
import { localDateKey, dueDateKey } from "../utils/dates";

const TABS = [
    { key: "all", label: "All" },
    { key: "due", label: "Due" },
    { key: "Coding", label: "Work & Study" },
    { key: "Fitness", label: "Fitness" },
    { key: "Finance", label: "Finance" },
    { key: "completed", label: "Completed" },
];

const TAB_IDLE_CLASS = "inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-sm border-2 border-[#6b3f22] px-3 py-1 min-h-11 lg:min-h-8 text-xs font-bold text-[#e8c99a] hover:text-[#f6e6c8] transition-colors";

const NON_CATEGORY_TABS = ["all", "due", "completed"];

function formatDate(dueDate) {
    return typeof dueDate === "string" ? dueDate.slice(0, 10) : "";
}

// Overdue or due today — the tasks that need attention right now
function isDueOrOverdue(task) {
    const key = dueDateKey(task.due_date);
    return key !== "" && key <= localDateKey();
}

export default function GoalsPage({ tasks, onAddTask, onEditTask, onDeleteTask, onCompleteTask, rewardPreview, rules }) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    const oneOffTasks = tasks.filter((t) => !t.recurring_task_id);
    const pendingAll = [...oneOffTasks.filter((t) => t.status === "pending")].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const completedAll = [...oneOffTasks.filter((t) => t.status === "completed")].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

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

    const defaultAddCategory = NON_CATEGORY_TABS.includes(activeTab) ? "Coding" : activeTab;

    return (
        <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
            {isAdding ? (
                <div className={`p-3 ${PANEL_CLASS}`}>
                    <h3 className="font-pixel text-lg leading-none flex items-center gap-2 mb-2.5">
                        <Icon name="tasks" /> New task
                    </h3>
                    <TaskForm initialValues={{ category: defaultAddCategory }} onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Add task" rewardPreview={rewardPreview} rules={rules} />
                </div>
            ) : (
                <button onClick={() => setIsAdding(true)} className={btn("next", "sm:self-start")}>
                    <Icon name="tasks" /> New task
                </button>
            )}

            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks..." aria-label="Search tasks" className={INPUT_CLASS} />

            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {TABS.map((tab) => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} aria-pressed={activeTab === tab.key} className={activeTab === tab.key ? btn("muted", "whitespace-nowrap shrink-0 !bg-[#f6e6c8]") : TAB_IDLE_CLASS}>
                        {tab.label} <span className="font-pixel text-sm leading-none">{countFor(tab.key)}</span>
                    </button>
                ))}
            </div>

            {visibleTasks.length > 0 ? (
                <div className={`px-3 py-1 flex flex-col ${PANEL_CLASS}`}>
                    {visibleTasks.map((task) => {
                        if (activeTab === "completed") {
                            return <CompletedTaskRow key={task.id} task={task} onDelete={() => onDeleteTask(task.id)} />;
                        }

                        if (editingId === task.id) {
                            return (
                                <div key={task.id} className="py-2.5 border-b-2 border-[#e8c99a] last:border-b-0">
                                    <TaskForm
                                        initialValues={{
                                            title: task.title,
                                            category: task.category,
                                            due_date: formatDate(task.due_date),
                                            estimated_minutes: task.estimated_minutes,
                                        }}
                                        onSubmit={(values) => handleEdit(task.id, values)}
                                        onCancel={() => setEditingId(null)}
                                        submitLabel="Save changes"
                                        rewardPreview={rewardPreview}
                                        rules={rules}
                                    />
                                </div>
                            );
                        }

                        const overdue = isTaskOverdue(task.due_date);

                        return (
                            <PendingTaskRow
                                key={task.id}
                                task={task}
                                meta={
                                    <>
                                        <span>{formatMinutes(task.estimated_minutes)}</span>
                                        <span className={overdue ? "font-bold text-[#9c2f2b]" : ""}>{overdue ? `Overdue: ${formatDate(task.due_date)}` : formatDate(task.due_date)}</span>
                                        {rewardPreview?.chip && (
                                            <span className="flex items-center gap-1">
                                                <Coin /> <span className="font-pixel text-sm leading-none text-[#2b1e1a]">{rewardPreview.chip}</span>
                                            </span>
                                        )}
                                    </>
                                }
                                onEdit={() => setEditingId(task.id)}
                                onDelete={() => onDeleteTask(task.id)}
                                onComplete={() => onCompleteTask(task.id)}
                            />
                        );
                    })}
                </div>
            ) : (
                <p className="text-xs text-[#e8c99a] text-center py-6">
                    {query
                        ? "No tasks match your search."
                        : activeTab === "completed"
                          ? "Nothing completed yet."
                          : activeTab === "due"
                            ? "Nothing due right now. You're all caught up."
                            : "No tasks here. Add one to get started."}
                </p>
            )}
        </div>
    );
}
