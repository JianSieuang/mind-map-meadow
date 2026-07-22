import React from "react";

export default function BuildingCard({ data }) {
    return (
        <div className="absolute bottom-6 left-6 z-30 w-[300px] bg-[#23232e]/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-wide mb-1">Structure Stats</h3>
            <div className="text-xs text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: data }}></div>
        </div>
    );
}
