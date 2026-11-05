// Every Builder Loop number lives here (docs/BUILDER_LOOP_CONTRACT.md §1, §5.12).
// The client gets them through builder.rules and never hardcodes a cost, rate or cap.
import crypto from "crypto";

export { townLevel, xpBounds } from "./rewards.js";

export const CFG = {
    DAILY_BUILDING_CAP: 5,
    TASK_COINS: 10,
    TASK_COINS_PER_DAY: 5,
    LOG_COINS: 5,
    LOG_COINS_PER_DAY: 3,
    SAVINGS_MILESTONE_COINS: 40,
    RATE_MILLI: { 1: 150, 2: 400, 3: 1000 },
    STORAGE_HOURS: 20,
    SLEEPY_AFTER_HOURS: 72,
    MERGE_COST: { 1: 25, 2: 150 },
    MERGE_TOWN_LEVEL: { 1: 1, 2: 5 },
    MERGE_TOWN_XP: { 1: 1, 2: 3 }, // keyed by the level being merged from
    BASE_WORKERS: 3,
    SUMMONS_PER_TOWN_LEVEL: 1,
    PITY_AFTER: 9, // pulls without an Epic or better before the next pull is forced to be one
    BEDS: { 1: 1, 2: 2, 3: 4 },
    POOL_MAX: 10,
    TILE_SIZE: 48,
    MAP_W: 70,
    MAP_H: 50,
    FOOTPRINT: { line: 2, savings: 2, decoration: 1, legacy: 1 },
    SHOP: { cozy_bench: 50, garden_fountain: 150 },
};

export const ZONES = [
    { step: 0, x: 4, y: 3, w: 12, h: 10, townLevel: 1, cost: 0 },
    { step: 1, x: 3, y: 2, w: 16, h: 12, townLevel: 2, cost: 200 },
    { step: 2, x: 2, y: 2, w: 20, h: 16, townLevel: 3, cost: 500 },
    { step: 3, x: 2, y: 1, w: 26, h: 20, townLevel: 5, cost: 1000 },
    { step: 4, x: 1, y: 1, w: 34, h: 26, townLevel: 7, cost: 2000 },
    { step: 5, x: 0, y: 0, w: 44, h: 32, townLevel: 9, cost: 3500 },
    { step: 6, x: 0, y: 0, w: 56, h: 40, townLevel: 11, cost: 5500 },
    { step: 7, x: 0, y: 0, w: 70, h: 50, townLevel: 13, cost: 8000 },
];

export const MAP_RECT = { x: 0, y: 0, w: CFG.MAP_W, h: CFG.MAP_H };

export const NAMES = {
    fitness: ["Training Yard", "Gym", "Sports Arena"],
    coding: ["Shed Workshop", "Library", "Academy"],
    finance: ["Stall", "Market", "Bank"],
    habit: ["Cottage", "House", "Manor"],
};

// Task category -> line. Unknown categories fall through to coding; recurring-task
// instances are always the habit line (see lineForTask).
const CATEGORY_LINE = { Fitness: "fitness", Coding: "coding", Finance: "finance" };

export function lineForTask(task) {
    if (task.recurring_task_id !== null && task.recurring_task_id !== undefined) return "habit";
    return Object.hasOwn(CATEGORY_LINE, task.category) ? CATEGORY_LINE[task.category] : "coding";
}

export function assetKeyFor(line, level) {
    return `${line}_${level}`;
}

export const RARITIES = {
    Normal: { odds: 60, multiplier: 1.0, speedBonusBp: 0 },
    Rare: { odds: 25, multiplier: 1.1, speedBonusBp: 1000 },
    Epic: { odds: 12, multiplier: 1.25, speedBonusBp: 2500 },
    Legendary: { odds: 3, multiplier: 1.5, speedBonusBp: 5000 },
};

