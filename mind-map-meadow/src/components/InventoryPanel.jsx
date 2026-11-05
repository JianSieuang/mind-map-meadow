import React from "react";
import { BuildingThumb, Coin, Icon } from "./Sprites";
import { COUNT_CHIP_CLASS, HUD_PANEL_CLASS, LINK_BTN_CLASS, MUTED_TEXT_CLASS, PANEL_TITLE_CLASS, ROW_CLASS, SECTION_TITLE_CLASS, btn } from "./hudStyles";
import { buildingName, decorationName, lineLabel } from "../utils/builder";

// Identical buildings collapse into one row ("Gym ×3"); Place takes the first of them.
function groupInventory(inventory) {
    const groups = new Map();
    inventory.forEach((b) => {
        const key = `${b.kind}:${b.line}:${b.level}:${b.asset_key}`;
        if (!groups.has(key)) groups.set(key, { first: b, count: 0 });
        groups.get(key).count += 1;
    });
    return [...groups.values()];
}

export default function InventoryPanel({ builder, onPlace, onAutoPlace, onBuyDecoration, onOpenGoals }) {
    const rules = builder.rules || {};
    const inventory = builder.inventory || [];
    const groups = groupInventory(inventory);
    const pool = builder.pool || {};
    const shop = Object.entries(rules.SHOP || {});
    const hasTown = (builder.placed || []).some((b) => b.kind === "line");

    return (
        <div className={HUD_PANEL_CLASS}>
            <h3 className={PANEL_TITLE_CLASS}>
                <Icon name="inventory" /> Inventory
                {inventory.length > 0 && <span className={COUNT_CHIP_CLASS}>{inventory.length}</span>}
            </h3>

            {inventory.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-1 text-center">
                    <p className="text-xs font-semibold">{hasTown ? "All your buildings are on the map." : "Finish a task to get your first building."}</p>
                    <p className={MUTED_TEXT_CLASS}>{hasTown ? "Finish a task for another. Your first money log each day brings a Stall too." : "Your first money log each day brings a Stall too."}</p>
                    <button onClick={onOpenGoals} className={btn("next")}>
                        <Icon name="goals" /> Open tasks
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex flex-col">
                        {groups.map(({ first, count }) => (
                            <div key={first.id} className={ROW_CLASS}>
                                <BuildingThumb building={first} />
                                <div className="min-w-0 flex-1">
                                    <strong className="text-xs block truncate">
                                        {buildingName(first, rules)}
                                        {count > 1 && <span className="font-pixel text-sm text-[#6b3f22]"> ×{count}</span>}
                                    </strong>
                                    <small className={MUTED_TEXT_CLASS}>
                                        {first.level ? `Lv ${first.level}` : ""}
                                        {first.line ? ` · ${lineLabel(first.line)}` : ""}
                                    </small>
                                </div>
                                <button onClick={() => onPlace(first)} className={btn("next", "shrink-0")}>
                                    Place
                                </button>
                            </div>
                        ))}
                    </div>
                    {inventory.length > 1 && (
                        <button onClick={onAutoPlace} className={btn("muted")}>
                            Auto-place all
                        </button>
                    )}
                    {inventory.length === 1 && (
                        <button onClick={onAutoPlace} className={`${LINK_BTN_CLASS} self-center`}>
                            Or auto-place it
                        </button>
                    )}
                </>
            )}

            {pool.count > 0 && (
                <p className="text-xs bg-[#f4efe6] border-2 border-[#cfa877] rounded-sm px-2 py-1.5">
                    <span className="font-pixel text-sm">{pool.count}</span> more waiting. One moves here each new day you visit.
                </p>
            )}

            {shop.length > 0 && (
                <div className="flex flex-col gap-1 border-t-2 border-[#cfa877] pt-2.5">
                    <h4 className={SECTION_TITLE_CLASS}>Decorations</h4>
                    <div className="flex flex-col">
                        {shop.map(([assetKey, price]) => {
                            const short = price - (builder.coins || 0);
                            return (
                                <div key={assetKey} className={ROW_CLASS}>
                                    <BuildingThumb assetKey={assetKey} />
                                    <div className="min-w-0 flex-1">
                                        <strong className="text-xs block truncate">{decorationName(assetKey)}</strong>
                                        <span className="flex items-center gap-1">
                                            <Coin /> <span className="font-pixel text-sm leading-none">{price}</span>
                                        </span>
                                    </div>
                                    <button onClick={() => onBuyDecoration(assetKey)} disabled={short > 0} className={btn("muted", "shrink-0")}>
                                        {short > 0 ? `${short} more` : "Buy"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
