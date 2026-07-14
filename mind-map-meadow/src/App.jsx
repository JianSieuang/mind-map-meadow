import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { initPhaser } from "./game/MeadowGame";

const socket = io();

export default function App() {
    const gameContainerRef = useRef(null);
    const phaserRef = useRef(null);

    const [stats, setStats] = useState({ level: 1, coins: 0, calories_burned: 0 });
    const [tasks, setTasks] = useState([]);
    const [inspectedContent, setInspectedContent] = useState("Click a building on the map to open its control action menu and view performance metrics!");
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [formTitle, setFormTitle] = useState("");
    const [formCategory, setFormCategory] = useState("Coding");
    const [formDate, setFormDate] = useState("");

    useEffect(() => {
        if (gameContainerRef.current && !phaserRef.current) {
            phaserRef.current = initPhaser(
                gameContainerRef.current,
                socket,
                (id) => {
                    socket.emit("inspect_building", id);
                },
                () => {
                    setIsModalOpen(true); // Fired cleanly when the floating grass text prompt is clicked
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
            setInspectedContent(content);
        });

        return () => {
            socket.off("init_state");
            socket.off("refresh_data");
            socket.off("inspection_details");
        };
    }, []);

    useEffect(() => {
        if (!phaserRef.current) return;
        const scene = phaserRef.current.scene.scenes[0];
        if (!scene || !scene.input || !scene.input.keyboard) return;

        if (isModalOpen) {
            scene.input.keyboard.disableGlobalCapture();
            scene.input.keyboard.resetKeys();
            const playerBody = scene.children.list.find((obj) => obj.body);
            if (playerBody && playerBody.body) playerBody.body.setVelocity(0);
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
        <div className="w-screen h-screen bg-[#1e1e24] overflow-hidden select-none">
            <div id="master-container" className="relative w-full h-full">
                {/* Unified Game Viewport Anchor */}
                <div ref={gameContainerRef} id="game-container" className="absolute inset-0 w-full h-full z-10"></div>

                {/* Floating Sidebar HUD HUD Layer Container Control Wrapper */}
                <div id="sidebar" className="absolute top-20 right-6 z-20 w-[340px] max-h-[calc(100vh-6rem)] p-4 flex flex-col gap-4 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-2xl overflow-y-auto">
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

                    <div>
                        <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center gap-1">🔍 Inspected Structure</h3>
                        <div className="bg-[#1b1b22] p-3 rounded-lg border border-slate-700/80 min-h-[75px]">
                            <div className="text-xs text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: inspectedContent }}></div>
                        </div>
                    </div>

                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center gap-1">📅 Active Agenda</h3>
                        <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
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
                        </div>
                    </div>
                </div>
            </div>

            {/* Task Initialization Input Form Sheet Popup */}
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
                                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Complete Unity blueprints" required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[11px] text-slate-400 font-semibold">Category Type</label>
                                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none">
                                    <option value="Coding">💻 Coding Assignment</option>
                                    <option value="Fitness">🏋️ Fitness Exercise</option>
                                    <option value="Finance">💰 Expense Record</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[11px] text-slate-400 font-semibold">Target Deadline</label>
                                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required className="p-2 rounded-lg border border-slate-700 bg-[#1e1e24] text-white text-xs focus:outline-none" />
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
