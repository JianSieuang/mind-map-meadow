import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game";
import Sidebar from "./components/Sidebar";
import TaskModal from "./components/TaskModal";
import BuildingCard from "./components/BuildingCard";
import TaskDashboard from "./components/TaskDashboard";

const socket = io();

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    const [stats, setStats] = useState({ level: 1, xp: 0, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);

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
        });

        socket.on("refresh_data", (data) => {
            setStats(data.stats);
            setTasks(data.tasks);
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

    return (
        <div className="w-screen h-screen bg-[#1e1e24] overflow-hidden select-none font-sans">
            <div id="master-container" className="relative w-full h-full">
                {/* Core Fullscreen Game Screen Canvas Block Container */}
                <div ref={gameContainerRef} id="game-container" className="absolute inset-0 w-full h-full z-10" />

                {/* Structure Specification Overview Card Panel */}
                {selectedBuildingId && selectedBuildingData && <BuildingCard data={selectedBuildingData} />}

                {/* Main Sidebar Control Center HUD Dashboard */}
                <Sidebar stats={stats} tasks={tasks} aiThought={aiThought} onCompleteTask={handleCompleteTask} />

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
                        className="fixed bottom-6 right-6 z-20 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-full text-xs shadow-2xl transition flex items-center gap-1.5"
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
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
                onCompleteTask={handleCompleteTask}
            />
        </div>
    );
}
