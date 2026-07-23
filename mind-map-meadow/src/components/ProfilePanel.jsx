import React from "react";

function LevelRing({ level, xp }) {
    const threshold = level * 100;
    const pct = threshold > 0 ? Math.min(100, Math.round((xp / threshold) * 100)) : 0;

    return (
        <div className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center shadow-[0_0_12px_-2px_rgba(96,165,250,0.6)]" style={{ background: `conic-gradient(#60a5fa ${pct}%, #1e1e24 ${pct}% 100%)` }}>
            <div className="w-11 h-11 rounded-full bg-[#242430] flex items-center justify-center">
                <span className="text-base font-bold text-blue-400 leading-none">{level}</span>
            </div>
        </div>
    );
}

function StatBadge({ icon, tint }) {
    return <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${tint}`}>{icon}</div>;
}

export default function ProfilePanel({ stats, aiThought }) {
    const level = stats.level || 1;
    const xp = stats.xp || 0;
    const xpThreshold = level * 100;

    const caloriesGoal = 1000;
    const caloriesPct = Math.min(100, Math.round(((stats.calories_burned || 0) / caloriesGoal) * 100));

    return (
        <div className="absolute top-6 right-20 z-20 w-[300px] p-4 flex flex-col gap-4 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-[0_0_40px_-10px_rgba(99,102,241,0.35)]">
            {/* AI Narrative Monitor Component */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border border-indigo-500/30 p-3.5 rounded-xl shadow-inner">
                <h3 className="text-[11px] uppercase tracking-wider text-indigo-300 font-bold mb-1 flex items-center gap-1">
                    <span className="animate-pulse text-rose-400">🔴</span> Llama 3 Companion Brain
                </h3>
                <p className="text-xs text-slate-200 font-medium leading-relaxed italic">"{aiThought}"</p>
            </div>

            {/* Level / XP Progress Card */}
            <div className="bg-gradient-to-br from-[#2a2a35] to-[#242430] p-3 rounded-lg border border-slate-700 flex items-center gap-3">
                <LevelRing level={level} xp={xp} />
                <div className="min-w-0 flex-1">
                    <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Level</h4>
                    <div className="w-full h-1.5 bg-[#1e1e24] rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((xp / xpThreshold) * 100))}%` }} />
                    </div>
                    <p className="text-[9px] text-slate-500 mt-1">
                        {xp} / {xpThreshold} XP
                    </p>
                </div>
            </div>

            {/* Coins / Calories Metric Blocks */}
            <div className="flex gap-3">
                <div className="flex-1 bg-gradient-to-br from-[#2a2a35] to-[#242430] p-2.5 rounded-lg border border-slate-700 flex flex-col items-center gap-1.5">
                    <StatBadge icon="🪙" tint="bg-yellow-500/15" />
                    <p className="text-lg font-bold text-yellow-400 leading-none">{stats.coins}</p>
                    <h4 className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Coins</h4>
                </div>
                <div className="flex-1 bg-gradient-to-br from-[#2a2a35] to-[#242430] p-2.5 rounded-lg border border-slate-700 flex flex-col items-center gap-1.5">
                    <StatBadge icon="🔥" tint="bg-emerald-500/15" />
                    <p className="text-lg font-bold text-emerald-400 leading-none">{stats.calories_burned}</p>
                    <h4 className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Calories</h4>
                    <div className="w-full h-1 bg-[#1e1e24] rounded-full overflow-hidden mt-0.5">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${caloriesPct}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
