import React from "react";

export default function HudIconRail({ isProfileOpen, isAgendaOpen, onToggleProfile, onToggleAgenda, pendingCount }) {
    return (
        <div className="fixed top-6 right-6 z-30 flex flex-col gap-3">
            <button
                onClick={onToggleProfile}
                title="Profile"
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg border transition ${
                    isProfileOpen ? "bg-indigo-600 border-indigo-400 text-white" : "bg-[#23232e]/90 border-slate-700 text-slate-200 hover:border-indigo-400"
                }`}
            >
                👤
            </button>
            <button
                onClick={onToggleAgenda}
                title="Agenda"
                className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg border transition ${
                    isAgendaOpen ? "bg-indigo-600 border-indigo-400 text-white" : "bg-[#23232e]/90 border-slate-700 text-slate-200 hover:border-indigo-400"
                }`}
            >
                📋
                {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-yellow-500 text-[#1e1e24] text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{pendingCount}</span>
                )}
            </button>
        </div>
    );
}