// Copied from docs/WORKER_DESIGN.md §4. Keys match the sprites in src/assets/Workers/.
export const WORKER_CATALOG = [
    { key: "ben", name: "Ben", rarity: "Normal", skill: "Trainer", ability: null },
    { key: "mia", name: "Mia", rarity: "Normal", skill: "Scholar", ability: null },
    { key: "sam", name: "Sam", rarity: "Normal", skill: "Merchant", ability: null },
    { key: "joe", name: "Joe", rarity: "Normal", skill: "All-rounder", ability: null },
    { key: "coach_rae", name: "Coach Rae", rarity: "Rare", skill: "Trainer", ability: "Quick Hands" },
    { key: "ivy", name: "Ivy", rarity: "Rare", skill: "Scholar", ability: "Early Bird" },
    { key: "penny", name: "Penny", rarity: "Rare", skill: "Merchant", ability: "Deep Pockets" },
    { key: "max_iron", name: "Max Iron", rarity: "Epic", skill: "Trainer", ability: "Cheerleader" },
    { key: "professor_lin", name: "Professor Lin", rarity: "Epic", skill: "Scholar", ability: "Recruiter" },
    { key: "madam_gold", name: "Madam Gold", rarity: "Epic", skill: "Merchant", ability: "Bargainer" },
    { key: "old_tom", name: "Old Tom", rarity: "Legendary", skill: "All-rounder", ability: "Master Builder" },
    { key: "mayor_star", name: "Mayor Star", rarity: "Legendary", skill: "All-rounder", ability: "Town Hero" },
];

const CATALOG_BY_KEY = new Map(WORKER_CATALOG.map((worker) => [worker.key, worker]));

export function catalogWorker(key) {
    return CATALOG_BY_KEY.get(key) || null;
}

// Speed effects in basis points, added to a Villager's 10000 (§5.12).
export const SPEED = {
    BASE_BP: 10000,
    SKILL_MATCH_BP: 2000,
    ALL_ROUNDER_BP: 500,
    STAR_BP: 500,
    QUICK_HANDS_BP: 500,
    CHEERLEADER_BP: 500,
    CHEERLEADER_MAX_BP: 1500,
    TOWN_HERO_BP: 500,
    DEEP_POCKETS_CAP_BP: 12500,
};

export const SKILL_LINE = { Trainer: "fitness", Scholar: "coding", Merchant: "finance" };

export const MAX_STARS = 3;
export const EARLY_BIRD_COINS = 3;

// A worker's merge discount. Master Builder takes priority over Bargainer; the cost is floored.
export function mergeCostFor(level, ownedAbilities) {
    const base = CFG.MERGE_COST[level];
    if (ownedAbilities.has("Master Builder")) return Math.floor((base * 75) / 100);
    if (ownedAbilities.has("Bargainer")) return Math.floor((base * 90) / 100);
    return base;
}

// One summon roll, on the server. After PITY_AFTER pulls without an Epic or better, only
// Epic and Legendary are in the draw (12:3).
export function rollSummon(summonsSinceEpic) {
    const pity = summonsSinceEpic >= CFG.PITY_AFTER;
    const names = pity ? ["Epic", "Legendary"] : Object.keys(RARITIES);
    const total = names.reduce((sum, name) => sum + RARITIES[name].odds, 0);

    let roll = crypto.randomInt(total);
    let rarity = names[names.length - 1];
    for (const name of names) {
        if (roll < RARITIES[name].odds) {
            rarity = name;
            break;
        }
        roll -= RARITIES[name].odds;
    }

    const choices = WORKER_CATALOG.filter((worker) => worker.rarity === rarity);
    return choices[crypto.randomInt(choices.length)];
}

// Sent to the client as builder.rules.
export const RULES = Object.freeze({
    DAILY_BUILDING_CAP: CFG.DAILY_BUILDING_CAP,
    TASK_COINS: CFG.TASK_COINS,
    TASK_COINS_PER_DAY: CFG.TASK_COINS_PER_DAY,
    LOG_COINS: CFG.LOG_COINS,
    LOG_COINS_PER_DAY: CFG.LOG_COINS_PER_DAY,
    RATE_MILLI: CFG.RATE_MILLI,
    STORAGE_HOURS: CFG.STORAGE_HOURS,
    MERGE_COST: CFG.MERGE_COST,
    MERGE_TOWN_LEVEL: CFG.MERGE_TOWN_LEVEL,
    BASE_WORKERS: CFG.BASE_WORKERS,
    BEDS: CFG.BEDS,
    POOL_MAX: CFG.POOL_MAX,
    SLEEPY_AFTER_HOURS: CFG.SLEEPY_AFTER_HOURS,
    PITY_AFTER: CFG.PITY_AFTER,
    FOOTPRINT: CFG.FOOTPRINT,
    SHOP: CFG.SHOP,
    ZONES,
    NAMES,
    RARITIES,
    WORKER_CATALOG,
});
