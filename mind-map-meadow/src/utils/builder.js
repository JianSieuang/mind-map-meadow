// Display helpers for the server's `builder` state (docs/BUILDER_LOOP_CONTRACT.md §4).
// The server owns every rule and number: costs, rates and caps are read from
// builder.rules, never written down here. Storage is only animated locally between
// updates; only the server's numbers are ever paid out.

// What the player knows the companion as. The server has no name for it yet.
export const COMPANION_NAME = "Clover";

// The one rarity colour map, in the art palette. text, border and chip sit on cream panels;
// light is for the dark summon overlay. Full class names so Tailwind's content scan keeps them.
export const RARITY_STYLES = {
    normal: { label: "Normal", rank: 0, text: "text-[#5d6470]", border: "border-[#5d6470]", chip: "bg-[#b5bbc4] text-[#2b1e1a]", light: "#dfe2e6" },
    rare: { label: "Rare", rank: 1, text: "text-[#2f6f9a]", border: "border-[#2f6f9a]", chip: "bg-[#2f6f9a] text-[#f4efe6]", light: "#7fc4dc" },
    epic: { label: "Epic", rank: 2, text: "text-[#5a3b6e]", border: "border-[#5a3b6e]", chip: "bg-[#5a3b6e] text-[#f4efe6]", light: "#b78fd1" },
    legendary: { label: "Legendary", rank: 3, text: "text-[#a8770b]", border: "border-[#e0a526]", chip: "bg-[#e0a526] text-[#2b1e1a]", light: "#ffd65a" },
};

export function rarityStyle(rarity) {
    return RARITY_STYLES[String(rarity || "").toLowerCase()] || RARITY_STYLES.normal;
}

const LINE_LABELS = { fitness: "Fitness", coding: "Coding", finance: "Finance", habit: "Home" };

export function lineLabel(line) {
    return LINE_LABELS[line] || "";
}

export function lineBuildingName(line, level, rules) {
    return rules?.NAMES?.[line]?.[(level || 1) - 1] || `${lineLabel(line) || "New"} building`;
}

