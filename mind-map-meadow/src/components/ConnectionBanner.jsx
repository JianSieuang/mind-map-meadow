import React, { useEffect } from "react";
import { PANEL_CLASS, btn } from "./hudStyles";

// While the socket is down nothing may be emitted (it would buffer and replay on
// reconnect), so this also sits over every control and takes focus out of any field.
export default function ConnectionBanner({ lost }) {
    useEffect(() => {
        document.activeElement?.blur?.();
    }, []);

    return (
        <div className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center p-4" aria-live="assertive">
            <div className={`mt-16 px-4 py-3 flex flex-col items-center gap-1 text-center max-w-[320px] ${PANEL_CLASS}`}>
                <span className="font-pixel text-xl leading-none">{lost ? "Connection lost" : "Reconnecting…"}</span>
                <span className="text-xs text-[#6b3f22]">{lost ? "Refresh the page to get back to your town." : "Your town is safe. Actions are paused until you're back."}</span>
                {lost && (
                    <button onClick={() => window.location.reload()} className={btn("next", "mt-1.5")}>
                        Refresh
                    </button>
                )}
            </div>
        </div>
    );
}
