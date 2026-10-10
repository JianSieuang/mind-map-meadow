export const MAP_CONFIG = {
    WIDTH: 3360,
    HEIGHT: 2400,
    TILE_SIZE: 48,
    PLAYER_SPEED: 280,
};

export const MINIMAP_CONFIG = {
    WIDTH: 180,
    HEIGHT: 128,
    MARGIN_TOP: 16,
    MARGIN_LEFT: 100, // leaves clear room for the toggle icon (16px + 44px + generous gap) to its left
};

export const KEY_CONTROLS = {
    UP: "W",
    DOWN: "S",
    LEFT: "A",
    RIGHT: "D",
};

export const ASSET_REGISTRY = {
    house: { path: "Buildings/House.png", category: "building" },
    supermarket: { path: "Shop/SuperMarket.png", category: "building" },
    cozy_bench: { path: "Decoration/CozyBench.png", category: "building" },
    garden_fountain: { path: "Decoration/GardenFountain.png", category: "building" },
};

export const CHARACTER_ASSETS = {
    player: new URL("../assets/Characters/PlayerCharacter.png", import.meta.url).href,
    aiCompanion: new URL("../assets/Characters/AiCompanion.png", import.meta.url).href,
};