function prettifyKey(key) {
    return String(key || "")
        .split("_")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export function decorationName(assetKey) {
    return prettifyKey(assetKey) || "Decoration";
}

export function buildingName(building, rules) {
    if (!building) return "";
    if (building.line) return lineBuildingName(building.line, building.level, rules);
    if (building.kind === "savings" || building.asset_key === "savings_project") return "Savings project";
    if (building.kind === "decoration") return decorationName(building.asset_key);
    return prettifyKey(building.asset_key) || "Old building";
}

// Same-named buildings get a number so they can be told apart in a list ("Gym 2").
export function buildingLabels(buildings, rules) {
    const totals = {};
    buildings.forEach((b) => {
        const name = buildingName(b, rules);
        totals[name] = (totals[name] || 0) + 1;
    });
    const seen = {};
    const labels = {};
    buildings.forEach((b) => {
        const name = buildingName(b, rules);
        seen[name] = (seen[name] || 0) + 1;
        labels[b.id] = totals[name] > 1 ? `${name} ${seen[name]}` : name;
    });
    return labels;
}

// metadata is JSONB on our own rows but older friend rows may hand us a string.
export function savingsStage(building) {
    let meta = building?.metadata;
    if (typeof meta === "string") {
        try {
            meta = JSON.parse(meta);
        } catch {
            meta = null;
        }
    }
    const stage = Number.parseInt(meta?.stage, 10);
    return Number.isFinite(stage) ? stage : null;
}

// Storage right now, extrapolated from the moment this builder object arrived. Elapsed
// time is measured on the browser's own clock so a wrong device clock can't skew it, and
// growth stops at the moment the town falls asleep.
export function storedMilliNow(building, builder, now = Date.now()) {
    const stored = building?.storedMilli || 0;
    const rate = building?.rateMilliPerHour || 0;
    if (!rate || !builder?.receivedAt) return stored;

    let elapsedMs = Math.max(0, now - builder.receivedAt);
    const untilSleep = Date.parse(builder.sleepyAt) - Date.parse(builder.serverNow);
    if (Number.isFinite(untilSleep)) elapsedMs = Math.min(elapsedMs, Math.max(0, untilSleep));

    const grown = stored + Math.floor((rate * elapsedMs) / 3_600_000);
    // Storage can legitimately sit above the cap (a Deep Pockets worker left): it never shrinks.
    return Math.max(stored, building.capMilli ? Math.min(building.capMilli, grown) : grown);
}

export function collectableCoins(builder, now = Date.now()) {
    return (builder?.placed || []).reduce((sum, b) => sum + Math.floor(storedMilliNow(b, builder, now) / 1000), 0);
}

export function formatCoins(n) {
    const value = Number(n) || 0;
    if (value < 10000) return String(value);
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function formatSpeed(speedBp) {
    return `×${((speedBp || 10000) / 10000).toFixed(2).replace(/0$/, "")}`;
}

export function formatRate(rateMilliPerHour) {
    return `${Number(((rateMilliPerHour || 0) / 1000).toFixed(2))}/h`;
}

export function nextCoinText(storedMilli, building) {
    const rate = building?.rateMilliPerHour || 0;
    if (building?.capMilli && storedMilli >= building.capMilli) return "Full";
    if (!rate) return "";
    const hours = (1000 - (storedMilli % 1000)) / rate;
    return hours < 1 ? `Next coin in ${Math.ceil(hours * 60)}m` : `Next coin in ${Math.ceil(hours)}h`;
}

export function townProgress(town) {
    if (!town) return { level: 1, into: 0, span: 0, pct: 0 };
    const into = Math.max(0, town.xp - town.xpForThis);
    const span = Math.max(1, town.xpForNext - town.xpForThis);
    return { level: town.level, into, span, pct: Math.min(100, Math.round((into / span) * 100)) };
}

// What the Expand button shows, and in plain words what's still missing.
export function expandStatus(builder) {
    const next = builder?.zone?.next;
    if (!next) return null;
    const levelOk = (builder.town?.level || 1) >= next.townLevel;
    const coinsOk = (builder.coins || 0) >= next.cost;
    const missing = [];
    if (!levelOk) missing.push(`reach Town Lv ${next.townLevel}`);
    if (!coinsOk) missing.push(`get ${next.cost - (builder.coins || 0)} more coins`);
    return {
        next,
        levelOk,
        coinsOk,
        ready: levelOk && coinsOk,
        why: missing.length ? `To expand, ${missing.join(" and ")}.` : "",
    };
}

// Keyed by the current level. builder.mergeCost has this player's discounts applied;
// rules.MERGE_COST is only the base price.
export function mergeInfo(building, builder) {
    if (building?.kind !== "line" || !(building.level < 3)) return null;
    const cost = builder?.mergeCost?.[building.level] ?? builder?.rules?.MERGE_COST?.[building.level];
    if (cost == null) return null;
    const townLevel = builder?.rules?.MERGE_TOWN_LEVEL?.[building.level] ?? 1;
    return { cost, townLevel, levelOk: (builder?.town?.level || 1) >= townLevel };
}

// rules.RARITIES is { Normal: { odds, multiplier, speedBonusBp }, ... }, with odds in percent.
export function rarityOdds(rules) {
    return Object.entries(rules?.RARITIES || {})
        .map(([name, { odds }]) => ({ name, label: rarityStyle(name).label, rank: rarityStyle(name).rank, pct: odds }))
        .sort((a, b) => a.rank - b.rank);
}

const SKILL_TEXT = {
    trainer: "Best in fitness buildings",
    scholar: "Best in coding buildings",
    merchant: "Best in finance buildings",
    "all-rounder": "A little quicker everywhere",
};

export function skillText(skill) {
    return SKILL_TEXT[String(skill || "").toLowerCase()] || "";
}

// Words only. The effects themselves live on the server.
const ABILITY_TEXT = {
    "deep pockets": "Their building stores more coins",
    "quick hands": "Their building works faster",
    "early bird": "Bonus coins on the day's first Collect all",
    bargainer: "Merges cost less",
    cheerleader: "Buildings next door earn more",
    recruiter: "Brings one extra worker",
    "master builder": "Merges cost a lot less",
    "town hero": "Every staffed building earns more",
};

export function abilityText(ability) {
    return ABILITY_TEXT[String(ability || "").toLowerCase()] || "";
}

const BUILDER_ERRORS = {
    BAD_PAYLOAD: "That didn't go through. Try once more.",
    NOT_FOUND: "Couldn't find that one. It may have just changed.",
    NOT_PLACED: "Place it on the map first.",
    NOT_IN_INVENTORY: "That building has already left your inventory.",
    OUT_OF_ZONE: "That spot is outside your land.",
    OUT_OF_MAP: "That spot is off the map.",
    OVERLAP: "Something's already there. Try a free spot.",
    MISMATCH: "Only two of the same building can merge.",
    MAX_LEVEL: "That one is already at its top level.",
    TOWN_LEVEL: "Your town needs a higher level for that.",
    COINS: "Not enough coins yet.",
    MAX_ZONE: "You've unlocked all the land there is.",
    UNKNOWN_ITEM: "That item isn't in the shop.",
    NO_SUMMON: "No summons left. The next one comes with your next town level.",
    SERVER: "Something went wrong on our side. Try again in a moment.",
    RATE_LIMITED: "That's a lot at once. Give it a second and try again.",
};

// The server's own wording says exactly what went wrong ("That merge needs town level 5"),
// including most BAD_PAYLOADs. Only an unexpected failure or a bare "Bad request." is too
// vague to show.
export function builderErrorMessage(code, serverMessage) {
    if (serverMessage && code !== "SERVER" && serverMessage !== "Bad request.") return String(serverMessage);
    return BUILDER_ERRORS[code] || "That didn't work. Try again in a moment.";
}
