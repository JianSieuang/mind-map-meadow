import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game";
import Sidebar from "./components/Sidebar";
import TaskModal from "./components/TaskModal";
import BuildingCard from "./components/BuildingCard";

const socket = io();

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    const [stats, setStats] = useState({ level: 1, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [selectedBuildingId, setSelectedBuildingId] = useState(null);
    const [selectedBuildingData, setSelectedBuildingData] = useState(null);
    const [aiThought, setAiThought] = useState("Awaiting model data synchronization pass...");

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

        return () => {
            socket.off("init_state");
            socket.off("refresh_data");
            socket.off("inspection_details");
            socket.off("ai_thought_broadcast");
        };
    }, []);

    // Freeze input controls when the task window overlay pops up
    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (isModalOpen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.enabled = false;
            scene.input.keyboard.resetKeys();
            if (window.player && window.player.body) window.player.body.setVelocity(0);
        } else {
            scene.input.keyboard.enabled = true;
            scene.input.keyboard.enableGlobalCapture();
        }
    }, [isModalOpen]);

    const handleAddTask = ({ title, category, date }) => {
        socket.emit("add_task", { title, category, due_date: date });
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
            </div>

            {/* Creation Prompt Modal Panel Form */}
            <TaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onCreateTask={handleAddTask} />
        </div>
    );
}
