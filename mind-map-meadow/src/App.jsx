import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game";
import { MINIMAP_CONFIG } from "./game/config";
import { ALL_DAYS } from "./utils/duration";
import ProfilePanel from "./components/ProfilePanel";
import AgendaPanel from "./components/AgendaPanel";
import FriendsPanel from "./components/FriendsPanel";
import HudIconRail from "./components/HudIconRail";
import TaskModal from "./components/TaskModal";
import BuildingCard from "./components/BuildingCard";
import TaskDashboard from "./pages/TaskDashboard";
import LoginPage from "./pages/LoginPage";
import QuickAddMoney from "./components/QuickAddMoney";
import { browserTimeZone } from "./utils/dates";
import { escapeHtml } from "./utils/html";

// One socket for the page's lifetime. Under Vite HMR this module re-executes; reuse the
// existing socket so the already-running Phaser scene (which holds a reference to it)
// and App stay on the same connection instead of App silently moving to a new one.
const socket = import.meta.hot?.data.socket ?? io({ autoConnect: false, withCredentials: true, auth: { timezone: browserTimeZone() } });
if (import.meta.hot) import.meta.hot.data.socket = socket;

// HTML for BuildingCard (rendered via dangerouslySetInnerHTML) when inspecting a friend's
// building. Every interpolated value is escaped — this is another account's data.
function visitBuildingCardHtml(building) {
    if (!building) return null;
    if (building.task_title) {
        return `<strong style="color:#4ade80;">💎 ${escapeHtml(building.task_title)}</strong><br/><small style="color:#a0a0b8;">Category: ${escapeHtml(building.task_category)}</small>`;
    }
    if (building.asset_key === "savings_project") {
        let meta = building.metadata;
        if (typeof meta === "string") {
            try {
                meta = JSON.parse(meta);
            } catch {
                meta = null;
            }
        }
        const stage = Number.parseInt(meta?.stage, 10);
        const stageText = Number.isFinite(stage) ? ` · Stage ${stage}/4` : "";
        // Title is private — only show a generic label
        return `<strong style="color:#facc15;">🏗️ Savings project${escapeHtml(stageText)}</strong>`;
    }
    return null;
}

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    // undefined = still checking for an existing session, null = logged out
    const [user, setUser] = useState(undefined);
    const [authError, setAuthError] = useState(null);

    const [stats, setStats] = useState({ level: 1, xp: 0, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [recurringTasks, setRecurringTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

    const [transactions, setTransactions] = useState([]);
    const [savingsGoals, setSavingsGoals] = useState([]);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [moneyToast, setMoneyToast] = useState(null); // { kind: "reward" | "error", text }
    const moneyToastTimer = useRef(null);
    const moneyToastRef = useRef(null); // mirrors the visible money toast, for merging inside socket handlers

    // Only one of Profile/Agenda/Friends can be open at a time — they render in the same spot
    const [activeHudPanel, setActiveHudPanel] = useState(null); // null | "profile" | "agenda" | "friends"
    const [isMinimapOpen, setIsMinimapOpen] = useState(false);

    const [selectedBuildingId, setSelectedBuildingId] = useState(null);
    const [selectedBuildingData, setSelectedBuildingData] = useState(null);
    const [aiThought, setAiThought] = useState("Awaiting model data synchronization pass...");
    const [rewardToast, setRewardToast] = useState(null);

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

    useEffect(() => {
        if (!user) return;

        socket.connect();

        if (gameContainerRef.current && !phaserRef.current) {
            phaserRef.current = initPhaser(
                gameContainerRef.current,
                socket,
                (id) => {
                    setSelectedBuildingId(id);
                    socket.emit("inspect_building", id);
                },
                () => {
                    setSelectedBuildingId(null);
                    setSelectedBuildingData(null);
                    setIsModalOpen(true);
                },
            );
        }

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
                    coins,
                    text: `🪙 +${coins}`,
                    detail: [current.detail, toast.detail].filter(Boolean).join(" · "),
                };
            }
            moneyToastRef.current = next;
            setMoneyToast(next);
            if (toast.sticky) {
                moneyToastTimer.current = null; // stays until replaced (e.g. "Connection lost")
                return;
            }
            const timer = setTimeout(() => {
                if (moneyToastTimer.current !== timer) return; // superseded by a newer toast
                moneyToastTimer.current = null;
                moneyToastRef.current = null;
                setMoneyToast(null);
            }, 3500);
            moneyToastTimer.current = timer;
        };

        const onRefreshMoney = (data) => {
            if (data.stats) setStats(data.stats);
            if (data.transactions) setTransactions(data.transactions);
            if (data.savingsGoals) setSavingsGoals(data.savingsGoals);
        };

        const onMoneyReward = (data) => {
            const coins = Number(data.coins) || 0;
            showMoneyToast({ kind: "reward", coins, text: `🪙 +${coins}`, detail: data.reason });
        };

        const onMoneyError = (message) => {
            showMoneyToast({ kind: "error", text: "⚠️", detail: String(message) });
        };

        const onRefreshData = (data) => {
            setStats(data.stats);
            setTasks(data.tasks);
        };

        const onRefreshRecurringTasks = (data) => {
            setRecurringTasks(data.recurringTasks);
        };

        const onInspectionDetails = (content) => {
            setSelectedBuildingData(content);
        };

        const onAiThought = (data) => {
            setAiThought(data.thought);
        };

        const onTaskReward = (data) => {
            setRewardToast(data);
            setTimeout(() => setRewardToast(null), 3500);
        };

        const onFriendsState = (data) => {
            setFriendsState(data);
        };

        const onSearchUsersResult = (results) => {
            setFriendSearchResults(results);
        };

        const onVisitState = (data) => {
            setVisitingFriend(data);
            setSelectedBuildingId(null);
            setSelectedBuildingData(null);
            const scene = phaserRef.current?.scene.scenes[0];
            if (scene) {
                scene.enterVisitMode(data.buildings, (id) => {
                    setSelectedBuildingId(id);
                    const building = data.buildings.find((b) => b.id === id);
                    setSelectedBuildingData(visitBuildingCardHtml(building));
                });
            }
        };

        const onVisitFailed = (message) => {
            console.error("❌ [Visit Failed]:", message);
        };

        // Re-request on every (re)connect — a reconnect is a fresh server-side socket.
        // (The Phaser scene re-requests init_state on "connect" itself.)
        let cancelled = false;
        let serverKickRetries = 0; // per disconnect episode — reset on every successful connect

        const onConnect = () => {
            serverKickRetries = 0;
            socket.emit("request_friends_state");
        };

        // socket.io-client auto-reconnects after transport drops, but NOT after the server
        // calls socket.disconnect() (reason "io server disconnect") — which is what happens
        // to a socket without a valid session. Re-check the session: 401 -> reload into the
        // login page; anything else (still logged in, 5xx, network error) -> retry with backoff.
        const onDisconnect = (reason) => {
            if (reason !== "io server disconnect") return;
            fetch("/auth/me", { credentials: "include" })
                .then((res) => res.status === 401)
                .catch(() => false) // network error: session state unknown, keep retrying
                .then((loggedOut) => {
                    if (cancelled) return;
                    if (loggedOut) {
                        window.location.reload();
                        return;
                    }
                    if (serverKickRetries >= 3) {
                        console.error("❌ [Socket]: server keeps closing the connection; not retrying.");
                        showMoneyToast({ kind: "error", text: "⚠️", detail: "Connection lost — please refresh", sticky: true });
                        return;
                    }
                    serverKickRetries += 1;
                    setTimeout(() => {
                        if (!cancelled) socket.connect();
                    }, 1000 * serverKickRetries);
                });
        };

        const handlers = {
            init_state: onInitState,
            refresh_money: onRefreshMoney,
            money_reward: onMoneyReward,
            money_error: onMoneyError,
            refresh_data: onRefreshData,
            refresh_recurring_tasks: onRefreshRecurringTasks,
            inspection_details: onInspectionDetails,
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

        // Already connected (effect re-run under HMR): "connect" won't fire again.
        if (socket.connected) onConnect();

        return () => {
            cancelled = true;
            Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
            clearTimeout(moneyToastTimer.current);
            moneyToastTimer.current = null;
            moneyToastRef.current = null;
        };
    }, [user]);

    // Freeze input controls when an overlay (task modal, money quick-add, or dashboard) is open
    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (isModalOpen || isDashboardOpen || isQuickAddOpen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.enabled = false;
            scene.input.keyboard.resetKeys();
            if (window.player && window.player.body) window.player.body.setVelocity(0);
        } else {
            scene.input.keyboard.enabled = true;
            scene.input.keyboard.enableGlobalCapture();
        }
    }, [isModalOpen, isDashboardOpen, isQuickAddOpen]);

    // Toggle the Phaser-side minimap camera/frame open or closed
    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.toggleMinimap) return;
        scene.toggleMinimap(isMinimapOpen);
    }, [isMinimapOpen]);

    const handleAddTask = ({ title, category, date, estimatedMinutes }) => {
        socket.emit("add_task", { title, category, due_date: date, estimated_minutes: estimatedMinutes });
    };

    const handleEditTask = ({ id, title, category, date, estimatedMinutes }) => {
        socket.emit("edit_task", { id, title, category, due_date: date, estimated_minutes: estimatedMinutes });
    };

    const handleDeleteTask = (id) => {
        socket.emit("delete_task", id);
    };

    const handleCompleteTask = (id) => {
        socket.emit("complete_task", id);
    };

    const handleAddRecurringTask = ({ title, category, estimatedMinutes, startTime, endTime }) => {
        socket.emit("add_recurring_task", { title, category, estimated_minutes: estimatedMinutes, days_of_week: ALL_DAYS, start_time: startTime, end_time: endTime });
    };

    const handleEditRecurringTask = ({ id, title, category, estimatedMinutes, startTime, endTime }) => {
        socket.emit("edit_recurring_task", { id, title, category, estimated_minutes: estimatedMinutes, days_of_week: ALL_DAYS, start_time: startTime, end_time: endTime });
    };

    const handleDeleteRecurringTask = (id) => {
        socket.emit("delete_recurring_task", id);
    };

    const handleToggleRecurringTask = ({ id, active }) => {
        socket.emit("toggle_recurring_task", { id, active });
    };

    const handleAddTransaction = ({ amountCents, direction, category, note, savingsGoalId }) => {
        socket.emit("add_transaction", { amountCents, direction, category, note, savingsGoalId });
    };

    const handleDeleteTransaction = (id) => {
        socket.emit("delete_transaction", id);
    };

    const handleAddSavingsGoal = ({ title, targetCents, deadline }) => {
        socket.emit("add_savings_goal", { title, targetCents, deadline });
    };

    const handleDeleteSavingsGoal = (id) => {
        socket.emit("delete_savings_goal", id);
    };

    const handleSearchFriends = (query) => {
        if (query.trim().length >= 2) socket.emit("search_users", { query });
        else setFriendSearchResults([]);
    };

    const handleSendFriendRequest = (addresseeId) => {
        socket.emit("send_friend_request", { addresseeId });
    };

    const handleRespondFriendRequest = (requestId, accept) => {
        socket.emit("respond_friend_request", { requestId, accept });
    };

    const handleRemoveFriend = (friendshipId) => {
        socket.emit("remove_friend", { friendshipId });
    };

    const handleVisitFriend = (friendId) => {
        socket.emit("visit_friend_map", { friendId });
    };

    const handleLeaveVisit = () => {
        setVisitingFriend(null);
        setSelectedBuildingId(null);
        setSelectedBuildingData(null);
        const scene = phaserRef.current?.scene.scenes[0];
        if (scene) scene.exitVisitMode();
    };

    const pendingCount = tasks.filter((t) => t.status === "pending").length;

    if (user === undefined) {
        return <div className="w-screen h-screen bg-[#1e1e24] flex items-center justify-center text-slate-400 text-sm">Loading...</div>;
    }

    if (!user) {
        return <LoginPage onLogin={handleLogin} error={authError} />;
    }

    return (
        <div className="w-screen h-screen bg-[#1e1e24] overflow-hidden select-none font-sans">
            <div id="master-container" className="relative w-full h-full">
                {/* Core Fullscreen Game Screen Canvas Block Container */}
                <div ref={gameContainerRef} id="game-container" className="absolute inset-0 w-full h-full z-10" />

                {/* Structure Specification Overview Card Panel */}
                {selectedBuildingId && selectedBuildingData && <BuildingCard data={selectedBuildingData} />}

                {/* Minimap Toggle — sits left of the minimap panel (which is offset via
                    MINIMAP_CONFIG.MARGIN_LEFT to leave exactly this much room), so the icon
                    always reads first and the panel opens after it, never underneath it */}
                <button
                    onClick={() => setIsMinimapOpen((open) => !open)}
                    title="Toggle map"
                    style={{ top: `${MINIMAP_CONFIG.MARGIN_TOP}px` }}
                    className={`fixed left-4 z-30 w-11 h-11 rounded-full flex items-center justify-center text-lg shadow-lg border transition ${
                        isMinimapOpen ? "bg-indigo-600 border-indigo-400 text-white" : "bg-[#23232e]/90 border-slate-700 text-slate-200 hover:border-indigo-400"
                    }`}
                >
                    🗺️
                </button>

                {/* Profile / Agenda / Friends Icon Rail + Popover Panels (mutually exclusive — same screen slot) */}
                <HudIconRail
                    isProfileOpen={activeHudPanel === "profile"}
                    isAgendaOpen={activeHudPanel === "agenda"}
                    isFriendsOpen={activeHudPanel === "friends"}
                    onToggleProfile={() => setActiveHudPanel((p) => (p === "profile" ? null : "profile"))}
                    onToggleAgenda={() => setActiveHudPanel((p) => (p === "agenda" ? null : "agenda"))}
                    onToggleFriends={() => setActiveHudPanel((p) => (p === "friends" ? null : "friends"))}
                    pendingCount={pendingCount}
                    friendRequestCount={friendsState.incoming.length}
                />
                {activeHudPanel === "profile" && <ProfilePanel stats={stats} aiThought={aiThought} user={user} onLogout={handleLogout} />}
                {activeHudPanel === "agenda" && <AgendaPanel tasks={tasks} onCompleteTask={handleCompleteTask} />}
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

                {/* Visiting banner — read-only tour of a friend's meadow */}
                {visitingFriend && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 bg-[#23232e]/95 border border-indigo-500/50 rounded-xl px-4 py-2 shadow-2xl flex items-center gap-3">
                        <span className="text-xs text-slate-200">
                            🚪 Visiting <strong>{visitingFriend.host.name || "a friend"}'s</strong> meadow (read-only)
                        </span>
                        <button onClick={handleLeaveVisit} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-2.5 rounded text-[11px] transition">
                            Leave
                        </button>
                    </div>
                )}

                {/* Reward Toast */}
                {rewardToast && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#23232e]/95 border border-emerald-500/50 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2">
                        <span className="text-yellow-400 font-bold text-sm">🪙 +{rewardToast.totalCoins}</span>
                        <span className="text-xs text-slate-300">
                            {rewardToast.isOnTime ? `(${rewardToast.baseCoins} base + ${rewardToast.bonusCoins} on-time bonus)` : `(${rewardToast.baseCoins} base, overdue)`}
                        </span>
                    </div>
                )}

                {/* Money toast (log reward / milestone / error) */}
                {moneyToast && (
                    <div
                        className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#23232e]/95 border rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2 ${
                            moneyToast.kind === "error" ? "border-rose-500/60" : "border-emerald-500/50"
                        }`}
                    >
                        <span className={`font-bold text-sm ${moneyToast.kind === "error" ? "text-rose-400" : "text-yellow-400"}`}>{moneyToast.text}</span>
                        {moneyToast.detail && <span className="text-xs text-slate-300">{moneyToast.detail}</span>}
                    </div>
                )}

                {/* Goals + Money quick-log — hidden while touring a friend's meadow */}
                {!isDashboardOpen && !visitingFriend && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                        <button
                            onClick={() => setIsDashboardOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-full text-xs shadow-2xl transition flex items-center gap-1.5"
                        >
                            📋 Goals
                        </button>
                        <button
                            onClick={() => setIsQuickAddOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-full text-xs shadow-2xl transition flex items-center gap-1.5"
                        >
                            💸 Log
                        </button>
                    </div>
                )}
            </div>

            {/* Creation Prompt Modal Panel Form */}
            <TaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onCreateTask={handleAddTask} />

            {/* Goal Dashboard Page */}
            <TaskDashboard
                isOpen={isDashboardOpen}
                onClose={() => setIsDashboardOpen(false)}
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
            />

            {/* Money quick-log (rendered above the dashboard so it also works from the Money page) */}
            <QuickAddMoney isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} onSubmit={handleAddTransaction} savingsGoals={savingsGoals} />
        </div>
    );
}
