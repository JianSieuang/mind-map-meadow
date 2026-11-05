import React, { useEffect, useRef, useState } from "react";
import { Icon, Stars, WorkerPortrait } from "./Sprites";
import { LINK_BTN_CLASS, PANEL_CLASS, TAG_CLASS, btn } from "./hudStyles";
import { abilityText, rarityStyle, skillText } from "../utils/builder";
import { summonSpriteUrl } from "../utils/sprites";

const SHAKE_MS = 1600;
const SHAKE_PERIOD_START_MS = 620;
const SHAKE_PERIOD_END_MS = 180;
const FLASH_MS = 120;
// How long the rarity word hangs before the card. Normal skips the word entirely.
const RARITY_HOLD_MS = [0, 800, 1100, 1600];
const LEAK_ANGLES = [-68, -38, -14, 12, 34, 62, 118, 158, 202, 244];
const NEUTRAL_LEAK = "#f6e6c8";

function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// The box, with light escaping through its seams. The shake's period shortens from 620ms
// to 180ms and the leaks grow with it, staying at full tilt if the server is slower than
// the ramp. Driven per frame because a CSS animation can't change speed smoothly.
function MysteryBox({ shaking, leakColour }) {
    const boxRef = useRef(null);
    const leaksRef = useRef(null);
    const url = summonSpriteUrl();

    useEffect(() => {
        if (!shaking || prefersReducedMotion()) return undefined;
        const start = performance.now();
        let last = start;
        let phase = 0;
        let frame = requestAnimationFrame(function tick(now) {
            const progress = Math.min(1, (now - start) / SHAKE_MS);
            phase += (now - last) / (SHAKE_PERIOD_START_MS + (SHAKE_PERIOD_END_MS - SHAKE_PERIOD_START_MS) * progress);
            last = now;
            const swing = Math.sin(phase * 2 * Math.PI) * (3 + 6 * progress);
            if (boxRef.current) boxRef.current.style.transform = `rotate(${swing.toFixed(2)}deg) scale(${(1 + 0.08 * progress).toFixed(3)})`;
            if (leaksRef.current) leaksRef.current.style.setProperty("--leak", progress.toFixed(3));
            frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [shaking]);

    return (
        <div className="relative w-24 h-24 flex items-center justify-center">
            {shaking && (
                <div ref={leaksRef} aria-hidden="true" className="absolute left-1/2 top-1/2 pointer-events-none" style={{ "--leak": 0 }}>
                    {LEAK_ANGLES.map((angle, i) => (
                        <span
                            key={angle}
                            className="absolute left-[-3px] bottom-0 w-1.5 origin-bottom transition-colors"
                            style={{
                                height: 70 + (i % 3) * 34,
                                background: leakColour,
                                opacity: "calc(var(--leak) * 0.85)",
                                transform: `rotate(${angle}deg) scaleY(calc(0.25 + var(--leak) * 0.95))`,
                            }}
                        />
                    ))}
                </div>
            )}
            <div ref={boxRef} className="relative">
                {url ? <img src={url} alt="" width={96} height={96} style={{ imageRendering: "pixelated" }} /> : <Icon name="summon" size={48} />}
            </div>
        </div>
    );
}

// Tap to open -> the box shakes faster and leaks light -> white flash -> the rarity word
// (not for Normal) -> the card. The server only hears about it on the tap, so backing out
// of the closed box costs nothing. App mounts a fresh one for each summon.
export default function SummonReveal({ result, onRequest, onClose, onOpenAnother }) {
    const reducedMotion = useRef(prefersReducedMotion()).current;
    const [stage, setStage] = useState("closed"); // closed | shaking | flash | word | reveal
    const [shakeDone, setShakeDone] = useState(false);
    const worker = result?.worker;
    const style = rarityStyle(worker?.rarity);
    const isLegendary = style.rank === 3 && !!worker;

    useEffect(() => {
        if (stage !== "shaking") return undefined;
        const timer = setTimeout(() => setShakeDone(true), reducedMotion ? 0 : SHAKE_MS);
        return () => clearTimeout(timer);
    }, [stage, reducedMotion]);

    useEffect(() => {
        if (stage === "shaking" && shakeDone && result) setStage(reducedMotion ? "reveal" : "flash");
    }, [stage, shakeDone, result, reducedMotion]);

    useEffect(() => {
        if (stage === "flash") {
            const timer = setTimeout(() => setStage(style.rank === 0 ? "reveal" : "word"), FLASH_MS);
            return () => clearTimeout(timer);
        }
        if (stage === "word") {
            const timer = setTimeout(() => setStage("reveal"), RARITY_HOLD_MS[style.rank]);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [stage, style.rank]);

    const openBox = (e) => {
        e.stopPropagation();
        if (onRequest() !== false) setStage("shaking");
    };

    // Tapping the backdrop or Esc jumps ahead; the result is already decided on the server.
    const skipAhead = () => {
        if (result && stage !== "closed") setStage("reveal");
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            if (stage === "closed" || stage === "reveal") onClose();
            else if (result) setStage("reveal");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [stage, result, onClose]);

    const remaining = result?.remaining || 0;
    const showBox = stage === "closed" || stage === "shaking" || stage === "flash";
    const showRays = isLegendary && !reducedMotion && (stage === "word" || stage === "reveal");
    const shakeScreen = isLegendary && !reducedMotion && (stage === "flash" || stage === "word");

    return (
        <div role="dialog" aria-modal="true" aria-label="Mystery summon" onClick={skipAhead} className="fixed inset-0 z-[60] bg-black/85 overflow-hidden select-none">
            <div className={`absolute inset-0 flex items-center justify-center p-4 ${shakeScreen ? "summon-screen-shake" : ""}`}>
                {showRays && (
                    <div
                        aria-hidden="true"
                        className="summon-rays absolute left-1/2 top-1/2 -ml-[75vmax] -mt-[75vmax] w-[150vmax] h-[150vmax] pointer-events-none opacity-30"
                        style={{ background: `repeating-conic-gradient(${style.light} 0deg 12deg, transparent 12deg 30deg)` }}
                    />
                )}

                <div className="relative w-full max-w-[320px] flex flex-col items-center text-center gap-3 text-[#f6e6c8]">
                    {showBox && (
                        <>
                            {stage === "closed" ? (
                                <button autoFocus onClick={openBox} aria-label="Open the summon" className="hud-nudge rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffd65a]">
                                    <MysteryBox shaking={false} />
                                </button>
                            ) : (
                                <MysteryBox shaking leakColour={worker ? style.light : NEUTRAL_LEAK} />
                            )}
                            <p className="font-pixel text-lg leading-none">{stage === "closed" ? "Tap to open" : "Someone's on their way..."}</p>
                            {stage === "closed" && (
                                <button onClick={onClose} className={`${LINK_BTN_CLASS} !text-[#e8c99a] hover:!text-white`}>
                                    Not now
                                </button>
                            )}
                        </>
                    )}

                    {stage === "word" && (
                        <p className="summon-pop font-pixel text-6xl leading-none" style={{ color: style.light }}>
                            {style.label}!
                        </p>
                    )}

                    {stage === "reveal" && worker && (
                        <div className={`summon-pop w-full p-4 flex flex-col items-center gap-2 ${PANEL_CLASS}`}>
                            <WorkerPortrait workerKey={worker.key} rarity={worker.rarity} size={96} />
                            <div className="flex flex-col items-center gap-1">
                                <h2 className={`font-pixel text-2xl leading-none ${style.text}`}>{worker.name}</h2>
                                <span className={`${TAG_CLASS} ${style.chip}`}>{style.label}</span>
                                <Stars count={result.stars ?? worker.stars} className="text-lg leading-none" />
                            </div>
                            <div className="summon-rise w-full flex flex-col gap-1.5 text-left border-t-2 border-[#cfa877] pt-2" style={{ animationDelay: "120ms" }}>
                                <p className="text-xs">
                                    <strong>{worker.skill}.</strong> {skillText(worker.skill)}
                                </p>
                                {worker.ability ? (
                                    <p className="text-xs">
                                        <strong>{worker.ability}.</strong> {abilityText(worker.ability)}
                                    </p>
                                ) : (
                                    <p className="text-xs text-[#6b3f22]">A steady pair of hands.</p>
                                )}
                                {result.isDuplicate && (
                                    <p className="text-xs font-bold text-[#9c2f2b]">
                                        {(result.stars ?? 0) >= 3 ? `Duplicate: another ${worker.name} joined, and stars are maxed.` : `Duplicate: ${worker.name} gained a star!`}
                                    </p>
                                )}
                            </div>
                            <div className="summon-rise flex w-full gap-2 mt-1" style={{ animationDelay: "220ms" }}>
                                {remaining > 0 && (
                                    <button onClick={onClose} className={btn("muted", "flex-1")}>
                                        Later
                                    </button>
                                )}
                                <button autoFocus onClick={remaining > 0 ? onOpenAnother : onClose} className={btn(remaining > 0 ? "next" : "confirm", "flex-1")}>
                                    {remaining > 0 ? (
                                        <>
                                            <Icon name="summon" /> Next ({remaining})
                                        </>
                                    ) : (
                                        "Welcome aboard!"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {stage === "flash" && <div aria-hidden="true" className="absolute inset-0 bg-white pointer-events-none" />}
        </div>
    );
}
