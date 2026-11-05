import React, { useEffect, useState } from "react";
import TownRing from "./TownRing";
import { Icon } from "./Sprites";
import { PANEL_CLASS } from "./hudStyles";

const DURATION_MS = 1500;
const RING_FILL_MS = 800;
const COIN_COUNT = 12;

function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Where the gift has to fly: the rail's summon button, or just off the top if it's hidden.
function giftOffset() {
    const rect = document.querySelector('[data-hud="summon"]')?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
    const y = rect ? rect.top + rect.height / 2 : -24;
    return { gx: `${Math.round(x - window.innerWidth / 2)}px`, gy: `${Math.round(y - window.innerHeight / 2)}px` };
}

// Town level up: the ring fills, coins burst out, and the gift flies off to the rail.
// Purely decorative, so it never takes a click away from the game.
export default function LevelUpBanner({ level, onDone }) {
    const [pct, setPct] = useState(() => (prefersReducedMotion() ? 100 : 0));
    const [gift] = useState(giftOffset);

    useEffect(() => {
        let frame = null;
        if (!prefersReducedMotion()) {
            const start = performance.now();
            const tick = (now) => {
                const next = Math.min(100, Math.round(((now - start) / RING_FILL_MS) * 100));
                setPct(next);
                if (next < 100) frame = requestAnimationFrame(tick);
            };
            frame = requestAnimationFrame(tick);
        }
        const done = setTimeout(onDone, DURATION_MS);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(done);
        };
    }, [onDone]);

    return (
        <div role="status" className="fixed inset-0 z-[55] flex items-center justify-center pointer-events-none overflow-hidden">
            <div className={`hud-banner relative flex items-center gap-3 px-4 py-3 ${PANEL_CLASS}`}>
                <TownRing level={level} pct={pct} size={72} />
                <div className="flex flex-col gap-0.5 pr-1">
                    <span className="font-pixel text-3xl leading-none">Town Lv {level}!</span>
                    <span className="text-xs text-[#6b3f22]">You earned a mystery summon.</span>
                </div>
            </div>
            {Array.from({ length: COIN_COUNT }, (_, i) => {
                const angle = (i / COIN_COUNT) * 2 * Math.PI;
                const reach = 150 + (i % 3) * 45;
                return (
                    <span key={i} className="hud-coin-burst absolute left-1/2 top-1/2" style={{ "--dx": `${Math.round(Math.cos(angle) * reach * 1.3)}px`, "--dy": `${Math.round(Math.sin(angle) * reach)}px`, animationDelay: `${120 + (i % 4) * 40}ms` }}>
                        <Icon name="coin" />
                    </span>
                );
            })}
            <span className="hud-gift-fly absolute left-1/2 top-1/2" style={{ "--gx": gift.gx, "--gy": gift.gy }}>
                <Icon name="summon" size={48} />
            </span>
        </div>
    );
}
