import React, { useState } from "react";
import RecurringTaskForm from "../components/RecurringTaskForm";
import { DeleteButton } from "../components/TaskRow";
import { BuildingThumb, Glyph } from "../components/Sprites";
import { MUTED_TEXT_CLASS, PANEL_CLASS, TAG_CLASS, btn } from "../components/hudStyles";
import { formatTimeRange } from "../utils/duration";
import { localDateKey, dueDateKey } from "../utils/dates";

export default function DailyTasksPage({ recurringTasks, tasks, onAddRecurringTask, onEditRecurringTask, onDeleteRecurringTask, onToggleRecurringTask, onCompleteTask, rewardPreview, rules }) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const todayKey = localDateKey();

    const handleAdd = (values) => {
        onAddRecurringTask(values);
        setIsAdding(false);
    };

    const handleEdit = (id, values) => {
        onEditRecurringTask({ id, ...values });
        setEditingId(null);
    };

    return (
        <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
            <p className="text-xs text-[#e8c99a] leading-relaxed">Plan a habit once and it shows up as a fresh task every day. Each one you finish builds a home, and homes bring more workers.</p>

            {isAdding ? (
                <div className={`p-3 ${PANEL_CLASS}`}>
                    <h3 className="font-pixel text-lg leading-none flex items-center gap-2 mb-2.5">
                        <Glyph name="repeat" /> New daily task
                    </h3>
                    <RecurringTaskForm onSubmit={handleAdd} onCancel={() => setIsAdding(false)} submitLabel="Add daily task" rewardPreview={rewardPreview} rules={rules} />
                </div>
            ) : (
                <button onClick={() => setIsAdding(true)} className={btn("next", "sm:self-start")}>
                    <Glyph name="repeat" /> New daily task
                </button>
            )}

            {recurringTasks.length > 0 && (
                <div className={`px-3 py-1 flex flex-col ${PANEL_CLASS}`}>
                    {recurringTasks.map((template) => {
                        if (editingId === template.id) {
                            return (
                                <div key={template.id} className="py-2.5 border-b-2 border-[#e8c99a] last:border-b-0">
                                    <RecurringTaskForm
                                        initialValues={{
                                            title: template.title,
                                            category: template.category,
                                            start_time: template.start_time,
                                            end_time: template.end_time,
                                        }}
                                        onSubmit={(values) => handleEdit(template.id, values)}
                                        onCancel={() => setEditingId(null)}
                                        submitLabel="Save changes"
                                        rewardPreview={rewardPreview}
                                        rules={rules}
                                    />
                                </div>
                            );
                        }

                        const todayInstance = tasks.find((t) => t.recurring_task_id === template.id && dueDateKey(t.due_date) === todayKey);

                        return (
                            <div key={template.id} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 border-b-2 border-[#e8c99a] last:border-b-0 ${!template.active ? "opacity-70" : ""}`}>
                                <BuildingThumb assetKey="habit_1" size={40} />
                                <div className="min-w-0 flex-1 basis-40">
                                    <strong className="text-xs block truncate">{template.title}</strong>
                                    <div className={`${MUTED_TEXT_CLASS} flex flex-wrap items-center gap-x-2 mt-0.5`}>
                                        <span>{template.category}</span>
                                        <span>{formatTimeRange(template.start_time, template.end_time)}</span>
                                        {!template.active && <span className={`${TAG_CLASS} bg-[#cfa877] text-[#2b1e1a]`}>Paused</span>}
                                    </div>
                                    {template.active && (
                                        <p className="text-xs mt-0.5 font-semibold">
                                            {todayInstance?.status === "completed" ? <span className="text-[#3f7a3a]">Done today</span> : todayInstance ? <span className="text-[#6b3f22]">To do today</span> : <span className="text-[#6b3f22]">Getting today's task ready...</span>}
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5 ml-auto">
                                    <button onClick={() => onToggleRecurringTask({ id: template.id, active: !template.active })} className={btn("muted")}>
                                        {template.active ? "Pause" : "Resume"}
                                    </button>
                                    <button onClick={() => setEditingId(template.id)} className={btn("muted")}>
                                        Edit
                                    </button>
                                    <DeleteButton onDelete={() => onDeleteRecurringTask(template.id)} />
                                    {todayInstance && todayInstance.status === "pending" && (
                                        <button onClick={() => onCompleteTask(todayInstance.id)} className={btn("confirm")}>
                                            Done
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {recurringTasks.length === 0 && !isAdding && <p className="text-xs text-[#e8c99a] text-center py-6">No daily tasks yet. Add one to build a routine.</p>}
        </div>
    );
}
