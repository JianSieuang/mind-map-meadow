// Guided first day (contract §5.13). Progress is read from real builder and task state;
// the only clicks that move it are "Got it" on the steps that have nothing left to do.
//
// builder.tutorial.step values:
//   0        not started (shows step 1)
//   1..5     the first-day steps
//   6        first day finished; waiting for the merge and summon tips
//   7 / 8    merge tip seen / summon tip seen
//   9        both seen, which also sets done
import { mergeInfo, collectableCoins, buildingName, expandStatus } from "./builder";

const LAST_FIRST_DAY_STEP = 5;
const AFTER_FIRST_DAY = 6;
const MERGE_SEEN = 7;
const SUMMON_SEEN = 8;
const ALL_SEEN = 9;

export function firstDayOver(tutorial) {
    return !tutorial || tutorial.done || tutorial.step > LAST_FIRST_DAY_STEP;
}

// What the HUD holds back during the first day, so a new player meets one thing at a time.
// Each piece appears as soon as it means something, and everything is out once the guide is
// finished or skipped. A replay of the guide keeps whatever the town has already earned.
export function hudReveal(builder, friendsState) {
    const over = firstDayOver(builder?.tutorial);
    const placed = builder?.placed || [];
    const workers = builder?.workers || {};
    const { friends = [], incoming = [], outgoing = [] } = friendsState || {};
    return {
        workers: over || placed.some((b) => b.needsWorker) || (workers.summoned || []).length > 0 || (workers.pendingSummons || 0) > 0,
        today: over || placed.length > 0 || (builder?.inventory || []).length > 0,
        friends: (!!builder && over) || friends.length + incoming.length + outgoing.length > 0,
        expand: over || !!expandStatus(builder)?.ready,
    };
}

const mergeTipSeen = (step) => step === MERGE_SEEN || step === ALL_SEEN;
const summonTipSeen = (step) => step === SUMMON_SEEN || step === ALL_SEEN;

// baseline is set by "Replay guide": it holds today's counts at that moment, so a replay
// waits for a new task or log instead of racing through what's already been done today.
function paidAfter(count, cap, base) {
    return count > (base || 0) || (cap != null && count >= cap);
}

// The furthest first-day step current state allows. Never moves backwards.
export function advanceFirstDay(step, { builder, pendingTaskCount, baseline, inventoryShrank }) {
    if (step >= LAST_FIRST_DAY_STEP) return step;
    const counts = builder.today_counts || {};
    const stepIsDone = {
        1: () => pendingTaskCount > 0 || paidAfter(counts.tasksPaid || 0, counts.tasksPaidCap, baseline?.tasksPaid),
        2: () => paidAfter(counts.tasksPaid || 0, counts.tasksPaidCap, baseline?.tasksPaid),
        3: () => (builder.inventory || []).length === 0 || inventoryShrank,
        4: () => paidAfter(counts.logsPaid || 0, counts.logsPaidCap, baseline?.logsPaid),
    };
    let current = Math.max(step, 1);
    while (current < LAST_FIRST_DAY_STEP && stepIsDone[current]()) current += 1;
    return current;
}

export function finishFirstDay(step) {
    return step === LAST_FIRST_DAY_STEP ? AFTER_FIRST_DAY : step;
}

// Mark one of the two later tips as seen. Returns the new { step, done }, or null if
// there's nothing to change (first day still running, or already seen).
export function markTipSeen(tutorial, which) {
    const step = tutorial?.step ?? 0;
    if (tutorial?.done || step < AFTER_FIRST_DAY) return null;
    const merge = mergeTipSeen(step) || which === "merge";
    const summon = summonTipSeen(step) || which === "summon";
    const next = merge && summon ? ALL_SEEN : merge ? MERGE_SEEN : summon ? SUMMON_SEEN : AFTER_FIRST_DAY;
    return next === step ? null : { step: next, done: next === ALL_SEEN };
}

// Two placed, identical buildings the player can afford to merge right now.
function mergeablePair(builder) {
    const seen = new Set();
    for (const b of builder.placed || []) {
        if (b.kind !== "line") continue;
        const key = `${b.line}:${b.level}`;
        if (seen.has(key)) {
            const info = mergeInfo(b, builder);
            if (info && info.levelOk && builder.coins >= info.cost) return b;
        }
        seen.add(key);
    }
    return null;
}

// What the coach says right now, or null for silence.
export function coachMessage(builder, now) {
    const tutorial = builder?.tutorial;
    if (!tutorial || tutorial.done) return null;
    const step = Math.max(tutorial.step, 1);

    if (step <= LAST_FIRST_DAY_STEP) {
        const base = { step, of: LAST_FIRST_DAY_STEP };
        if (step === 1) {
            return { ...base, text: "Add one thing you'd really do today.", action: { key: "add_task", label: "Add a task" }, target: "goals" };
        }
        if (step === 2) {
            const coins = builder.rules?.TASK_COINS;
            const reward = coins ? `You'll earn ${coins} coins and your first building.` : "You'll earn your first building.";
            return { ...base, text: `Now go do it, then mark it done. ${reward}`, action: { key: "open_agenda", label: "My tasks" } };
        }
        if (step === 3) {
            return { ...base, text: "Your building is ready. Find it a spot on your land.", action: { key: "open_inventory", label: "Place it" }, target: "place" };
        }
        if (step === 4) {
            const working = (builder.placed || []).some((b) => b.staffed);
            const intro = working ? "A worker's on it, and it's filling with coins." : "Nice spot. New homes add workers to your town.";
            return { ...base, text: `${intro} Now log something you spent today for a free Stall.`, action: { key: "open_log", label: "Log" }, target: "log" };
        }
        if (collectableCoins(builder, now) >= 1) {
            return { ...base, text: "Your first coins are ready. Tap Collect all.", action: { key: "finish_first_day", label: "Got it" }, target: "collect" };
        }
        const stall = (builder.inventory || []).length > 0 ? "Place your new Stall, then come" : "That's today done. Come";
        return { ...base, text: `${stall} back tomorrow to collect your coins.`, action: { key: "finish_first_day", label: "Got it" }, target: "collect" };
    }

    if (!summonTipSeen(step) && (builder.workers?.pendingSummons || 0) > 0) {
        return { text: "You levelled up! Open your summon.", action: { key: "open_summon", label: "Open summon" }, secondary: { key: "tip_summon", label: "Later" } };
    }
    if (!mergeTipSeen(step)) {
        const pair = mergeablePair(builder);
        if (pair) {
            return { text: `You have two ${buildingName(pair, builder.rules)} buildings. Drag one onto the other to merge.`, action: { key: "tip_merge", label: "Got it" } };
        }
    }
    return null;
}
