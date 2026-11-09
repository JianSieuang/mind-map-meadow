import React, { useEffect, useState } from "react";
import { CLOSE_BTN_CLASS, LINK_BTN_CLASS, MUTED_TEXT_CLASS, PANEL_CLASS, SECTION_TITLE_CLASS, btn } from "./hudStyles";
import { DEFAULT_BINDINGS, KEY_ACTIONS, isBindable, keyLabel } from "../../server/keybindings.js";

const GROUPS = ["Move", "Open", "Do"];

// A key cap: the same parchment button look, small and square-ish.
const keyCap = (active) =>
    `min-w-11 lg:min-w-9 min-h-11 lg:min-h-8 px-2 rounded-sm border-2 border-[#2b1e1a] font-pixel text-sm leading-none shadow-[0_2px_0_#2b1e1a] transition-colors ${
        active ? "bg-[#e0a526] animate-pulse" : "bg-[#f4efe6] hover:bg-[#ffd65a]"
    }`;

// Lists every shortcut; click a key, press a new one. A key already in use swaps places.
// Changes save straight away (onChange) and follow the account to other devices.
export default function ShortcutsModal({ bindings, onChange, onClose }) {
    const [listening, setListening] = useState(null); // action id waiting for a key
    const [note, setNote] = useState(null);

    useEffect(() => {
        const onKeyDown = (e) => {
            // Runs before the app's own shortcuts (capture phase) and keeps them from firing.
            e.stopPropagation();
            if (!listening) {
                if (e.key === "Escape") onClose(); // Tab, Enter and Space still work on the buttons
                return;
            }
            e.preventDefault();
            if (e.key === "Escape") {
                setListening(null);
                setNote(null);
                return;
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (!isBindable(e.code)) {
                setNote(`${e.key === " " ? "Space" : e.key} can't be used. Letters, numbers and punctuation work.`);
                return;
            }
            const next = { ...bindings };
            const taken = KEY_ACTIONS.find((a) => a.id !== listening && next[a.id] === e.code);
            if (taken) next[taken.id] = next[listening];
            next[listening] = e.code;
            setNote(taken ? `${keyLabel(e.code)} was on "${taken.label}", which now uses ${keyLabel(next[taken.id])}.` : null);
            setListening(null);
            onChange(next);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [listening, bindings, onChange, onClose]);

    const isDefault = KEY_ACTIONS.every((a) => bindings[a.id] === DEFAULT_BINDINGS[a.id]);

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50" onMouseDown={onClose}>
            <div className={`w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-3 flex flex-col gap-3 ${PANEL_CLASS}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
                <div className="flex justify-between items-center">
                    <h3 className="font-pixel text-lg leading-none">Keyboard shortcuts</h3>
                    <button onClick={onClose} aria-label="Close" className={CLOSE_BTN_CLASS}>
                        &times;
                    </button>
                </div>
                <p className={MUTED_TEXT_CLASS}>Click a key, then press the one you want. Shortcuts never fire while you're typing.</p>

                {GROUPS.map((group) => (
                    <div key={group} className="flex flex-col gap-1">
                        <h4 className={SECTION_TITLE_CLASS}>{group}</h4>
                        {KEY_ACTIONS.filter((a) => a.group === group).map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2 py-0.5">
                                <span className="text-xs font-semibold">{a.label}</span>
                                <button onClick={() => (setListening(a.id), setNote(null))} aria-label={`${a.label}: ${keyLabel(bindings[a.id])}. Click to change`} className={keyCap(listening === a.id)}>
                                    {listening === a.id ? "…" : keyLabel(bindings[a.id])}
                                </button>
                            </div>
                        ))}
                    </div>
                ))}

                <div className="flex flex-col gap-1">
                    <h4 className={SECTION_TITLE_CLASS}>Always</h4>
                    <p className={MUTED_TEXT_CLASS}>Arrow keys walk · Esc or right-click goes back · Enter saves a form</p>
                </div>

                {listening && <p className="text-xs font-semibold">Press a key for “{KEY_ACTIONS.find((a) => a.id === listening).label}”, or Esc to cancel.</p>}
                {note && <p className="text-xs font-semibold text-[#6b3f22]">{note}</p>}

                <div className="flex items-center justify-between">
                    <button onClick={() => (onChange({ ...DEFAULT_BINDINGS }), setNote(null))} disabled={isDefault} className={`${LINK_BTN_CLASS} disabled:opacity-50 disabled:no-underline`}>
                        Reset to defaults
                    </button>
                    <button onClick={onClose} className={btn("confirm")}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
