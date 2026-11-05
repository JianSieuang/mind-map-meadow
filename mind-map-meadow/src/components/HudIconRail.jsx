import React from "react";
import { Icon } from "./Sprites";
import { btn } from "./hudStyles";

function RailButton({ icon, title, active, badge, attention, hudKey, onClick }) {
    const tone = attention ? "next" : active ? "pressed" : "muted";
    return (
        <button onClick={onClick} title={title} aria-label={title} aria-pressed={active} data-hud={hudKey} className={btn(tone, "relative !p-0 w-11 h-11 lg:w-12 lg:h-12")}>
            <Icon name={icon} />
            {badge > 0 && <span className="font-pixel absolute -top-2 -right-2 bg-[#2b1e1a] text-[#ffd65a] text-xs min-w-5 h-5 px-1 rounded-sm flex items-center justify-center leading-none">{badge}</span>}
        </button>
    );
}

// activePanel is the one open panel, or null. showBuilder is false while touring a
// friend's meadow, since inventory, workers and summons are all about your own town.
// showWorkers and showFriends wait until they mean something (see hudReveal).
export default function HudIconRail({ activePanel, onTogglePanel, pendingCount, friendRequestCount, inventoryCount, summonCount, showBuilder, showWorkers, showFriends, onSummon }) {
    return (
        <div className="fixed top-4 right-4 lg:top-6 lg:right-6 z-30 flex flex-col gap-2 lg:gap-3">
            <RailButton icon="profile" title="Profile" active={activePanel === "profile"} onClick={() => onTogglePanel("profile")} />
            <RailButton icon="tasks" title="Agenda" active={activePanel === "agenda"} badge={pendingCount} onClick={() => onTogglePanel("agenda")} />
            {showBuilder && <RailButton icon="inventory" title="Inventory" active={activePanel === "inventory"} badge={inventoryCount} onClick={() => onTogglePanel("inventory")} />}
            {showBuilder && showWorkers && <RailButton icon="workers" title="Workers" active={activePanel === "workers"} onClick={() => onTogglePanel("workers")} />}
            {showFriends && <RailButton icon="friends" title="Friends" active={activePanel === "friends"} badge={friendRequestCount} onClick={() => onTogglePanel("friends")} />}
            {showBuilder && summonCount > 0 && <RailButton icon="summon" title={`Summon (${summonCount})`} badge={summonCount} attention hudKey="summon" onClick={onSummon} />}
        </div>
    );
}
