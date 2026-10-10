import React, { useState } from "react";

function renderStatusAction(result, onSendRequest, onRespondRequest) {
    if (result.friendshipStatus === "accepted") {
        return <span className="text-[10px] text-emerald-400 font-semibold shrink-0">✓ Friends</span>;
    }
    if (result.friendshipStatus === "pending" && result.isIncomingRequest) {
        return (
            <button onClick={() => onRespondRequest(result.friendshipId, true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[10px] transition shrink-0">
                Accept
            </button>
        );
    }
    if (result.friendshipStatus === "pending") {
        return <span className="text-[10px] text-slate-500 italic shrink-0">Pending</span>;
    }
    return (
        <button onClick={() => onSendRequest(result.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-2 rounded text-[10px] transition shrink-0">
            Add
        </button>
    );
}

export default function FriendsPanel({ friendsState, searchResults, onSearch, onSendRequest, onRespondRequest, onRemoveFriend, onVisit }) {
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState("friends");

    const { friends = [], incoming = [], outgoing = [] } = friendsState || {};

    const handleQueryChange = (e) => {
        const value = e.target.value;
        setQuery(value);
        onSearch(value);
    };

    return (
        <div className="absolute top-6 right-20 z-20 w-[300px] max-h-[calc(100vh-8rem)] p-4 flex flex-col gap-3 rounded-xl bg-[#23232e]/90 backdrop-blur-md border border-slate-700/60 shadow-[0_0_40px_-10px_rgba(99,102,241,0.35)] overflow-y-auto">
            <h3 className="text-xs font-bold tracking-wide border-b border-slate-700 pb-1.5 text-slate-200 flex items-center gap-1.5">
                👥 Friends
                {incoming.length > 0 && <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{incoming.length}</span>}
            </h3>

            <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="🔍 Search by name or email..."
                className="w-full p-2 rounded-lg border border-slate-700 bg-[#2a2a35] text-white text-xs focus:outline-none focus:border-indigo-500"
            />

            {query.trim().length >= 2 && (
                <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto border-b border-slate-700 pb-2">
                    {searchResults.length === 0 && <p className="text-[11px] text-slate-500 italic text-center py-2">No users found.</p>}
                    {searchResults.map((result) => (
                        <div key={result.id} className="bg-[#2a2a35] p-2 rounded-lg flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                                {result.avatarUrl && <img src={result.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />}
                                <span className="text-[11px] text-slate-200 truncate">{result.name || result.email}</span>
                            </div>
                            {renderStatusAction(result, onSendRequest, onRespondRequest)}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-1.5">
                <button
                    onClick={() => setTab("friends")}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${tab === "friends" ? "bg-[#2a2a35] text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    Friends ({friends.length})
                </button>
                <button
                    onClick={() => setTab("requests")}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${tab === "requests" ? "bg-[#2a2a35] text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    Requests {incoming.length > 0 && <span className="bg-yellow-500/20 text-yellow-400 text-[9px] font-bold px-1 rounded-full ml-0.5">{incoming.length}</span>}
                </button>
            </div>

            <div className="flex flex-col gap-2">
                {tab === "friends" &&
                    (friends.length === 0 ? (
                        <p className="text-[11px] text-slate-500 text-center py-4 italic">No friends yet — search above to add some!</p>
                    ) : (
                        friends.map((friend) => (
                            <div key={friend.friendshipId} className="bg-[#2a2a35] p-2.5 rounded-lg flex items-center justify-between gap-2">
                                <div className="min-w-0 flex items-center gap-2">
                                    {friend.avatarUrl && <img src={friend.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />}
                                    <span className="text-xs text-white truncate">{friend.name || friend.email}</span>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <button onClick={() => onVisit(friend.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-2 rounded text-[10px] transition">
                                        🚪 Visit
                                    </button>
                                    <button onClick={() => onRemoveFriend(friend.friendshipId)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-2 rounded text-[10px] transition">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    ))}

                {tab === "requests" && (
                    <>
                        {incoming.length === 0 && outgoing.length === 0 && <p className="text-[11px] text-slate-500 text-center py-4 italic">No pending requests.</p>}
                        {incoming.map((req) => (
                            <div key={req.friendshipId} className="bg-[#2a2a35] p-2.5 rounded-lg flex items-center justify-between gap-2 border-l-4 border-yellow-500">
                                <div className="min-w-0 flex items-center gap-2">
                                    {req.avatarUrl && <img src={req.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />}
                                    <span className="text-xs text-white truncate">{req.name || req.email}</span>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <button
                                        onClick={() => onRespondRequest(req.friendshipId, true)}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2 rounded text-[10px] transition"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => onRespondRequest(req.friendshipId, false)}
                                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1 px-2 rounded text-[10px] transition"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                        {outgoing.map((req) => (
                            <div key={req.friendshipId} className="bg-[#2a2a35] p-2.5 rounded-lg flex items-center justify-between gap-2 opacity-70">
                                <div className="min-w-0 flex items-center gap-2">
                                    {req.avatarUrl && <img src={req.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />}
                                    <span className="text-xs text-slate-300 truncate">{req.name || req.email}</span>
                                </div>
                                <span className="text-[10px] text-slate-500 italic shrink-0">Requested</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
