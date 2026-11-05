import React, { useEffect, useRef, useState } from "react";
import { BuildingThumb, Coin } from "./Sprites";
import { MUTED_TEXT_CLASS, btn } from "./hudStyles";
import { lineForCategory } from "../utils/rewards";

// Delete asks once, then forgets if you don't confirm.
export function useConfirmDelete(onDelete) {
    const [confirming, setConfirming] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    return {
        confirming,
        press: () => {
            clearTimeout(timer.current);
            if (confirming) {
                setConfirming(false);
                onDelete();
                return;
            }
            setConfirming(true);
            timer.current = setTimeout(() => setConfirming(false), 3500);
        },
    };
}

export function DeleteButton({ onDelete, label = "Delete" }) {
    const { confirming, press } = useConfirmDelete(onDelete);
    return (
        <button onClick={press} className={btn("danger", "shrink-0")}>
            {confirming ? "Really?" : label}
        </button>
    );
}

// A task with the building it'll become. meta is whatever belongs on the second line.
export function PendingTaskRow({ task, meta, onEdit, onDelete, onComplete }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 border-b-2 border-[#e8c99a] last:border-b-0">
            <BuildingThumb assetKey={`${lineForCategory(task.category)}_1`} size={40} />
            <div className="min-w-0 flex-1 basis-40">
                <strong className="text-xs block truncate">{task.title}</strong>
                <div className={`${MUTED_TEXT_CLASS} flex flex-wrap items-center gap-x-2 mt-0.5`}>
                    <span>{task.category}</span>
                    {meta}
                </div>
            </div>
            <div className="flex gap-1.5 shrink-0 ml-auto">
                <button onClick={onEdit} className={btn("muted")}>
                    Edit
                </button>
                <DeleteButton onDelete={onDelete} />
                <button onClick={onComplete} className={btn("confirm")}>
                    Done
                </button>
            </div>
        </div>
    );
}

export function CompletedTaskRow({ task, onDelete }) {
    return (
        <div className="flex items-center gap-2.5 py-2 border-b-2 border-[#e8c99a] last:border-b-0">
            <div className="min-w-0 flex-1">
                <strong className="text-xs text-[#6b3f22] block truncate line-through">{task.title}</strong>
                <div className={`${MUTED_TEXT_CLASS} flex items-center gap-2 mt-0.5`}>
                    <span>{task.category}</span>
                    <span className="flex items-center gap-1">
                        <Coin /> <span className="font-pixel text-sm leading-none text-[#2b1e1a]">+{task.coins_earned}</span>
                    </span>
                </div>
            </div>
            {onDelete && <DeleteButton onDelete={onDelete} />}
        </div>
    );
}
