import React from "react";
import TaskForm from "./TaskForm";

export default function TaskModal({ isOpen, onClose, onCreateTask }) {
    if (!isOpen) return null;

    const handleSubmit = (values) => {
        onCreateTask(values);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity">
            <div className="bg-[#2a2a35] w-[380px] p-5 rounded-xl border border-slate-600 shadow-2xl flex flex-col gap-3.5">
                <div className="flex justify-between items-center border-b border-slate-700 pb-1.5">
                    <h3 className="text-sm font-bold text-white">📝 Add New Goal</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white font-bold text-base px-1">
                        &times;
                    </button>
                </div>
                <TaskForm onSubmit={handleSubmit} onCancel={onClose} submitLabel="Log to Database" />
            </div>
        </div>
    );
}
