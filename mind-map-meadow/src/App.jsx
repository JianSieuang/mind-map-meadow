import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game/MeadowGame";

const socket = io();

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    const [stats, setStats] = useState({ level: 1, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // HUD Inspection Target Variable Mappings
    const [selectedBuildingId, setSelectedBuildingId] = useState(null);
    const [selectedBuildingData, setSelectedBuildingData] = useState(null);
    const [aiThought, setAiThought] = useState("Awaiting model data synchronization pass...");

    const [formTitle, setFormTitle] = useState("");
    const [formCategory, setFormCategory] = useState("Coding");
    const [formDate, setFormDate] = useState("");

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
                    setIsModalOpen(true); // Fired directly through Phaser's upgraded rounded pill handler!
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

    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (isModalOpen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.resetKeys();
        } else {
            scene.input.keyboard.enableGlobalCapture();
        }
    }, [isModalOpen]);

    const handleCreateTask = (e) => {
        e.preventDefault();
        socket.emit("add_task", { title: formTitle, category: formCategory, due_date: formDate });
        setFormTitle("");
        setIsModalOpen(false);
    };

    const handleCompleteTask = (id) => {
        socket.emit("complete_task", id);
    };

    return (
        <div className="w-screen h-screen bg-[#1e1e24] overflow-hidden select-none font-sans">
            <div id="master-container" className="relative w-full h-full">
                {/* Full Screen Viewport Core Game Canvas Anchor */}
                <div ref={gameContainerRef} id="game-container" className="absolute inset-0 w-full h-full z-10"></div>

                {/* Floating Building Specification Card (Optional fallback display) */}
                {selectedBuildingId && selectedBuildingData && (
                    <div className="absolute bottom-6 left-6 z-30 w-[300px] bg-[#23232e]/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl animate-in fade-in duration-200">
                        <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-wide mb-1">Structure Stats</h3>
                        <div className="text-xs text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: selectedBuildingData }}></div>
                    </div>
                )}

                {/* Main Status HUD Sidebar Control Dashboard Container */}
                <div id="sidebar" className="absolute top-6 right-6 z-20 w-[340px] max-h-[calc(100vh-8rem)] p-4 flex flex-col gap-4 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-2xl overflow-y-auto">
                    <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border border-indigo-500/30 p-3.5 rounded-xl shadow-inner">
                        <h3 className="text-[11px] uppercase tracking-wider text-indigo-300 font-bold mb-1 flex items-center gap-1">
                            <span className="animate-pulse text-rose-400">🔴</span> Llama 3 Companion Brain
                        </h3>
                        <p className="text-xs text-slate-200 font-medium leading-relaxed italic">"{aiThought}"</p>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                            <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Level</h4>
                            <p className="text-lg font-bold text-blue-400">{stats.level}</p>
                        </div>
                        <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                            <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Coins</h4>
                            <p className="text-lg font-bold text-yellow-400">{stats.coins}</p>
                        </div>
                        <div className="flex-1 bg-[#2a2a35] p-2.5 rounded-lg text-center border border-slate-700">
                            <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Calories</h4>
                            <p className="text-lg font-bold text-emerald-400">{stats.calories_burned}</p>
                        </div>
                    </div>

                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center gap-1">📅 Active Agenda</h3>
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                            {tasks
                                .filter((t) => t.status === "pending")
                                .map((task) => (
                                    <div key={task.id} className="bg-[#2a2a35] p-2.5 rounded-lg flex justify-between items-center border-l-4 border-yellow-500 border-y border-r border-slate-700/60">
                                        <div className="max-w-[70%] truncate">
                                            <strong className="text-xs text-white block mb-0.5 truncate">{task.title}</strong>
                                            <small className="text-[9px] text-slate-400 font-semibold tracking-wide uppercase">{task.category}</small>
                                        </div>
                                        <button onClick={() => handleCompleteTask(task.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[11px] transition shrink-0">
                                            ✓ Done
                                        </button>
                                    </div>
                                ))}
                            {tasks.filter((t) => t.status === "pending").length === 0 && <p className="text-[11px] text-slate-500 text-center py-4 italic">Meadow clear! Click grass to add goals.</p>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Goal Generation Modal Form Container Box */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity">
                    <div className="bg-[#2a2a35] w-[380px] p-5 rounded-xl border border-slate-600 shadow-2xl flex flex-col gap-3.5">
                        <div className="flex justify-between items-center border-b border-slate-700 pb-1.5">
                            <h3 className="text-sm font-bold text-white">📝 Add New Goal</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-base px-1">
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleCreateTask} className="flex flex-col gap-3">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[11px] text-slate-400 font-semibold">Goal Description</label>
                                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Complete Unity blueprints" required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[11px] text-slate-400 font-semibold">Category Type</label>
                                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500">
                                    <option value="Coding">💻 Coding Assignment</option>
                                    <option value="Fitness">🏋️ Fitness Exercise</option>
                                    <option value="Finance">💰 Expense Record</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[11px] text-slate-400 font-semibold">Target Deadline</label>
                                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none focus:border-blue-500" />
                            </div>
                            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs shadow transition mt-1">
                                Log to Database
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
