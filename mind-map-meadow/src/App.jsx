import React, { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game";
import { MINIMAP_CONFIG } from "./game/config";
import { ALL_DAYS } from "./utils/duration";
import "./components/hud.css";
import ProfilePanel from "./components/ProfilePanel";
import AgendaPanel from "./components/AgendaPanel";
import FriendsPanel from "./components/FriendsPanel";
import HudIconRail from "./components/HudIconRail";
import TaskModal from "./components/TaskModal";
import BuildingCard from "./components/BuildingCard";
import TaskDashboard from "./pages/TaskDashboard";
import LoginPage from "./pages/LoginPage";
import QuickAddMoney from "./components/QuickAddMoney";
import BuilderHud, { BuilderActions } from "./components/BuilderHud";
import InventoryPanel from "./components/InventoryPanel";
import WorkersPanel from "./components/WorkersPanel";
import SummonReveal from "./components/SummonReveal";
import ToastStack from "./components/ToastStack";
import CoachBubble from "./components/CoachBubble";
import LevelUpBanner from "./components/LevelUpBanner";
import ConnectionBanner from "./components/ConnectionBanner";
import { Icon } from "./components/Sprites";
import { PANEL_CLASS, btn } from "./components/hudStyles";
import { browserTimeZone } from "./utils/dates";
import { taskRewardPreview } from "./utils/rewards";
import { buildingName, builderErrorMessage, collectableCoins, decorationName, lineBuildingName } from "./utils/builder";
import { advanceFirstDay, coachMessage, finishFirstDay, hudReveal, markTipSeen } from "./utils/tutorial";
import ShortcutsModal from "./components/ShortcutsModal";
import { DEFAULT_BINDINGS } from "../server/keybindings.js";
import { pageFromPath, pathForPage, pathForVisit, visitIdFromPath } from "./utils/route";

// One socket for the page's lifetime. Under Vite HMR this module re-executes; reuse the
// existing socket so the already-running Phaser scene (which holds a reference to it)
// and App stay on the same connection instead of App silently moving to a new one.
const socket = import.meta.hot?.data.socket ?? io({ autoConnect: false, withCredentials: true, auth: { timezone: browserTimeZone() } });
if (import.meta.hot) import.meta.hot.data.socket = socket;

// Every player action goes through this. An emit made while offline would sit in the
// socket's buffer and replay on reconnect, long after the player has moved on.
const emitAction = (event, payload) => {
    if (!socket.connected) return false;
    socket.emit(event, payload);
    return true;
};

// Same breakpoint the HUD's lg: classes switch at. Below it, panels, the minimap and the
// building card would share the screen's small free space, so only one shows at a time.
const isNarrowViewport = () => window.matchMedia("(max-width: 1023px)").matches;

const STORAGE_TICK_MS = 30000;
const SUMMON_TIMEOUT_MS = 8000;
const FIRST_CONNECT_GRACE_MS = 2000;
const HUD_TOP_PX = 16;
const MINIMAP_GAP_PX = 8; // between the map panel and the HUD above and below it
const RAIL_CLEARANCE_PX = 68; // the icon rail's column on the right, same as the top-left stack's right-[68px]

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    // undefined = still checking for an existing session, null = logged out
    const [user, setUser] = useState(undefined);
    const [authError, setAuthError] = useState(null);

    const [stats, setStats] = useState({ coins: 0 });
    const [builder, setBuilder] = useState(null); // the server's builder state, plus receivedAt (local clock)
    const builderRef = useRef(null); // mirrors builder, for reading inside socket handlers
    const [clock, setClock] = useState(() => Date.now()); // re-renders animated storage numbers
    const [tasks, setTasks] = useState([]);
    const [recurringTasks, setRecurringTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Which dashboard page is showing (null = the meadow). Mirrors the address bar.
    const [dashboardPage, setDashboardPage] = useState(() => pageFromPath(window.location.pathname));
    const isDashboardOpen = dashboardPage !== null;
    const lastDashboardPage = useRef(dashboardPage || "goals");
    const navigate = useCallback((page) => {
        if (page) lastDashboardPage.current = page;
        setDashboardPage(page);
        const path = pathForPage(page);
        if (window.location.pathname !== path) window.history.pushState(null, "", path);
    }, []);
    const openDashboard = useCallback(() => navigate(lastDashboardPage.current), [navigate]);
    useEffect(() => {
        const here = window.location.pathname;
        if (here !== pathForPage(pageFromPath(here)) && visitIdFromPath(here) === null) window.history.replaceState(null, "", "/");
        const onPopState = () => {
            const path = window.location.pathname;
            setDashboardPage(pageFromPath(path));
            // Back/forward into or out of a friend's meadow.
            const friendId = visitIdFromPath(path);
            if (friendId !== null) socket.emit("visit_friend_map", { friendId });
            else leaveVisitRef.current?.();
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);
    const [dashboardRequest, setDashboardRequest] = useState(null);
    const leaveVisitRef = useRef(null);

    const [transactions, setTransactions] = useState([]);
    const [savingsGoals, setSavingsGoals] = useState([]);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [moneyToast, setMoneyToast] = useState(null); // { kind: "reward" | "error", text }
    const moneyToastTimer = useRef(null);
    const moneyToastRef = useRef(null); // mirrors the visible money toast, for merging inside socket handlers

    // Only one panel can be open at a time — they render in the same spot
    const [activeHudPanel, setActiveHudPanel] = useState(null); // null | "profile" | "agenda" | "friends" | "inventory" | "workers"
    const [isMinimapOpen, setIsMinimapOpen] = useState(false);
    const [minimapBottom, setMinimapBottom] = useState(0);
    const mapToggleRef = useRef(null);
    const hudStackRef = useRef(null);
    const bottomBarRef = useRef(null);

    const [selectedBuildingId, setSelectedBuildingId] = useState(null);
    const [aiThought, setAiThought] = useState(null);
    const [levelUp, setLevelUp] = useState(null); // null | { level }
    const [connection, setConnection] = useState("online"); // online | offline | lost
    const [keybindings, setKeybindings] = useState(DEFAULT_BINDINGS);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

    const [toasts, setToasts] = useState([]); // [{ id, kind, text, detail }]
    const toastSeq = useRef(0);
    const toastTimers = useRef(new Map()); // toast id -> its dismiss timer

    const [placing, setPlacing] = useState(null); // null | { label, mode }
    const placingRef = useRef(null);

    const [summon, setSummonState] = useState(null); // null | { round, requested, result: null | summon_result payload }
    const summonRef = useRef(null);
    const summonTimer = useRef(null);
    const summonRound = useRef(0);

    const tutorialBaseline = useRef(null); // today's counts when "Replay guide" was pressed
    const lastInventoryCount = useRef(null);

    const [friendsState, setFriendsState] = useState({ friends: [], incoming: [], outgoing: [] });
    const [friendSearchResults, setFriendSearchResults] = useState([]);
    const [visitingFriend, setVisitingFriend] = useState(null); // { host, buildings } | null

    useEffect(() => {
        fetch("/auth/me", { credentials: "include" })
            .then((res) => (res.ok ? res.json() : { user: null }))
            .then((data) => setUser(data.user))
            .catch(() => setUser(null));
    }, []);

    const handleLogin = async (credentialResponse, errorMessage) => {
        if (errorMessage) {
            setAuthError(errorMessage);
            return;
        }
        try {
            const res = await fetch("/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ credential: credentialResponse.credential }),
            });
            if (!res.ok) throw new Error("Login failed");
            const data = await res.json();
            setAuthError(null);
            setUser(data.user);
        } catch (err) {
            setAuthError("Sign-in failed. Please try again.");
        }
    };

    const handleLogout = async () => {
        try {
            await fetch("/auth/logout", { method: "POST", credentials: "include" });
        } finally {
            window.location.reload();
        }
    };

    const getScene = () => phaserRef.current?.scene?.scenes?.[0] ?? null;

    // The same message again just stays up longer instead of stacking.
    const toastsRef = useRef([]);
    const pushToast = useCallback((toast) => {
        const duplicate = toastsRef.current.find((t) => t.text === toast.text && t.detail === toast.detail);
        const id = duplicate ? duplicate.id : ++toastSeq.current;
        if (!duplicate) {
            toastsRef.current = [...toastsRef.current.slice(-2), { id, ...toast }];
            setToasts(toastsRef.current);
        }
        clearTimeout(toastTimers.current.get(id));
        toastTimers.current.set(
            id,
            setTimeout(
                () => {
                    toastTimers.current.delete(id);
                    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
                    setToasts(toastsRef.current);
                },
                toast.kind === "error" ? 4500 : 3500,
            ),
        );
    }, []);

    const setSummon = useCallback((value) => {
        summonRef.current = value;
        setSummonState(value);
        if (value?.result || !value) clearTimeout(summonTimer.current);
    }, []);

    // The scene's inspect callback; it may hand us the building or just its id.
    const inspectBuilding = useCallback((buildingOrId) => {
        const id = buildingOrId && typeof buildingOrId === "object" ? buildingOrId.id : buildingOrId;
        setSelectedBuildingId(id);
        if (isNarrowViewport()) {
            setActiveHudPanel(null);
            setIsMinimapOpen(false);
        }
    }, []);

    // Called by the scene when a placement ends, and by us on cancel, so it may run twice.
    // A cancel goes back to the inventory it came from; a success stays on the map.
    const finishPlacement = useCallback(({ ok } = {}) => {
        if (!placingRef.current) return;
        placingRef.current = null;
        setPlacing(null);
        if (!ok) setActiveHudPanel("inventory");
    }, []);

    // Saved optimistically: the coach shouldn't wait on a round trip to move on.
    const saveTutorial = useCallback((step, done) => {
        const apply = (b) => (b ? { ...b, tutorial: { step, done } } : b);
        builderRef.current = apply(builderRef.current);
        setBuilder(apply);
        emitAction("set_tutorial", { step, done });
    }, []);

    useEffect(() => {
        if (!user) return;

        socket.connect();

        if (gameContainerRef.current && !phaserRef.current) {
            phaserRef.current = initPhaser(
                gameContainerRef.current,
                socket,
                inspectBuilding,
                () => {
                    setSelectedBuildingId(null);
                    setIsModalOpen(true);
                },
                finishPlacement,
            );
        }

        const applyBuilder = (next) => {
            const prev = builderRef.current;
            // Payloads can overtake each other on the wire; a stale one would undo newer state.
            if (prev?.rev != null && next.rev != null && next.rev < prev.rev) return;
            const stamped = { ...next, receivedAt: Date.now() };
            builderRef.current = stamped;
            setBuilder(stamped);
            if (prev?.town && next.town && next.town.level > prev.town.level) setLevelUp({ level: next.town.level });
        };

        // refresh_data/refresh_money carry coins too, and aren't always followed by a builder_state.
        const syncCoins = (nextStats) => {
            const coins = nextStats?.coins;
            if (typeof coins !== "number" || !builderRef.current || builderRef.current.coins === coins) return;
            builderRef.current = { ...builderRef.current, coins };
            setBuilder((b) => (b ? { ...b, coins } : b));
        };

        const namedLine = (line, level = 1) => lineBuildingName(line, level, builderRef.current?.rules);

        // Named handlers, removed by reference in cleanup. The socket is shared with the
        // Phaser scene, which registers its own init_state/building_*/state_update
        // listeners — socket.off(event) with no handler would silently remove those too.
        const onInitState = (state) => {
            if (!state) return;
            if (state.stats) setStats(state.stats);
            if (state.tasks) setTasks(state.tasks);
            if (state.recurringTasks) setRecurringTasks(state.recurringTasks);
            if (state.transactions) setTransactions(state.transactions);
            if (state.savingsGoals) setSavingsGoals(state.savingsGoals);
            if (state.builder) applyBuilder(state.builder);
            if (state.settings?.keybindings) setKeybindings(state.settings.keybindings);
            // Opened (or reconnected) on /visit/<id>: show that friend's meadow, not ours.
            const friendId = visitIdFromPath(window.location.pathname);
            if (friendId !== null) socket.emit("visit_friend_map", { friendId });
        };

        const onBuilderState = (state) => {
            if (state) applyBuilder(state);
        };

        const onBuildingGenerated = ({ building, reason }) => {
            // A catch-up release on first load arrives before any builder state, so before the names.
            const rules = builderRef.current?.rules;
            const name = rules && building ? buildingName(building, rules) : "building";
            if (reason === "catch_up") {
                pushToast({ kind: "info", icon: "inventory", text: rules ? `${name} arrived` : "A building arrived", detail: "One from your waiting list." });
            } else if (reason === "money_log") {
                pushToast({ kind: "info", icon: "inventory", text: `New ${name}`, detail: "Today's log built it. It's in your inventory." });
            } else {
                pushToast({ kind: "info", icon: "inventory", text: `New ${name}`, detail: "It's in your inventory, ready to place." });
            }
        };

        const onBuildingPooled = ({ line, poolCount, poolMax }) => {
            pushToast({ kind: "info", text: `${namedLine(line)} is waiting`, detail: `You've built plenty today. It comes on a later visit (${poolCount}/${poolMax}).` });
        };

        const onMergeDone = ({ building, cost }) => {
            pushToast({ kind: "reward", text: `${buildingName(building, builderRef.current?.rules)}!`, detail: `Merged for ${cost} coins.` });
            const seen = markTipSeen(builderRef.current?.tutorial, "merge");
            if (seen) saveTutorial(seen.step, seen.done);
        };

        const onCoinsCollected = ({ total, bonus }) => {
            if (total > 0) pushToast({ kind: "reward", icon: "collect", text: `+${total}`, detail: bonus > 0 ? `Includes ${bonus} from Early Bird.` : "Collected." });
            else pushToast({ kind: "info", text: "Nothing to collect yet", detail: "Coins are still on their way." });
            const tutorial = builderRef.current?.tutorial;
            if (total > 0 && tutorial && !tutorial.done && finishFirstDay(tutorial.step) !== tutorial.step) saveTutorial(finishFirstDay(tutorial.step), false);
        };

        const onZoneExpanded = () => {
            pushToast({ kind: "reward", icon: "expand", text: "New land!", detail: "Your town has room to grow." });
        };

        const onAutoPlaceDone = ({ placed, remaining }) => {
            if (placed > 0) {
                pushToast({ kind: "info", icon: "inventory", text: `Placed ${placed}`, detail: remaining > 0 ? `No room for ${remaining} more. Expanding makes space.` : "" });
            } else if (remaining > 0) {
                pushToast({ kind: "error", text: "No free spot", detail: "Move something, or expand your land." });
            }
        };

        const onSummonResult = (data) => {
            const seen = markTipSeen(builderRef.current?.tutorial, "summon");
            if (seen) saveTutorial(seen.step, seen.done);
            if (summonRef.current?.requested && !summonRef.current.result) {
                setSummon({ ...summonRef.current, result: data });
            } else {
                // Opened from another tab: no surprise overlay here, just the news.
                pushToast({ kind: "reward", icon: "summon", text: `${data.worker?.name}`, detail: "joined your town." });
            }
        };

        const onBuilderError = ({ code, message } = {}) => {
            if (summonRef.current?.requested && !summonRef.current.result) setSummon(null);
            // Going too fast isn't a mistake, so it doesn't get the red treatment.
            const slowDown = code === "RATE_LIMITED";
            pushToast({ kind: slowDown ? "info" : "error", text: slowDown ? "Easy there" : "Hmm", detail: builderErrorMessage(code, message) });
        };

        // Back-to-back rewards (e.g. log reward + milestone reward) merge into the visible
        // reward toast instead of replacing it. Errors always show on their own.
        const showMoneyToast = (toast) => {
            clearTimeout(moneyToastTimer.current);
            const current = moneyToastRef.current;
            let next = toast;
            if (toast.kind === "reward" && current && current.kind === "reward") {
                const coins = (current.coins || 0) + (toast.coins || 0);
                next = {
                    kind: "reward",
                    icon: "coin",
                    coins,
                    text: `+${coins}`,
                    detail: [current.detail, toast.detail].filter(Boolean).join(" · "),
                };
            }
            moneyToastRef.current = next;
            setMoneyToast(next);
            const timer = setTimeout(() => {
                if (moneyToastTimer.current !== timer) return; // superseded by a newer toast
                moneyToastTimer.current = null;
                moneyToastRef.current = null;
                setMoneyToast(null);
            }, 3500);
            moneyToastTimer.current = timer;
        };

        const onRefreshMoney = (data) => {
            if (data.stats) {
                setStats(data.stats);
                syncCoins(data.stats);
            }
            if (data.transactions) setTransactions(data.transactions);
            if (data.savingsGoals) setSavingsGoals(data.savingsGoals);
        };

        const onMoneyReward = (data) => {
            const coins = Number(data.coins) || 0;
            showMoneyToast({ kind: "reward", icon: "coin", coins, text: `+${coins}`, detail: data.reason });
        };

        const onMoneyError = (message) => {
            showMoneyToast({ kind: "error", text: "Hmm", detail: String(message) });
        };

        const onSettings = (settings) => {
            if (settings?.keybindings) setKeybindings(settings.keybindings);
        };
        const onSettingsError = (message) => {
            showMoneyToast({ kind: "error", text: "Hmm", detail: String(message) });
        };

        const onRefreshData = (data) => {
            setStats(data.stats);
            syncCoins(data.stats);
            setTasks(data.tasks);
        };

        const onRefreshRecurringTasks = (data) => {
            setRecurringTasks(data.recurringTasks);
        };

        const onAiThought = (data) => {
            setAiThought(data.thought);
        };

        // The building itself gets its own toast from building_generated / building_pooled.
        const onTaskReward = ({ coins, paidToday, pool_full: poolFull }) => {
            const cap = builderRef.current?.today_counts?.tasksPaidCap;
            const paid = cap ? `${paidToday}/${cap} paid today` : "";
            if (coins > 0) pushToast({ kind: "reward", icon: "coin", text: `+${coins}`, detail: paid });
            else pushToast({ kind: "info", text: "Task done", detail: cap ? `Today's ${cap} coin rewards are all paid.` : "" });
            if (poolFull) pushToast({ kind: "info", text: "Waiting list is full", detail: "No new building this time." });
        };

        const onFriendsState = (data) => {
            setFriendsState(data);
        };

        const onSearchUsersResult = (results) => {
            setFriendSearchResults(results);
        };

        const onVisitState = (data) => {
            const path = pathForVisit(data.host.id);
            if (window.location.pathname !== path) window.history.pushState(null, "", path);
            setVisitingFriend(data);
            setSelectedBuildingId(null);
            if (isNarrowViewport()) setActiveHudPanel(null); // the panel would hide the meadow being visited
            const scene = getScene();
            if (scene) scene.enterVisitMode(data.buildings, inspectBuilding);
        };

        const onVisitFailed = (message) => {
            console.error("❌ [Visit Failed]:", message);
            if (visitIdFromPath(window.location.pathname) !== null) window.history.replaceState(null, "", "/");
        };

        // Re-request on every (re)connect — a reconnect is a fresh server-side socket.
        // (The Phaser scene re-requests init_state on "connect" itself.)
        let cancelled = false;
        let serverKickRetries = 0; // per disconnect episode — reset on every successful connect

        const onConnect = () => {
            serverKickRetries = 0;
            clearTimeout(firstConnectTimer);
            setConnection("online");
            socket.emit("request_friends_state");
        };

        // Anything the Phaser scene emitted while offline is stale by the time we're back.
        const dropBufferedEmits = () => {
            socket.sendBuffer = [];
        };

        // A slow first connection only counts as a problem after a moment.
        const firstConnectTimer = setTimeout(() => {
            if (!socket.connected) setConnection("offline");
        }, FIRST_CONNECT_GRACE_MS);

        // socket.io-client auto-reconnects after transport drops, but NOT after the server
        // calls socket.disconnect() (reason "io server disconnect") — which is what happens
        // to a socket without a valid session. Re-check the session: 401 -> reload into the
        // login page; anything else (still logged in, 5xx, network error) -> retry with backoff.
        const onDisconnect = (reason) => {
            if (reason !== "io server disconnect") {
                setConnection("offline");
                return;
            }
            // No "Reconnecting…" yet: this may be a logout in another tab, which goes straight
            // to the login page. emitAction already refuses anything in the meantime.
            fetch("/auth/me", { credentials: "include" })
                .then((res) => res.status === 401)
                .catch(() => false) // network error: session state unknown, keep retrying
                .then((loggedOut) => {
                    if (cancelled) return;
                    if (loggedOut) {
                        window.location.reload();
                        return;
                    }
                    setConnection("offline");
                    if (serverKickRetries >= 3) {
                        console.error("❌ [Socket]: server keeps closing the connection; not retrying.");
                        setConnection("lost");
                        return;
                    }
                    serverKickRetries += 1;
                    setTimeout(() => {
                        if (cancelled) return;
                        dropBufferedEmits();
                        socket.connect();
                    }, 1000 * serverKickRetries);
                });
        };

        const handlers = {
            init_state: onInitState,
            builder_state: onBuilderState,
            building_generated: onBuildingGenerated,
            building_pooled: onBuildingPooled,
            merge_done: onMergeDone,
            coins_collected: onCoinsCollected,
            zone_expanded: onZoneExpanded,
            auto_place_done: onAutoPlaceDone,
            summon_result: onSummonResult,
            builder_error: onBuilderError,
            refresh_money: onRefreshMoney,
            money_reward: onMoneyReward,
            money_error: onMoneyError,
            settings: onSettings,
            settings_error: onSettingsError,
            refresh_data: onRefreshData,
            refresh_recurring_tasks: onRefreshRecurringTasks,
            ai_thought_broadcast: onAiThought,
            task_reward: onTaskReward,
            friends_state: onFriendsState,
            search_users_result: onSearchUsersResult,
            visit_state: onVisitState,
            visit_failed: onVisitFailed,
            connect: onConnect,
            disconnect: onDisconnect,
        };
        Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
        socket.io.on("reconnect_attempt", dropBufferedEmits);

        // Already connected (effect re-run under HMR): "connect" won't fire again.
        if (socket.connected) onConnect();

        // Daily counters and sleep state only change on the server; catch up when the tab returns.
        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;
            setClock(Date.now());
            if (socket.connected) socket.emit("request_builder_state");
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        const storageTick = setInterval(() => setClock(Date.now()), STORAGE_TICK_MS);
        const pendingToastTimers = toastTimers.current;

        return () => {
            cancelled = true;
            Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
            socket.io.off("reconnect_attempt", dropBufferedEmits);
            clearTimeout(firstConnectTimer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            clearInterval(storageTick);
            pendingToastTimers.forEach(clearTimeout);
            pendingToastTimers.clear();
            clearTimeout(summonTimer.current);
            clearTimeout(moneyToastTimer.current);
            moneyToastTimer.current = null;
            moneyToastRef.current = null;
        };
    }, [user, pushToast, setSummon, inspectBuilding, finishPlacement, saveTutorial]);

    // Push the server's town into the scene. State can arrive before the scene is running
    // (it's still preloading), so keep retrying until it can take it. While touring a
    // friend's meadow the scene shows their buildings; leaving re-requests init_state.
    const placedBuildings = builder?.placed;
    const zone = builder?.zone;
    const sleepy = builder?.sleepy;
    const isVisiting = !!visitingFriend;
    useEffect(() => {
        if (!placedBuildings || isVisiting) return undefined;
        let retry = null;
        const syncScene = () => {
            const scene = getScene();
            if (!scene?.sys?.isActive?.() || typeof scene.syncBuildings !== "function") {
                retry = setTimeout(syncScene, 150);
                return;
            }
            try {
                scene.syncBuildings(placedBuildings);
                scene.setZone(zone);
                scene.setSleepy(!!sleepy);
            } catch (err) {
                console.error("❌ [Scene Sync Failed]:", err);
            }
        };
        syncScene();
        return () => clearTimeout(retry);
    }, [placedBuildings, zone, sleepy, isVisiting]);

    // Guided first day: move the coach along as real state changes.
    const pendingTaskCount = tasks.filter((t) => t.status === "pending").length;
    useEffect(() => {
        const inventoryCount = builder?.inventory?.length;
        const previousCount = lastInventoryCount.current;
        lastInventoryCount.current = inventoryCount ?? null;

        const tutorial = builder?.tutorial;
        if (!tutorial || tutorial.done) return;
        const next = advanceFirstDay(tutorial.step, {
            builder,
            pendingTaskCount,
            baseline: tutorialBaseline.current,
            inventoryShrank: previousCount != null && inventoryCount < previousCount,
        });
        if (next > Math.max(tutorial.step, 1)) saveTutorial(next, false);
    }, [builder, pendingTaskCount, saveTutorial]);

    // Freeze input controls when an overlay or a panel with inputs is open (typing "w" in a
    // search box must not walk the player, and global capture would swallow the letter)
    const keyboardFrozen = isModalOpen || isDashboardOpen || isQuickAddOpen || isShortcutsOpen || activeHudPanel === "friends" || activeHudPanel === "workers" || !!summon || connection !== "online";
    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (keyboardFrozen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.enabled = false;
            scene.input.keyboard.resetKeys();
            if (window.player && window.player.body) window.player.body.setVelocity(0);
        } else {
            scene.input.keyboard.enabled = true;
            scene.input.keyboard.enableGlobalCapture();
        }
    }, [keyboardFrozen]);

    // Esc backs out of whatever is on top. The summon reveal and quick-log handle their own.
    // Right-click does the same, and never opens the browser menu ("Copy image" and so on),
    // except in text fields, where copy and paste still matter.
    useEffect(() => {
        const backOut = () => {
            if (summonRef.current || isQuickAddOpen || isDashboardOpen) return;
            if (placingRef.current) {
                getScene()?.cancelPlacement?.();
                finishPlacement({ ok: false });
            } else if (isModalOpen) {
                setIsModalOpen(false);
            } else if (activeHudPanel) {
                setActiveHudPanel(null);
            } else if (selectedBuildingId) {
                setSelectedBuildingId(null);
                getScene()?.clearActiveMenu?.();
            }
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") backOut();
        };
        const onContextMenu = (e) => {
            if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
            e.preventDefault();
            backOut();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("contextmenu", onContextMenu);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("contextmenu", onContextMenu);
        };
    }, [isModalOpen, isQuickAddOpen, isDashboardOpen, activeHudPanel, selectedBuildingId, finishPlacement]);

    // The Phaser-side map opens directly below the town sign and stops short of whatever is in the
    // bottom bar on its side of the screen. Both change height with builder state and the screen, so
    // this measures after every render. It also catches the map being opened before create() ran.
    useEffect(() => {
        const place = () => {
            const scene = getScene();
            if (!scene?.toggleMinimap) return;
            if (scene.minimapVisible !== isMinimapOpen) scene.toggleMinimap(isMinimapOpen);
            if (!isMinimapOpen || !hudStackRef.current || !mapToggleRef.current) return;
            const top = Math.max(hudStackRef.current.getBoundingClientRect().bottom, mapToggleRef.current.getBoundingClientRect().bottom) + MINIMAP_GAP_PX;
            const right = window.innerWidth - RAIL_CLEARANCE_PX;
            const inBottomBar = [...(bottomBarRef.current?.children || [])].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.left < right && r.right > MINIMAP_CONFIG.FRAME_LEFT);
            const bottom = Math.min(window.innerHeight, ...inBottomBar.map((r) => r.top)) - MINIMAP_GAP_PX;
            setMinimapBottom(Math.ceil(scene.placeMinimap({ top, right, bottom })));
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    });

    const handleAddTask = ({ title, category, date, estimatedMinutes }) => {
        emitAction("add_task", { title, category, due_date: date, estimated_minutes: estimatedMinutes });
    };

    const handleEditTask = ({ id, title, category, date, estimatedMinutes }) => {
        emitAction("edit_task", { id, title, category, due_date: date, estimated_minutes: estimatedMinutes });
    };

    const handleDeleteTask = (id) => {
        emitAction("delete_task", id);
    };

    const handleCompleteTask = (id) => {
        emitAction("complete_task", id);
    };

    const handleAddRecurringTask = ({ title, category, estimatedMinutes, startTime, endTime }) => {
        emitAction("add_recurring_task", { title, category, estimated_minutes: estimatedMinutes, days_of_week: ALL_DAYS, start_time: startTime, end_time: endTime });
    };

    const handleEditRecurringTask = ({ id, title, category, estimatedMinutes, startTime, endTime }) => {
        emitAction("edit_recurring_task", { id, title, category, estimated_minutes: estimatedMinutes, days_of_week: ALL_DAYS, start_time: startTime, end_time: endTime });
    };

    const handleDeleteRecurringTask = (id) => {
        emitAction("delete_recurring_task", id);
    };

    const handleToggleRecurringTask = ({ id, active }) => {
        emitAction("toggle_recurring_task", { id, active });
    };

    const handleAddTransaction = ({ amountCents, direction, category, subcategory, note, savingsGoalId }) => {
        emitAction("add_transaction", { amountCents, direction, category, subcategory, note, savingsGoalId });
    };

    const handleDeleteTransaction = (id) => {
        emitAction("delete_transaction", id);
    };

    const handleAddSavingsGoal = ({ title, targetCents, deadline }) => {
        emitAction("add_savings_goal", { title, targetCents, deadline });
    };

    const handleDeleteSavingsGoal = (id) => {
        emitAction("delete_savings_goal", id);
    };

    const handleSearchFriends = (query) => {
        if (query.trim().length >= 2) emitAction("search_users", { query });
        else setFriendSearchResults([]);
    };

    const handleSendFriendRequest = (addresseeId) => {
        emitAction("send_friend_request", { addresseeId });
    };

    const handleRespondFriendRequest = (requestId, accept) => {
        emitAction("respond_friend_request", { requestId, accept });
    };

    const handleRemoveFriend = (friendshipId) => {
        emitAction("remove_friend", { friendshipId });
    };

    const handleVisitFriend = (friendId) => {
        emitAction("visit_friend_map", { friendId });
    };

    // Leaving puts the address back to "/" (unless Back already did).
    const handleLeaveVisit = () => {
        setVisitingFriend(null);
        setSelectedBuildingId(null);
        const scene = getScene();
        if (scene) scene.exitVisitMode();
        if (visitIdFromPath(window.location.pathname) !== null) window.history.pushState(null, "", "/");
    };
    leaveVisitRef.current = handleLeaveVisit;

    const togglePanel = (panel) => {
        if (isNarrowViewport()) {
            setSelectedBuildingId(null);
            setIsMinimapOpen(false);
        }
        setActiveHudPanel((current) => (current === panel ? null : panel));
    };

    const handleToggleMinimap = () => {
        if (!isMinimapOpen && isNarrowViewport()) {
            setActiveHudPanel(null);
            setSelectedBuildingId(null);
            getScene()?.clearActiveMenu?.();
        }
        setIsMinimapOpen(!isMinimapOpen);
    };

    const closeBuildingCard = () => {
        setSelectedBuildingId(null);
        getScene()?.clearActiveMenu?.();
    };

    const startPlacement = (request, label) => {
        const scene = getScene();
        if (typeof scene?.beginPlacement !== "function" || !scene.sys?.isActive?.()) {
            pushToast({ kind: "error", text: "Hang on", detail: "The map is still loading." });
            return;
        }
        if (scene.beginPlacement(request) === false) return;
        setActiveHudPanel(null);
        setSelectedBuildingId(null);
        const next = { label, mode: request.mode };
        placingRef.current = next;
        setPlacing(next);
    };

    const handlePlaceFromInventory = (building) => {
        startPlacement({ buildingId: building.id, footprint: building.footprint, mode: "place", assetKey: building.asset_key }, buildingName(building, builder?.rules));
    };

    const handleBuyDecoration = (assetKey) => {
        startPlacement({ buildingId: null, footprint: builder?.rules?.FOOTPRINT?.decoration, mode: "purchase", assetKey }, decorationName(assetKey));
    };

    // From the Quick log's Save tab: straight to the Money page with the new-goal form open.
    const handleStartSavingsGoal = () => {
        setIsQuickAddOpen(false);
        setDashboardRequest({ newSavingsGoal: true, id: Date.now() });
        navigate("money");
    };

    const handleCancelPlacement = () => {
        getScene()?.cancelPlacement?.();
        finishPlacement({ ok: false });
    };

    const handleCollect = (buildingId) => emitAction("collect", { buildingId });
    const handleCollectAll = () => emitAction("collect_all", {});
    const handleAutoPlace = () => emitAction("auto_place", {});
    const handleExpand = () => emitAction("expand_zone", {});
    const handleSetStaffMode = (buildingId, mode) => emitAction("set_staff_mode", { buildingId, mode });
    const handleAssignWorker = (workerId, buildingId) => emitAction("assign_worker", { workerId, buildingId });

    // Shows the closed box. Nothing goes to the server until it's tapped open.
    const handleOpenSummon = () => {
        summonRound.current += 1;
        setSummon({ round: summonRound.current, requested: false, result: null });
    };

    const handleRequestSummon = () => {
        if (!emitAction("open_summon", {})) return false;
        setSummon({ ...summonRef.current, requested: true });
        clearTimeout(summonTimer.current);
        summonTimer.current = setTimeout(() => {
            if (summonRef.current?.requested && !summonRef.current.result) {
                setSummon(null);
                pushToast({ kind: "error", text: "Hmm", detail: "The summon didn't come through. Your gift is safe, so try again." });
            }
        }, SUMMON_TIMEOUT_MS);
        return true;
    };

    const handleCloseSummon = useCallback(() => setSummon(null), [setSummon]);
    const handleLevelUpDone = useCallback(() => setLevelUp(null), []);

    const handleSkipGuide = () => {
        tutorialBaseline.current = null;
        saveTutorial(builder?.tutorial?.step ?? 0, true);
    };

    // Saved per account; every signed-in tab gets the "settings" echo. Shown at once here.
    const handleChangeKeybindings = useCallback((next) => {
        setKeybindings(next);
        emitAction("save_keybindings", { keybindings: next });
    }, []);

    // The scene walks with the same keys.
    useEffect(() => {
        let retry = null;
        const apply = () => {
            const scene = getScene();
            if (!scene?.setMoveBindings || !scene.sys?.isActive?.()) return void (retry = setTimeout(apply, 200));
            scene.setMoveBindings(keybindings);
        };
        apply();
        return () => clearTimeout(retry);
    }, [keybindings, user]);

    // App shortcuts (Quick log, Tasks, map ...). Never while typing, with Ctrl/Alt/Cmd held, or
    // with a form or reveal on top. The latest handler sits in a ref so the listener is added once.
    const shortcutRef = useRef(null);
    shortcutRef.current = (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const el = document.activeElement;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
        if (isModalOpen || isQuickAddOpen || isShortcutsOpen || summon || placing) return;
        const action = Object.keys(keybindings).find((id) => keybindings[id] === e.code);
        if (!action || action.startsWith("move")) return;
        const inMeadow = !isDashboardOpen && !visitingFriend;
        if (action === "quickLog" && !visitingFriend) setIsQuickAddOpen(true);
        else if (action === "tasks" && !visitingFriend) isDashboardOpen ? navigate(null) : openDashboard();
        else if (action === "map" && !isDashboardOpen) handleToggleMinimap();
        else if (action === "buildings" && inMeadow && builder) togglePanel("inventory");
        else if (action === "collect" && inMeadow && builder) handleCollectAll();
        else if (action === "help") setIsShortcutsOpen(true);
        else return;
        e.preventDefault();
    };
    useEffect(() => {
        if (!user) return undefined;
        const onKeyDown = (e) => shortcutRef.current?.(e);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [user]);

    const handleReplayGuide = () => {
        const counts = builder?.today_counts;
        tutorialBaseline.current = { tasksPaid: counts?.tasksPaid ?? 0, logsPaid: counts?.logsPaid ?? 0 };
        setActiveHudPanel(null);
        saveTutorial(0, false);
    };

    const handleCoachAction = (key) => {
        const tutorial = builder?.tutorial;
        if (key === "add_task") setIsModalOpen(true);
        else if (key === "open_agenda") setActiveHudPanel("agenda");
        else if (key === "open_inventory") setActiveHudPanel("inventory");
        else if (key === "open_log") setIsQuickAddOpen(true);
        else if (key === "open_summon") handleOpenSummon();
        else if (key === "finish_first_day") {
            tutorialBaseline.current = null;
            saveTutorial(finishFirstDay(tutorial.step), false);
        } else if (key === "tip_merge" || key === "tip_summon") {
            const seen = markTipSeen(tutorial, key === "tip_merge" ? "merge" : "summon");
            if (seen) saveTutorial(seen.step, seen.done);
        }
    };

    const pendingCount = pendingTaskCount;
    const selectedBuilding = selectedBuildingId == null ? null : (visitingFriend ? visitingFriend.buildings : builder?.placed || []).find((b) => b.id === selectedBuildingId) || null;
    const storageClock = Math.max(clock, builder?.receivedAt || 0);
    const collectTotal = collectableCoins(builder, storageClock);
    const rewardPreview = taskRewardPreview(builder);
    const rules = builder?.rules;
    const coach = coachMessage(builder, storageClock);
    const reveal = hudReveal(builder, friendsState);
    const showBottomBar = !isDashboardOpen && !visitingFriend && !placing;
    const panelCoversMap = !!activeHudPanel || !!selectedBuilding; // below lg, nothing else fits beside one

    const toastList = moneyToast ? [{ id: "money", ...moneyToast }, ...toasts] : toasts;
    const toastTop = isMinimapOpen && minimapBottom ? minimapBottom + MINIMAP_GAP_PX : HUD_TOP_PX + (visitingFriend ? 68 : 60) + (builder?.sleepy && !visitingFriend ? 52 : 0);
    const toastPlacement = isDashboardOpen ? "dashboard" : activeHudPanel ? "panel" : "map";

    if (user === undefined) {
        return <div className="font-pixel w-screen h-screen bg-[#3f7a3a] flex items-center justify-center text-[#f6e6c8] text-xl">Loading...</div>;
    }

    if (!user) {
        return <LoginPage onLogin={handleLogin} error={authError} />;
    }

    return (
        <div className="w-screen h-screen bg-[#3f7a3a] overflow-hidden select-none font-sans">
            <div id="master-container" className="relative w-full h-full">
                {/* Core Fullscreen Game Screen Canvas Block Container */}
                <div ref={gameContainerRef} id="game-container" className="absolute inset-0 w-full h-full z-10" />

                {/* What's on the tile you tapped: live from builder state, or a friend's row while visiting */}
                {selectedBuilding && !placing && (
                    <BuildingCard
                        building={selectedBuilding}
                        builder={builder}
                        clock={storageClock}
                        readOnly={!!visitingFriend}
                        hostName={visitingFriend?.host?.name}
                        goal={visitingFriend ? null : savingsGoals.find((g) => g.building_id === selectedBuilding.id)}
                        sourceTask={visitingFriend ? null : tasks.find((t) => t.building_id === selectedBuilding.id)}
                        onClose={closeBuildingCard}
                        onCollect={handleCollect}
                        onSetStaffMode={handleSetStaffMode}
                    />
                )}

                {/* Minimap Toggle — left of the town sign; the panel opens below the sign and
                    lines up with it (MINIMAP_CONFIG.FRAME_LEFT), so nothing moves when it opens */}
                <button
                    ref={mapToggleRef}
                    onClick={handleToggleMinimap}
                    title="Toggle map"
                    style={{ top: `${MINIMAP_CONFIG.MARGIN_TOP}px` }}
                    aria-label="Toggle map"
                    aria-pressed={isMinimapOpen}
                    className={btn(isMinimapOpen ? "pressed" : "muted", "fixed left-4 z-30 !p-0 w-11 h-11")}
                >
                    <Icon name="map" />
                </button>

                {/* Top-left stack beside the map toggle: town stats, or the banner while visiting.
                    Clicks pass through the empty parts of the stack to the game underneath. */}
                <div ref={hudStackRef} className="fixed z-30 left-4 right-[68px] lg:right-auto flex flex-col items-start gap-1.5 pointer-events-none" style={{ top: HUD_TOP_PX }}>
                    {visitingFriend ? (
                        <div
                            className={`pointer-events-auto px-2.5 py-1.5 flex items-center gap-3 lg:fixed lg:top-6 lg:left-1/2 lg:-translate-x-1/2 ml-[52px] lg:ml-0 ${PANEL_CLASS}`}
                        >
                            <span className="text-xs">
                                Visiting <strong className="font-pixel text-sm">{visitingFriend.host.name || "a friend"}'s</strong> meadow
                            </span>
                            <button onClick={handleLeaveVisit} className={btn("next", "shrink-0")}>
                                Leave
                            </button>
                        </div>
                    ) : (
                        builder && <BuilderHud builder={builder} reveal={reveal} onOpenProfile={() => togglePanel("profile")} leaveRoomForMapToggle />
                    )}
                </div>

                {/* Panels rail + popovers (mutually exclusive — same screen slot). While placing,
                    the map and the placement bar are the only things that matter. */}
                {!placing && (
                    <HudIconRail
                        activePanel={activeHudPanel}
                        onTogglePanel={togglePanel}
                        pendingCount={pendingCount}
                        friendRequestCount={friendsState.incoming.length}
                        inventoryCount={builder?.inventory?.length || 0}
                        summonCount={builder?.workers?.pendingSummons || 0}
                        showBuilder={!!builder && !visitingFriend}
                        showWorkers={reveal.workers}
                        showFriends={reveal.friends}
                        onSummon={handleOpenSummon}
                    />
                )}
                {activeHudPanel === "profile" && <ProfilePanel stats={stats} builder={builder} aiThought={aiThought} user={user} onLogout={handleLogout} onReplayGuide={handleReplayGuide} onOpenShortcuts={() => setIsShortcutsOpen(true)} />}
                {activeHudPanel === "agenda" && <AgendaPanel tasks={tasks} onCompleteTask={handleCompleteTask} />}
                {activeHudPanel === "inventory" && builder && (
                    <InventoryPanel
                        builder={builder}
                        onPlace={handlePlaceFromInventory}
                        onAutoPlace={handleAutoPlace}
                        onBuyDecoration={handleBuyDecoration}
                        onOpenGoals={() => {
                            setActiveHudPanel(null);
                            openDashboard();
                        }}
                    />
                )}
                {activeHudPanel === "workers" && builder && <WorkersPanel builder={builder} onSummon={handleOpenSummon} onAssign={handleAssignWorker} />}
                {activeHudPanel === "friends" && (
                    <FriendsPanel
                        friendsState={friendsState}
                        searchResults={friendSearchResults}
                        onSearch={handleSearchFriends}
                        onSendRequest={handleSendFriendRequest}
                        onRespondRequest={handleRespondFriendRequest}
                        onRemoveFriend={handleRemoveFriend}
                        onVisit={handleVisitFriend}
                    />
                )}

                {/* Every toast: rewards, builder news, errors */}
                <ToastStack toasts={toastList} topPx={toastTop} placement={toastPlacement} />

                {/* Bottom bar: coach, builder actions, then Goals + Log. Hidden on a friend's
                    meadow, and while placing, when it gives way to the placement bar. */}
                {showBottomBar && (
                    <div ref={bottomBarRef} className="fixed bottom-6 left-4 right-4 z-20 flex flex-col items-center gap-2 pointer-events-none [&>*]:pointer-events-auto">
                        {coach && <CoachBubble message={coach} onAction={handleCoachAction} onSkip={handleSkipGuide} hideBelowLg={panelCoversMap} />}
                        {builder && (
                            <BuilderActions
                                builder={builder}
                                collectTotal={collectTotal}
                                coachTarget={coach?.target}
                                showExpand={reveal.expand}
                                hideBelowLg={panelCoversMap}
                                onOpenInventory={() => togglePanel("inventory")}
                                onCollectAll={handleCollectAll}
                                onExpand={handleExpand}
                                onExpandBlocked={(why) => pushToast({ kind: "info", icon: "expand", text: "Not yet", detail: why })}
                            />
                        )}
                        <div className="flex items-center justify-center gap-2">
                            <button onClick={openDashboard} data-coach-target="goals" className={btn(coach?.target === "goals" ? "next" : "muted", `!text-sm px-4 ${coach?.target === "goals" ? "hud-nudge" : ""}`)}>
                                <Icon name="goals" /> Tasks
                            </button>
                            <button onClick={() => setIsQuickAddOpen(true)} data-coach-target="log" className={btn(coach?.target === "log" ? "next" : "muted", `!text-sm px-4 ${coach?.target === "log" ? "hud-nudge" : ""}`)}>
                                <Icon name="log" /> Log
                            </button>
                        </div>
                    </div>
                )}

                {/* Placement bar: what you're placing, and the way out */}
                {placing && (
                    <div className="fixed bottom-6 left-4 right-4 z-20 flex justify-center pointer-events-none">
                        <div className={`pointer-events-auto pl-3 pr-1.5 py-1.5 flex items-center gap-3 max-w-full ${PANEL_CLASS}`}>
                            <span className="text-xs min-w-0">
                                Tap a free spot for <strong className="font-pixel text-sm">{placing.label}</strong>
                            </span>
                            <button onClick={handleCancelPlacement} className={btn("muted", "shrink-0")}>
                                Cancel<span className="hidden lg:inline"> (Esc)</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Creation Prompt Modal Panel Form */}
            <TaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onCreateTask={handleAddTask} rewardPreview={rewardPreview} rules={rules} />

            {/* Tasks, calendar, habits and money */}
            <TaskDashboard
                isOpen={isDashboardOpen}
                page={dashboardPage}
                onNavigate={navigate}
                onClose={() => navigate(null)}
                tasks={tasks}
                recurringTasks={recurringTasks}
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
                onCompleteTask={handleCompleteTask}
                onAddRecurringTask={handleAddRecurringTask}
                onEditRecurringTask={handleEditRecurringTask}
                onDeleteRecurringTask={handleDeleteRecurringTask}
                onToggleRecurringTask={handleToggleRecurringTask}
                transactions={transactions}
                savingsGoals={savingsGoals}
                onAddSavingsGoal={handleAddSavingsGoal}
                onDeleteSavingsGoal={handleDeleteSavingsGoal}
                onDeleteTransaction={handleDeleteTransaction}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                rewardPreview={rewardPreview}
                rules={rules}
                request={dashboardRequest}
            />

            {/* Money quick-log (rendered above the dashboard so it also works from the Money page) */}
            <QuickAddMoney isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} onSubmit={handleAddTransaction} savingsGoals={savingsGoals} transactions={transactions} onStartSavingsGoal={handleStartSavingsGoal} />

            {isShortcutsOpen && <ShortcutsModal bindings={keybindings} onChange={handleChangeKeybindings} onClose={() => setIsShortcutsOpen(false)} />}

            {/* Mystery summon reveal */}
            {summon && <SummonReveal key={summon.round} result={summon.result} onRequest={handleRequestSummon} onClose={handleCloseSummon} onOpenAnother={handleOpenSummon} />}

            {levelUp && <LevelUpBanner key={levelUp.level} level={levelUp.level} onDone={handleLevelUpDone} />}

            {connection !== "online" && <ConnectionBanner lost={connection === "lost"} />}
        </div>
    );
}
