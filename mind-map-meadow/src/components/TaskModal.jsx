import React from "react";
import TaskForm from "./TaskForm";
import { Icon } from "./Sprites";
import { CLOSE_BTN_CLASS, PANEL_CLASS } from "./hudStyles";

export default function TaskModal({ isOpen, onClose, onCreateTask, rewardPreview, rules }) {
    if (!isOpen) return null;

    const handleSubmit = (values) => {
        onCreateTask(values);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
            <div className={`w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-3 flex flex-col gap-2.5 ${PANEL_CLASS}`}>
                <div className="flex justify-between items-center border-b-2 border-[#cfa877] pb-2">
                    <h3 className="font-pixel text-lg leading-none flex items-center gap-2">
                        <Icon name="tasks" /> Add a task
                    </h3>
                    <button onClick={onClose} aria-label="Close" className={CLOSE_BTN_CLASS}>
                        &times;
                    </button>
                </div>
                <TaskForm onSubmit={handleSubmit} onCancel={onClose} submitLabel="Add task" rewardPreview={rewardPreview} rules={rules} />
            </div>
        </div>
    );
}
