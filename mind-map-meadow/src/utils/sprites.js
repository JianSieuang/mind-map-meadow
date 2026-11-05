// Pixel-art thumbnails for the React HUD, reusing the game's asset registry so a building
// looks the same in a panel as it does on the map. An explicit glob (rather than a dynamic
// new URL) so nested asset folders resolve in the production build too.
import { ASSET_REGISTRY } from "../game/config";
import { savingsStage } from "./builder";

const URLS = import.meta.glob("../assets/**/*.png", { eager: true, query: "?url", import: "default" });

function urlForRegistryKey(key) {
    const path = ASSET_REGISTRY[key]?.path;
    return path ? URLS[`../assets/${path}`] || null : null;
}

export function buildingSpriteUrl(building) {
    const key = String(building?.asset_key || "").toLowerCase();
    if (key === "savings_project") return urlForRegistryKey(`savings_project_${savingsStage(building) ?? 0}`);
    return urlForRegistryKey(key);
}

export function assetSpriteUrl(assetKey) {
    return urlForRegistryKey(String(assetKey || "").toLowerCase());
}

// Roster portraits are named after the catalog key; "villager" is the generic worker.
export function workerSpriteUrl(workerKey) {
    return URLS[`../assets/Workers/${String(workerKey || "").toLowerCase()}.png`] || null;
}

export function summonSpriteUrl() {
    return URLS["../assets/Workers/mystery_summon.png"] || null;
}

// The shared 24x24 UI icons (profile, tasks, friends, ...).
export function iconUrl(name) {
    return URLS[`../assets/UI/Icons/${name}.png`] || null;
}

export function coinSpriteUrl() {
    return URLS["../assets/UI/Coin.png"] || null;
}

export function companionSpriteUrl() {
    return URLS["../assets/Characters/AiCompanion.png"] || null;
}

export function characterSpriteUrl(who) {
    return who === "companion" ? companionSpriteUrl() : URLS["../assets/Characters/PlayerCharacter.png"] || null;
}

export function grassTilesUrl() {
    return URLS["../assets/Tiles/GrassTiles.png"] || null;
}
