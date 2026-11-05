import React from "react";
import { BuildingThumb, Coin, Icon, PixelBar } from "./Sprites";
import { CLOSE_BTN_CLASS, MUTED_TEXT_CLASS, PANEL_CLASS, SEGMENT_GROUP_CLASS, TAG_CLASS, btn, segment } from "./hudStyles";
import { formatCents } from "../utils/money";
import { buildingName, formatRate, formatSpeed, lineLabel, mergeInfo, nextCoinText, savingsStage, storedMilliNow } from "../utils/builder";

const STAFF_MODES = [
    { key: "auto", label: "Auto", hint: "Gets a worker when one's free." },
    { key: "priority", label: "Priority", hint: "First in line for a worker." },
    { key: "off", label: "Off", hint: "No worker here for now." },
];

function workerLine(building, workers) {
    if (!building.staffed) return null;
    const named = (workers?.summoned || []).find((w) => w.id === building.workerId);
    return `${named ? named.name : "Villager"} · ${formatSpeed(building.speedBp)}`;
}

function idleReason(building, sleepy) {
    if (!building.insideZone) return "Outside your land. Move it in or expand to put it to work.";
    if (building.staffMode === "off") return "Staffing is off.";
    if (!building.staffed) return "No worker free. Homes and summons bring more.";
    if (sleepy) return "Your town is napping. A finished task wakes it up.";
    return null;
}

function Producer({ building, builder, clock, onCollect, onSetStaffMode }) {
    const stored = storedMilliNow(building, builder, clock);
    const coins = Math.floor(stored / 1000);
    const pct = building.capMilli ? Math.min(100, Math.round((stored / building.capMilli) * 100)) : 0;
    const worker = workerLine(building, builder?.workers);
    const reason = idleReason(building, builder?.sleepy);
    const mode = STAFF_MODES.find((m) => m.key === building.staffMode) || STAFF_MODES[0];

    return (
        <>
            {worker && (
                <p className="text-xs flex items-center gap-1.5">
                    <Icon name="workers" /> {worker}
                </p>
            )}
            {reason && <p className="text-xs font-semibold text-[#9c2f2b]">{reason}</p>}

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                        <Coin />
                        <span className="font-pixel text-base leading-none">{coins}</span>
                        <span className="font-pixel text-sm leading-none text-[#6b3f22]">/ {Math.floor((building.capMilli || 0) / 1000)}</span>
                    </span>
                    <span className={MUTED_TEXT_CLASS}>{building.rateMilliPerHour > 0 ? `${formatRate(building.rateMilliPerHour)} · ${nextCoinText(stored, building)}` : ""}</span>
                </div>
                <PixelBar pct={pct} />
            </div>

            <div>
                <div className={`${SEGMENT_GROUP_CLASS} grid-cols-3`} role="group" aria-label="Staffing">
                    {STAFF_MODES.map((m) => (
                        <button key={m.key} onClick={() => onSetStaffMode(building.id, m.key)} aria-pressed={building.staffMode === m.key} className={segment(building.staffMode === m.key)}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <p className={`${MUTED_TEXT_CLASS} mt-1`}>{mode.hint}</p>
            </div>

            <button onClick={() => onCollect(building.id)} disabled={coins < 1} className={btn("next")}>
                {coins >= 1 ? (
                    <>
                        <Icon name="collect" /> Collect <span className="font-pixel text-sm leading-none">{coins}</span> {coins === 1 ? "coin" : "coins"}
                    </>
                ) : (
                    "Nothing to collect yet"
                )}
            </button>
        </>
    );
}

function MergeHint({ building, builder }) {
    const info = mergeInfo(building, builder);
    if (!info) return null;
    const name = buildingName(building, builder.rules);
    return (
        <p className={MUTED_TEXT_CLASS}>
            Drag onto another {name} to merge for {info.cost} coins
            {info.levelOk ? "." : ` (Town Lv ${info.townLevel}).`}
        </p>
    );
}

// Everything is rendered from plain data as text, so nothing here can inject markup.
// readOnly is a friend's visit: their rows carry no storage or staffing, and no actions show.
export default function BuildingCard({ building, builder, clock, readOnly, hostName, goal, sourceTask, onClose, onCollect, onSetStaffMode }) {
    const name = buildingName(building, builder?.rules);
    const isSavings = building.kind === "savings" || building.asset_key === "savings_project";
    const stage = isSavings ? savingsStage(building) : null;
    const isHome = building.line === "habit";

    const subtitle = [building.level ? `Lv ${building.level}` : null, lineLabel(building.line) || null, stage != null ? `Stage ${stage}/4` : null].filter(Boolean).join(" · ");

    return (
        <div className={`fixed z-30 left-4 right-[68px] ${readOnly ? "bottom-6" : "bottom-[76px]"} lg:left-6 lg:right-auto lg:bottom-6 lg:w-[300px] max-h-[calc(100dvh-16rem)] overflow-y-auto p-3 flex flex-col gap-2.5 select-text ${PANEL_CLASS}`}>
            <div className="flex items-start gap-2.5">
                <BuildingThumb building={building} size={48} />
                <div className="min-w-0 flex-1">
                    <h3 className="font-pixel text-lg leading-tight truncate">{isSavings && goal ? goal.title : name}</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {subtitle && <span className={MUTED_TEXT_CLASS}>{subtitle}</span>}
                        {building.heritage && <span className={`${TAG_CLASS} bg-[#e0a526] text-[#2b1e1a]`}>Heritage</span>}
                    </div>
                </div>
                <button onClick={onClose} aria-label="Close" className={CLOSE_BTN_CLASS}>
                    &times;
                </button>
            </div>

            {readOnly ? (
                <p className={MUTED_TEXT_CLASS}>Part of {hostName || "a friend"}'s meadow.</p>
            ) : (
                <>
                    {sourceTask && <p className={`${MUTED_TEXT_CLASS} truncate`}>From: {sourceTask.title}</p>}
                    {building.needsWorker && <Producer building={building} builder={builder} clock={clock} onCollect={onCollect} onSetStaffMode={onSetStaffMode} />}
                    {isHome && <p className="text-xs">{building.insideZone ? `${building.beds} ${building.beds === 1 ? "bed" : "beds"}, so ${building.beds === 1 ? "one more worker" : `${building.beds} more workers`} for your town.` : "Outside your land. Move it in or expand so its beds count."}</p>}
                    {isSavings && goal && (
                        <p className="text-xs">
                            <span className="font-pixel text-sm">{formatCents(goal.saved_cents)}</span> of <span className="font-pixel text-sm">{formatCents(goal.target_cents)}</span> saved
                        </p>
                    )}
                    {building.kind === "decoration" && <p className={MUTED_TEXT_CLASS}>Just here to look nice.</p>}
                    {building.kind === "legacy" && <p className={MUTED_TEXT_CLASS}>A keepsake from your town's early days.</p>}
                    <MergeHint building={building} builder={builder} />
                </>
            )}
        </div>
    );
}
