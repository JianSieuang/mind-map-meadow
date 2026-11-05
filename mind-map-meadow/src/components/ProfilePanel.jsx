import React from "react";
import TownRing from "./TownRing";
import { Icon, PixelBar } from "./Sprites";
import { HUD_PANEL_CLASS, LINK_BTN_CLASS, MUTED_TEXT_CLASS, SECTION_TITLE_CLASS } from "./hudStyles";
import { COMPANION_NAME, townProgress } from "../utils/builder";
import { companionSpriteUrl } from "../utils/sprites";

function TodayRow({ label, value }) {
    return (
        <div className="flex items-center justify-between">
            <span className={MUTED_TEXT_CLASS}>{label}</span>
            <span className="font-pixel text-sm leading-none">{value}</span>
        </div>
    );
}

export default function ProfilePanel({ stats, builder, aiThought, user, onLogout, onReplayGuide }) {
    const progress = townProgress(builder?.town);
    const coins = builder?.coins ?? stats.coins ?? 0;
    const counts = builder?.today_counts;
    const workers = builder?.workers;
    const pool = builder?.pool;

    return (
        <div className={HUD_PANEL_CLASS}>
            {/* Town level and coins: the two numbers everything else feeds */}
            <div className="flex items-center gap-3">
                <TownRing level={progress.level} pct={progress.pct} size={72} />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <h3 className="font-pixel text-lg leading-none">Town Lv {progress.level}</h3>
                    <PixelBar pct={progress.pct} />
                    <p className={MUTED_TEXT_CLASS}>
                        {progress.into} / {progress.span} XP
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-1.5 border-y-2 border-[#cfa877] py-1.5">
                <Icon name="coin" />
                <span className="font-pixel text-2xl leading-none">{coins}</span>
                <span className={MUTED_TEXT_CLASS}>coins</span>
            </div>

            {/* The companion, in their own voice */}
            <div className="flex items-start gap-2">
                <img src={companionSpriteUrl()} alt="" width={24} height={32} className="shrink-0" style={{ imageRendering: "pixelated" }} />
                <div className="min-w-0 flex-1 bg-[#f4efe6] border-2 border-[#cfa877] rounded-sm px-2 py-1.5">
                    <h4 className={`${SECTION_TITLE_CLASS} mb-1`}>{COMPANION_NAME}</h4>
                    <p className="text-xs leading-relaxed">{aiThought || `${COMPANION_NAME} is wandering the meadow.`}</p>
                </div>
            </div>

            {/* Today's numbers, spelled out for what the sign shows as bare icons */}
            {counts && (
                <div className="flex flex-col gap-1.5">
                    <h4 className={SECTION_TITLE_CLASS}>Today</h4>
                    <TodayRow label="Buildings earned" value={`${counts.buildings}/${counts.buildingCap}`} />
                    <TodayRow label="Tasks paid" value={`${counts.tasksPaid}/${counts.tasksPaidCap}`} />
                    <TodayRow label="Logs paid" value={`${counts.logsPaid}/${counts.logsPaidCap}`} />
                    {workers && <TodayRow label="Workers busy" value={`${workers.used}/${workers.total}`} />}
                    {pool?.count > 0 && <TodayRow label="Buildings waiting" value={`${pool.count}/${pool.max}`} />}
                </div>
            )}

            {/* Signed-in account, last because it's the least used */}
            <div className="flex flex-col gap-1 border-t-2 border-[#cfa877] pt-2">
                {user && (
                    <div className="flex items-center gap-2 min-w-0">
                        {user.avatarUrl && <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-sm border border-[#2b1e1a] shrink-0" />}
                        <span className="text-xs truncate">{user.name || user.email}</span>
                    </div>
                )}
                <div className="flex items-center justify-between">
                    {builder?.tutorial ? (
                        <button onClick={onReplayGuide} className={LINK_BTN_CLASS}>
                            Replay guide
                        </button>
                    ) : (
                        <span />
                    )}
                    {user && (
                        <button onClick={onLogout} className={LINK_BTN_CLASS}>
                            Log out
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
