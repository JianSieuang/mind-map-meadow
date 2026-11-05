import React, { useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { PANEL_CLASS } from "../components/hudStyles";
import { assetSpriteUrl, characterSpriteUrl, grassTilesUrl } from "../utils/sprites";

const TILE = 48;

// A little town around the sign-in sign. Positions are % of the screen; hidden on phones
// where a sprite would sit behind the panel.
const SCENERY = [
    { key: "habit_2", left: 9, top: 14, wide: true },
    { key: "fitness_2", left: 76, top: 9, wide: true },
    { key: "coding_1", left: 6, top: 62, wide: true },
    { key: "finance_2", left: 78, top: 58, wide: true },
    { key: "garden_fountain", left: 27, top: 80, wide: true },
    { key: "cozy_bench", left: 66, top: 84, wide: true },
    { key: "habit_1", left: 40, top: 3, wide: false },
    { key: "finance_1", left: 44, top: 76, wide: false },
];

// Same weighted grass the map uses, drawn once into a canvas behind everything.
function grassVariant() {
    const v = Math.random() * 100;
    if (v < 28) return 0;
    if (v < 52) return 1;
    if (v < 74) return 2;
    if (v < 84) return 3;
    if (v < 92) return 4;
    if (v < 95) return 5;
    if (v < 98) return 6;
    return 7;
}

function Meadow() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const image = new Image();
        image.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const cols = Math.ceil(window.screen.width / TILE) + 1;
            const rows = Math.ceil(window.screen.height / TILE) + 1;
            canvas.width = cols * TILE;
            canvas.height = rows * TILE;
            const ctx = canvas.getContext("2d");
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) ctx.drawImage(image, grassVariant() * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
            }
        };
        image.src = grassTilesUrl();
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="absolute top-0 left-0" style={{ imageRendering: "pixelated" }} />;
}

export default function LoginPage({ onLogin, error }) {
    return (
        <div className="relative w-screen h-screen overflow-hidden bg-[#5a9a4a] flex items-center justify-center p-4">
            <Meadow />
            {SCENERY.map(({ key, left, top, wide }) => (
                <img key={key} src={assetSpriteUrl(key)} alt="" aria-hidden="true" className={`absolute ${wide ? "hidden md:block" : ""}`} style={{ left: `${left}%`, top: `${top}%`, imageRendering: "pixelated" }} />
            ))}
            <img src={characterSpriteUrl("player")} alt="" aria-hidden="true" width={24} height={32} className="absolute hidden md:block" style={{ left: "30%", top: "30%", imageRendering: "pixelated" }} />
            <img src={characterSpriteUrl("companion")} alt="" aria-hidden="true" width={24} height={32} className="absolute hidden md:block" style={{ left: "67%", top: "38%", imageRendering: "pixelated" }} />

            <div className={`relative w-full max-w-sm p-6 flex flex-col items-center gap-5 ${PANEL_CLASS}`}>
                <div className="text-center">
                    <h1 className="font-pixel text-3xl leading-none">Mind Map Meadow</h1>
                    <p className="text-xs text-[#6b3f22] mt-2">Real work builds a real little town. Sign in to enter yours.</p>
                </div>

                <GoogleLogin onSuccess={onLogin} onError={() => onLogin(null, "Google sign-in failed. Please try again.")} theme="outline" shape="rectangular" />

                {error && <p className="text-xs font-semibold text-[#9c2f2b] text-center">{error}</p>}
            </div>
        </div>
    );
}
