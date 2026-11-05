import React, { useState } from "react";
import { buildingSpriteUrl, assetSpriteUrl, coinSpriteUrl, iconUrl, workerSpriteUrl } from "../utils/sprites";
import { rarityStyle } from "../utils/builder";

const PIXELATED = { imageRendering: "pixelated" };

// One of the shared UI icons. They're drawn at 24x24, so 24 (or 48) keeps pixels square.
export function Icon({ name, size = 24, className = "" }) {
    const url = iconUrl(name);
    if (!url) return null;
    return <img src={url} alt="" aria-hidden="true" width={size} height={size} className={`inline-block shrink-0 ${className}`} style={PIXELATED} />;
}

// The small 13px coin, for inline amounts in running text.
export function Coin({ className = "" }) {
    return <img src={coinSpriteUrl()} alt="" aria-hidden="true" width={13} height={13} className={`inline-block shrink-0 align-[-2px] ${className}`} style={PIXELATED} />;
}

function PixelImage({ url, fallback, size }) {
    const [failed, setFailed] = useState(false);
    if (!url || failed) return <Icon name={fallback} size={size >= 48 ? 48 : 24} />;
    return <img src={url} alt="" onError={() => setFailed(true)} className="w-full h-full object-contain" style={PIXELATED} />;
}

// Square of grass holding a building sprite, the way it sits in the meadow.
export function BuildingThumb({ building, assetKey, size = 44 }) {
    const url = assetKey ? assetSpriteUrl(assetKey) : buildingSpriteUrl(building);
    return (
        <div className="shrink-0 rounded-sm bg-[#5a9a4a] border-2 border-[#2b1e1a] flex items-center justify-center overflow-hidden" style={{ width: size, height: size }}>
            <PixelImage url={url} fallback="inventory" size={size} />
        </div>
    );
}

export function WorkerPortrait({ workerKey, rarity, size = 40 }) {
    const style = rarityStyle(rarity);
    return (
        <div className={`shrink-0 rounded-sm bg-[#f4efe6] border-2 ${style.border} flex items-center justify-center overflow-hidden`} style={{ width: size, height: size }}>
            <PixelImage url={workerSpriteUrl(workerKey)} fallback="workers" size={size} />
        </div>
    );
}

// Up to 3 stars. A worker with none shows nothing.
export function Stars({ count, className = "" }) {
    const stars = Math.max(0, Math.min(3, Number(count) || 0));
    if (stars === 0) return null;
    return (
        <span className={`text-[#a8770b] tracking-tight ${className}`} title={`${stars} star${stars > 1 ? "s" : ""}`} aria-label={`${stars} star${stars > 1 ? "s" : ""}`}>
            {"★".repeat(stars)}
        </span>
    );
}

const BAR_FILLS = { gold: "bg-[#e0a526]", blue: "bg-[#4f93b0]", red: "bg-[#d2493f]", green: "bg-[#5a9a4a]" };

export function PixelBar({ pct, tone = "gold", className = "" }) {
    return (
        <div className={`h-3 bg-[#cfa877] border-2 border-[#2b1e1a] rounded-sm overflow-hidden ${className}`}>
            <div className={`h-full transition-[width] ${BAR_FILLS[tone] || BAR_FILLS.gold}`} style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
        </div>
    );
}

// Little pictures for the two dashboard pages the shared icon set doesn't cover, drawn in
// the master palette on a 12x12 grid.
const GLYPHS = {
    calendar: ["............", ".dd......dd.", "dddddddddddd", "drrrrrrrrrrd", "dddddddddddd", "dccccccccccd", "dcddccddccdd", "dccccccccccd", "dcddccddccdd", "dccccccccccd", "dddddddddddd", "............"],
    repeat: ["............", "...ddddddd..", "..dbbbbbbbd.", ".dbbdddddbd.", ".dbd....dddd", ".dbd...dbbbd", "dbbbd...dbd.", "ddddd...dbd.", ".dbddddddbd.", ".dbbbbbbbd..", "..ddddddd...", "............"],
};
const GLYPH_COLOURS = { d: "#2b1e1a", r: "#d2493f", c: "#f6e6c8", b: "#4f93b0" };

export function Glyph({ name, size = 24 }) {
    const rows = GLYPHS[name];
    if (!rows) return null;
    const rects = [];
    rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
            if (GLYPH_COLOURS[ch]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={GLYPH_COLOURS[ch]} />);
        });
    });
    return (
        <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" className="inline-block shrink-0">
            {rects}
        </svg>
    );
}
