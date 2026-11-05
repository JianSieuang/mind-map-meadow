import React from "react";
import { Icon, Stars, WorkerPortrait } from "./Sprites";
import { COUNT_CHIP_CLASS, HUD_PANEL_CLASS, INPUT_CLASS, MUTED_TEXT_CLASS, PANEL_TITLE_CLASS, btn } from "./hudStyles";
import { abilityText, buildingLabels, rarityOdds, rarityStyle, skillText } from "../utils/builder";

function WorkerRow({ worker, working, labels, assignable, onAssign }) {
    const style = rarityStyle(worker.rarity);
    const pinnedHere = assignable.some((b) => b.id === worker.assignedBuildingId) ? worker.assignedBuildingId : "";
    const detail = abilityText(worker.ability) || skillText(worker.skill);

    return (
        <div className="py-2 flex flex-col gap-1.5 border-b-2 border-[#e8c99a] last:border-b-0">
            <div className="flex items-center gap-2">
                <WorkerPortrait workerKey={worker.key} rarity={worker.rarity} size={36} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <strong className={`font-pixel text-sm leading-none truncate ${style.text}`}>{worker.name}</strong>
                        <Stars count={worker.stars} className="text-xs shrink-0" />
                    </div>
                    <p className={`${MUTED_TEXT_CLASS} truncate`}>
                        {style.label} · {worker.skill}
                    </p>
                </div>
            </div>
            {detail && <p className="text-xs">{worker.ability ? `${worker.ability}: ${detail}` : detail}</p>}
            <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold flex-1 min-w-0 truncate ${working ? "text-[#3f7a3a]" : "text-[#6b3f22]"}`}>{working ? `At ${labels[working.id]}` : "Resting"}</span>
                <select aria-label={`Assign ${worker.name}`} value={pinnedHere} disabled={assignable.length === 0} onChange={(e) => onAssign(worker.id, e.target.value === "" ? null : Number(e.target.value))} className={`${INPUT_CLASS} !w-[124px] shrink-0 !px-1`}>
                    <option value="">Auto</option>
                    {assignable.map((b) => (
                        <option key={b.id} value={b.id}>
                            {labels[b.id]}
                            {b.staffMode === "off" ? " (off)" : ""}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

export default function WorkersPanel({ builder, onSummon, onAssign }) {
    const rules = builder.rules || {};
    const workers = builder.workers || {};
    const placed = builder.placed || [];
    const summoned = [...(workers.summoned || [])].sort((a, b) => rarityStyle(b.rarity).rank - rarityStyle(a.rarity).rank || a.id - b.id);
    const pending = workers.pendingSummons || 0;
    const villagers = Math.max(0, (workers.total || 0) - summoned.length);

    const labels = buildingLabels(placed, rules);
    const assignable = placed.filter((b) => b.needsWorker && b.insideZone);
    const odds = rarityOdds(rules);

    return (
        <div className={HUD_PANEL_CLASS}>
            <h3 className={PANEL_TITLE_CLASS}>
                <Icon name="workers" /> Workers
                <span className={COUNT_CHIP_CLASS}>
                    {workers.used ?? 0}/{workers.total ?? 0} busy
                </span>
            </h3>

            <button onClick={onSummon} disabled={pending === 0} className={btn(pending > 0 ? "next" : "muted")}>
                <Icon name="summon" /> {pending > 0 ? `Open summon (${pending})` : "No summons yet"}
            </button>

            <div className={`${MUTED_TEXT_CLASS} leading-relaxed`}>
                {pending === 0 && <p>Every new town level brings one.</p>}
                {odds.length > 0 && <p>{odds.map((o) => `${o.label} ${o.pct}%`).join(" · ")}</p>}
                {workers.pityIn === 1 && <p>Your next summon is Epic or better.</p>}
                {workers.pityIn > 1 && (
                    <p>
                        Epic or better within <strong className="font-pixel text-sm text-[#2b1e1a]">{workers.pityIn}</strong> summons.
                    </p>
                )}
            </div>

            <div className="flex flex-col">
                {summoned.map((worker) => (
                    <WorkerRow key={worker.id} worker={worker} working={placed.find((b) => b.id === worker.buildingId)} labels={labels} assignable={assignable} onAssign={onAssign} />
                ))}
                {villagers > 0 && (
                    <div className="py-2 flex items-center gap-2">
                        <WorkerPortrait workerKey="villager" rarity="normal" size={36} />
                        <div className="min-w-0 flex-1">
                            <strong className="font-pixel text-sm leading-none">Villagers ×{villagers}</strong>
                            <p className={MUTED_TEXT_CLASS}>Fill in wherever they're needed</p>
                        </div>
                    </div>
                )}
            </div>
            {workers.beds === 0 && <p className={MUTED_TEXT_CLASS}>Daily habits build homes, and homes bring more villagers.</p>}
        </div>
    );
}
