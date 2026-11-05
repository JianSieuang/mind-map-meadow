import React, { useMemo } from "react";

// The ring drawn on a coarse grid, so it reads as a sprite instead of a smooth vector
// circle. Returns the outline path and the cells of the track, each with its turn (0..1
// clockwise from the top).
function ringCells(n) {
    const centre = (n - 1) / 2;
    const radius = n / 2;
    const width = Math.max(2, Math.round(n / 8));
    let outline = "";
    let face = "";
    const track = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const dist = Math.hypot(x - centre, y - centre);
            if (dist > radius) continue;
            if (dist > radius - 1.1) {
                outline += `M${x} ${y}h1v1h-1z`;
            } else if (dist > radius - 1.1 - width) {
                const turn = ((Math.atan2(x - centre, centre - y) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
                track.push({ x, y, turn });
            } else {
                face += `M${x} ${y}h1v1h-1z`;
            }
        }
    }
    return { outline, face, track };
}

const cellsPath = (cells) => cells.map(({ x, y }) => `M${x} ${y}h1v1h-1z`).join("");

// Town Level ring: the number is the level, the filled arc is XP toward the next one.
export default function TownRing({ level, pct, size = 40 }) {
    const cell = size >= 72 ? 4 : 2;
    const n = Math.round(size / cell);
    const { outline, face, track } = useMemo(() => ringCells(n), [n]);
    const filled = (pct || 0) / 100;

    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" className="absolute inset-0">
                <path d={face} fill="#f4efe6" />
                <path d={cellsPath(track.filter((c) => c.turn >= filled))} fill="#cfa877" />
                <path d={cellsPath(track.filter((c) => c.turn < filled))} fill="#e0a526" />
                <path d={outline} fill="#2b1e1a" />
            </svg>
            <span className="font-pixel absolute inset-0 flex items-center justify-center leading-none text-[#2b1e1a]" style={{ fontSize: Math.round(size * 0.38) }}>
                {level}
            </span>
        </div>
    );
}
