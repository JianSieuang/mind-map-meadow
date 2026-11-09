import React from "react";
import { Icon } from "./Sprites";
import { taskCategoryLabel } from "../utils/taskCategories";
import { COUNT_CHIP_CLASS, HUD_PANEL_CLASS, MUTED_TEXT_CLASS, PANEL_TITLE_CLASS, ROW_CLASS, btn } from "./hudStyles";

export default function AgendaPanel({ tasks, onCompleteTask }) {
    const pendingTasks = tasks.filter((t) => t.status === "pending");

    return (
        <div className={HUD_PANEL_CLASS}>
            <h3 className={PANEL_TITLE_CLASS}>
                <Icon name="tasks" /> Agenda
                {pendingTasks.length > 0 && <span className={COUNT_CHIP_CLASS}>{pendingTasks.length}</span>}
            </h3>
            <div className="flex flex-col">
                {pendingTasks.map((task) => (
                    <div key={task.id} className={ROW_CLASS}>
                        <div className="min-w-0 flex-1">
                            <strong className="text-xs block truncate">{task.title}</strong>
                            <small className={MUTED_TEXT_CLASS}>{taskCategoryLabel(task.category)}</small>
                        </div>
                        <button onClick={() => onCompleteTask(task.id)} className={btn("confirm", "shrink-0")}>
                            Done
                        </button>
                    </div>
                ))}
                {pendingTasks.length === 0 && <p className={`${MUTED_TEXT_CLASS} text-center py-3`}>All clear. Tap the grass to add a task.</p>}
            </div>
        </div>
    );
}
