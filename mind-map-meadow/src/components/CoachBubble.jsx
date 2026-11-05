import React, { useLayoutEffect, useState } from "react";
import { PANEL_CLASS, LINK_BTN_CLASS, btn } from "./hudStyles";
import { companionSpriteUrl } from "../utils/sprites";
import { COMPANION_NAME } from "../utils/builder";

// A stepped pixel tail, same outline and fill as the bubble.
function Tail({ left, top }) {
    return (
        <svg viewBox="0 0 12 8" width={12} height={8} shapeRendering="crispEdges" aria-hidden="true" className="fixed z-30 pointer-events-none" style={{ left: left - 6, top: top - 8 }}>
            <path d="M0 0h12v1h-1v2h-1v2h-1v2h-1v1h-4v-1h-1v-2h-1v-2h-1v-2h-1z" fill="#2b1e1a" />
            <path d="M2 1h8v2h-1v2h-1v2h-4v-2h-1v-2h-1z" fill="#f6e6c8" />
        </svg>
    );
}

// The guided-first-day coach. Sits above the bottom buttons it talks about and never
// blocks the game: the map, the buttons and every panel keep working around it. The tail
// is positioned from the target button itself, so it can't point at the wrong thing.
export default function CoachBubble({ message, onAction, onSkip, hideBelowLg }) {
    const { step, of, text, action, secondary, target } = message;
    const [tail, setTail] = useState(null);

    // Runs after every render: buttons in the bottom bar come and go with builder state.
    useLayoutEffect(() => {
        const measure = () => {
            const el = target ? document.querySelector(`[data-coach-target="${target}"]`) : null;
            const rect = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
            setTail((current) => {
                if (!rect) return null;
                const next = { left: Math.round(rect.left + rect.width / 2), top: Math.round(rect.top) };
                return current && current.left === next.left && current.top === next.top ? current : next;
            });
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    });

    return (
        <div className={hideBelowLg ? "hidden lg:block w-full max-w-[360px]" : "block w-full max-w-[360px]"}>
            <div role="status" className={`w-full px-2.5 py-2 flex flex-col gap-1.5 ${PANEL_CLASS}`}>
                <div className="flex items-start gap-2.5">
                    <img src={companionSpriteUrl()} alt={COMPANION_NAME} width={24} height={32} className="shrink-0" style={{ imageRendering: "pixelated" }} />
                    <p className="text-xs leading-snug font-medium">{text}</p>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {step && (
                            <span className="flex gap-1" aria-label={`Step ${step} of ${of}`}>
                                {Array.from({ length: of }, (_, i) => (
                                    <span key={i} className={`w-2 h-2 border border-[#2b1e1a] ${i < step ? "bg-[#e0a526]" : "bg-[#f4efe6]"}`} />
                                ))}
                            </span>
                        )}
                        <button onClick={onSkip} className={LINK_BTN_CLASS}>
                            Skip guide
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {secondary && (
                            <button onClick={() => onAction(secondary.key)} className={btn("muted")}>
                                {secondary.label}
                            </button>
                        )}
                        <button onClick={() => onAction(action.key)} className={btn("next")}>
                            {action.label}
                        </button>
                    </div>
                </div>
            </div>
            {tail && <Tail left={tail.left} top={tail.top} />}
        </div>
    );
}
