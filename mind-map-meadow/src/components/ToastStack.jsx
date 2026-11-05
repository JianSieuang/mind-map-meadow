import React from "react";
import { Icon } from "./Sprites";
import { PANEL_CLASS } from "./hudStyles";

// Where the stack sits, so it never covers a panel or a primary button:
//  - map: under the stats sign (topPx), on the left, clear of the rail and the panel slot.
//  - panel: a panel fills the top below lg, so only the newest toast shows, in the gap
//    between the panel and the bottom buttons. From lg up it's the same as map.
//  - dashboard: bottom-right, away from the page nav and each page's top button.
const PLACEMENTS = {
    map: "left-4 right-[68px] lg:right-auto lg:w-[360px] top-[var(--toast-top)]",
    panel: "left-4 right-4 bottom-[76px] lg:bottom-auto lg:right-auto lg:w-[360px] lg:top-[var(--toast-top)]",
    dashboard: "left-4 right-4 bottom-4 sm:left-auto sm:w-[360px] sm:items-end",
};

export default function ToastStack({ toasts, topPx, placement = "map" }) {
    if (toasts.length === 0) return null;
    return (
        <div role="status" aria-live="polite" style={{ "--toast-top": `${topPx}px` }} className={`fixed z-50 ${PLACEMENTS[placement]} flex flex-col items-start gap-1.5 pointer-events-none`}>
            {toasts.map((toast, index) => (
                <div key={toast.id} className={`hud-toast-in px-2 py-1.5 max-w-full flex items-center gap-2 ${PANEL_CLASS} ${placement === "panel" && index < toasts.length - 1 ? "hidden lg:flex" : ""}`}>
                    {toast.icon && <Icon name={toast.icon} />}
                    <span className="min-w-0">
                        <span className={`font-pixel text-base leading-tight mr-1.5 ${toast.kind === "error" ? "text-[#9c2f2b]" : ""}`}>{toast.text}</span>{" "}
                        {toast.detail &&<span className="text-xs text-[#6b3f22]">{toast.detail}</span>}
                    </span>
                </div>
            ))}
        </div>
    );
}
