import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game";
import { MINIMAP_CONFIG } from "./game/config";
import { ALL_DAYS } from "./utils/duration";
import ProfilePanel from "./components/ProfilePanel";
import AgendaPanel from "./components/AgendaPanel";
import HudIconRail from "./components/HudIconRail";
import TaskModal from "./components/TaskModal";
import BuildingCard from "./components/BuildingCard";
import TaskDashboard from "./components/TaskDashboard";

const socket = io();

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    const [stats, setStats] = useState({ level: 1, xp: 0, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [recurringTasks, setRecurringTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

    // Only one of Profile/Agenda can be open at a time — they render in the same spot
    const [activeHudPanel, setActiveHudPanel] = useState(null); // null | "profile" | "agenda"
    const [isMinimapOpen, setIsMinimapOpen] = useState(false);

    const [selectedBuildingId, setSelectedBuildingId] = useState(null);
    const [selectedBuildingData, setSelectedBuildingData] = useState(null);
    const [aiThought, setAiThought] = useState("Awaiting model data synchronization pass...");
    const [rewardToast, setRewardToast] = useState(null);

    useEffect(() => {
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

        socket.on("init_state", (state) => {
            if (state.stats) setStats(state.stats);
            if (state.tasks) setTasks(state.tasks);
            if (state.recurringTasks) setRecurringTasks(state.recurringTasks);
        });

        socket.on("refresh_data", (data) => {
            setStats(data.stats);
            setTasks(data.tasks);
        });

        socket.on("refresh_recurring_tasks", (data) => {
            setRecurringTasks(data.recurringTasks);
        });

        socket.on("inspection_details", (content) => {
            setSelectedBuildingData(content);
        });

        socket.on("ai_thought_broadcast", (data) => {
            setAiThought(data.thought);
        });

        socket.on("task_reward", (data) => {
            setRewardToast(data);
            setTimeout(() => setRewardToast(null), 3500);
        });

        return () => {
            socket.off("init_state");
            socket.off("refresh_data");
            socket.off("refresh_recurring_tasks");
            socket.off("inspection_details");
            socket.off("ai_thought_broadcast");
            socket.off("task_reward");
        };
    }, []);

    // Freeze input controls when a full-screen overlay (task modal or dashboard) is open
    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (isModalOpen || isDashboardOpen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.enabled = false;
            scene.input.keyboard.resetKeys();
            if (window.player && window.player.body) window.player.body.setVelocity(0);
        } else {
            scene.input.keyboard.enabled = true;
            scene.input.keyboard.enableGlobalCapture();
        }
    }, [isModalOpen, isDashboardOpen]);

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

    const pendingCount = tasks.filter((t) => t.status === "pending").length;

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

                {/* Profile / Agenda Icon Rail + Popover Panels (mutually exclusive — same screen slot) */}
                <HudIconRail
                    isProfileOpen={activeHudPanel === "profile"}
                    isAgendaOpen={activeHudPanel === "agenda"}
                    onToggleProfile={() => setActiveHudPanel((p) => (p === "profile" ? null : "profile"))}
                    onToggleAgenda={() => setActiveHudPanel((p) => (p === "agenda" ? null : "agenda"))}
                    pendingCount={pendingCount}
                />
                {activeHudPanel === "profile" && <ProfilePanel stats={stats} aiThought={aiThought} />}
                {activeHudPanel === "agenda" && <AgendaPanel tasks={tasks} onCompleteTask={handleCompleteTask} />}

                {/* Reward Toast */}
                {rewardToast && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#23232e]/95 border border-emerald-500/50 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2">
                        <span className="text-yellow-400 font-bold text-sm">🪙 +{rewardToast.totalCoins}</span>
                        <span className="text-xs text-slate-300">
                            {rewardToast.isOnTime ? `(${rewardToast.baseCoins} base + ${rewardToast.bonusCoins} on-time bonus)` : `(${rewardToast.baseCoins} base, overdue)`}
                        </span>
                    </div>
                )}

                {/* Dashboard Toggle */}
                {!isDashboardOpen && (
                    <button
                        onClick={() => setIsDashboardOpen(true)}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-full text-xs shadow-2xl transition flex items-center gap-1.5"
                    >
                        📋 Goals
                    </button>
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
            />
        </div>
    );
}
