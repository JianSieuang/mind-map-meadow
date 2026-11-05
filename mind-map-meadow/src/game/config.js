export const MAP_CONFIG = {
    WIDTH: 3360,
    HEIGHT: 2400,
    TILE_SIZE: 48,
    PLAYER_SPEED: 420,
};

export const MINIMAP_CONFIG = {
    WIDTH: 180,
    HEIGHT: 128,
    MIN_HEIGHT: 64, // the most a short screen can shrink it
    MARGIN_TOP: 16, // the toggle icon and the town sign's row
    FRAME_LEFT: 68, // left-aligned with the town sign, which sits right of the toggle icon
    FRAME_TOP: 72, // until App has measured the sign (scene.placeMinimap)
};

export const KEY_CONTROLS = {
    UP: "W",
    DOWN: "S",
    LEFT: "A",
    RIGHT: "D",
};

// Render order. Buildings, the player and the AI sort by their ground Y (0..HEIGHT), so anything
// that must sit above or below all of them lives outside that range.
export const DEPTH = {
    GROUND: -100,
    ZONE_DIM: -50,
    GRID: -45,
    ZONE_LINE: -40,
    BUBBLE: 5000,
    MARKER: 5999,
    GHOST: 6000,
    FX: 7000,
    PROMPT: 7500,
    SLEEP: 9000,
};

// asset_key -> image under src/assets/. Texture key is `<asset_key>_asset`.
export const ASSET_REGISTRY = {
    // Line buildings, 2x2 footprint (coding uses the Learning sprites, habit the Homes sprites)
    fitness_1: { path: "Lines/Fitness/Lv1_TrainingYard.png", category: "building" },
    fitness_2: { path: "Lines/Fitness/Lv2_Gym.png", category: "building" },
    fitness_3: { path: "Lines/Fitness/Lv3_Arena.png", category: "building" },
    coding_1: { path: "Lines/Learning/Lv1_ShedWorkshop.png", category: "building" },
    coding_2: { path: "Lines/Learning/Lv2_Library.png", category: "building" },
    coding_3: { path: "Lines/Learning/Lv3_Academy.png", category: "building" },
    finance_1: { path: "Lines/Finance/Lv1_Stall.png", category: "building" },
    finance_2: { path: "Lines/Finance/Lv2_Market.png", category: "building" },
    finance_3: { path: "Lines/Finance/Lv3_Bank.png", category: "building" },
    habit_1: { path: "Lines/Homes/Lv1_Cottage.png", category: "building" },
    habit_2: { path: "Lines/Homes/Lv2_House.png", category: "building" },
    habit_3: { path: "Lines/Homes/Lv3_Manor.png", category: "building" },
    // Savings goal construction project, one texture per milestone stage (0 = empty plot … 4 = finished)
    savings_project_0: { path: "Savings/Stage0.png", category: "building" },
    savings_project_1: { path: "Savings/Stage1.png", category: "building" },
    savings_project_2: { path: "Savings/Stage2.png", category: "building" },
    savings_project_3: { path: "Savings/Stage3.png", category: "building" },
    savings_project_4: { path: "Savings/Stage4.png", category: "building" },
    // Decorations, 1x1 footprint
    cozy_bench: { path: "Decoration/CozyBench.png", category: "building" },
    garden_fountain: { path: "Decoration/GardenFountain.png", category: "building" },
};

// Pre-migration keys that can still arrive from an old row: draw them with their new sprite.
export const LEGACY_ASSET_ALIASES = {
    house: "habit_1",
    supermarket: "finance_2",
};

export const CHARACTER_ASSETS = {
    player: new URL("../assets/Characters/PlayerCharacter.png", import.meta.url).href,
    aiCompanion: new URL("../assets/Characters/AiCompanion.png", import.meta.url).href,
};

// Small gameplay art and the ground tileset: texture key -> image under src/assets/.
export const UI_ASSETS = {
    ui_coin_bubble_1: "UI/CoinBubble1.png",
    ui_coin_bubble_2: "UI/CoinBubble2.png",
    ui_storage_full: "UI/StorageFull.png",
    ui_no_worker: "UI/NoWorker.png",
    ui_shutter: "UI/Shutter.png",
    ui_closed_sign: "UI/ClosedSign.png",
    ui_coin: "UI/Coin.png",
    ui_dust: "UI/Dust.png",
    ui_sparkle: "UI/Sparkle.png",
    ui_rain: "UI/Rain.png",
    ui_zone_fence_h: "UI/ZoneFenceH.png",
    ui_zone_fence_v: "UI/ZoneFenceV.png",
    ui_zone_stake: "UI/ZoneStake.png",
    ui_zone_peg: "UI/ZonePeg.png",
    ui_recentre: "UI/RecentreButton.png",
    ground_tiles: "Tiles/GrassTiles.png",
};
