import React, { useEffect, useRef, useState } from "react";
import TownRing from "./TownRing";
import { Icon } from "./Sprites";
import { PANEL_CLASS, btn } from "./hudStyles";
import { expandStatus, formatCoins, townProgress } from "../utils/builder";

function Stat({ icon, value, label, title, className = "flex" }) {
    return (
        <span className={`${className} items-center gap-0.5 whitespace-nowrap`} title={title}>
            <Icon name={icon} />
            <span className="font-pixel text-sm leading-none">{value}</span>
            {label && <span className="hidden xl:inline text-xs text-[#6b3f22] ml-0.5">{label}</span>}
        </span>
    );
}

// Always-visible town sign: level and coins first, everything else quieter. Tapping it
// opens Profile, where each number is spelled out. Workers and today's buildings only
// appear once they mean something (see hudReveal).
export default function BuilderHud({ builder, reveal, onOpenProfile, leaveRoomForMapToggle }) {
    const progress = townProgress(builder.town);
    const counts = builder.today_counts || {};
    const workers = builder.workers || {};
    const pool = builder.pool || {};

    return (
        <>
            <button
                onClick={onOpenProfile}
                aria-label={`Town level ${progress.level}, ${builder.coins} coins. Open profile.`}
                className={`pointer-events-auto flex items-center gap-1.5 lg:gap-2.5 pl-1 pr-2 py-0.5 hover:bg-[#f4efe6] transition-colors ${PANEL_CLASS} ${leaveRoomForMapToggle ? "ml-[52px] max-w-[calc(100%-52px)]" : "max-w-full"}`}
            >
                <TownRing level={progress.level} pct={progress.pct} size={40} />
                <span className="flex items-center gap-1 whitespace-nowrap" title={`${builder.coins} coins`}>
                    <Icon name="coin" />
                    <span className="font-pixel text-lg leading-none">{formatCoins(builder.coins)}</span>
                </span>
                {(reveal.workers || reveal.today) && <span aria-hidden="true" className="w-0.5 h-6 bg-[#cfa877]" />}
                {reveal.workers && <Stat icon="workers" value={`${workers.used ?? 0}/${workers.total ?? 0}`} label="workers" title="Workers busy / total" />}
                {/* A phone has room beside the rail for only so much; Profile spells this one out. */}
                {reveal.today && <Stat icon="inventory" value={`${counts.buildings ?? 0}/${counts.buildingCap ?? 0}`} label="today" title="Buildings earned today" className="hidden min-[420px]:flex" />}
                {pool.count > 0 && (
                    <span className="hidden sm:inline text-xs text-[#6b3f22] whitespace-nowrap" title="Buildings waiting for a later day">
                        +<span className="font-pixel text-sm text-[#2b1e1a]">{pool.count}</span> waiting
                    </span>
                )}
            </button>
            {builder.sleepy && <div className={`pointer-events-auto px-2.5 py-1.5 text-xs ${PANEL_CLASS}`}>Your town is napping. Finish a task or log some money to wake it.</div>}
        </>
    );
}

// Bottom-row builder actions. Only the single most useful one is amber.
export function BuilderActions({ builder, collectTotal, coachTarget, showExpand, hideBelowLg, onOpenInventory, onCollectAll, onExpand, onExpandBlocked }) {
    const inventoryCount = (builder.inventory || []).length;
    const hasProducers = (builder.placed || []).some((b) => b.needsWorker);
    const expand = showExpand ? expandStatus(builder) : null;

    // Expanding spends a real chunk of coins, so it asks once before it goes through.
    const [confirmingExpand, setConfirmingExpand] = useState(false);
    const confirmTimer = useRef(null);
    useEffect(() => () => clearTimeout(confirmTimer.current), []);

    const primary = inventoryCount > 0 ? "place" : collectTotal > 0 ? "collect" : expand?.ready ? "expand" : null;
    const toneFor = (key) => (primary === key || coachTarget === key ? "next" : "muted");
    const nudge = (key) => (coachTarget === key ? "hud-nudge" : "");

    const handleExpandClick = () => {
        if (!expand.ready) {
            onExpandBlocked(expand.why);
            return;
        }
        if (!confirmingExpand) {
            setConfirmingExpand(true);
            clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => setConfirmingExpand(false), 3500);
            return;
        }
        clearTimeout(confirmTimer.current);
        setConfirmingExpand(false);
        onExpand();
    };

    if (inventoryCount === 0 && !hasProducers && !expand) return null;

    return (
        <div className={`${hideBelowLg ? "hidden lg:flex" : "flex"} flex-wrap items-stretch justify-center gap-2 max-w-full`}>
            {inventoryCount > 0 && (
                <button onClick={onOpenInventory} data-coach-target="place" className={btn(toneFor("place"), `whitespace-nowrap ${nudge("place")}`)}>
                    <Icon name="inventory" /> Place <span className="font-pixel text-sm leading-none">{inventoryCount}</span>
                </button>
            )}

            {hasProducers && (
                <button onClick={onCollectAll} disabled={collectTotal < 1} data-coach-target="collect" className={btn(toneFor("collect"), `whitespace-nowrap ${nudge("collect")}`)}>
                    <Icon name="collect" /> Collect<span className="hidden sm:inline"> all</span>
                    {collectTotal > 0 && <span className="font-pixel text-sm leading-none">{formatCoins(collectTotal)}</span>}
                </button>
            )}

            {expand && (
                <button onClick={handleExpandClick} aria-disabled={!expand.ready} title={expand.why || "Unlock more land"} className={btn(confirmingExpand ? "confirm" : toneFor("expand"), "!justify-start text-left")}>
                    {!confirmingExpand && <Icon name="expand" />}
                    {confirmingExpand ? (
                        <span className="whitespace-nowrap">Spend {expand.next.cost} coins?</span>
                    ) : (
                        <span className="flex flex-col leading-tight">
                            <span className="whitespace-nowrap">Expand</span>
                            <span className="text-xs font-semibold whitespace-nowrap">
                                <span className={expand.levelOk ? "" : "text-[#9c2f2b]"}>Lv {expand.next.townLevel}</span>
                                <span> + </span>
                                <span className={expand.coinsOk ? "" : "text-[#9c2f2b]"}>{expand.next.cost} coins</span>
                            </span>
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}
