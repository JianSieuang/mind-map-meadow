import React, { useState } from "react";
import { Icon } from "./Sprites";
import { COUNT_CHIP_CLASS, HUD_PANEL_CLASS, INPUT_CLASS, MUTED_TEXT_CLASS, PANEL_TITLE_CLASS, ROW_CLASS, SEGMENT_GROUP_CLASS, btn, segment } from "./hudStyles";

// The server only sends an email for accepted friends, and a name isn't guaranteed.
function displayName(person) {
    return person.name || person.email || "A fellow townsfolk";
}

function Person({ person }) {
    return (
        <div className="min-w-0 flex-1 flex items-center gap-2">
            {person.avatarUrl && <img src={person.avatarUrl} alt="" className="w-6 h-6 rounded-sm border border-[#2b1e1a] shrink-0" />}
            <span className="text-xs truncate">{displayName(person)}</span>
        </div>
    );
}

function renderStatusAction(result, onSendRequest, onRespondRequest) {
    if (result.friendshipStatus === "accepted") {
        return <span className="text-xs text-[#3f7a3a] font-semibold shrink-0">Friends</span>;
    }
    if (result.friendshipStatus === "pending" && result.isIncomingRequest) {
        return (
            <button onClick={() => onRespondRequest(result.friendshipId, true)} className={btn("confirm", "shrink-0")}>
                Accept
            </button>
        );
    }
    if (result.friendshipStatus === "pending") {
        return <span className={`${MUTED_TEXT_CLASS} shrink-0`}>Pending</span>;
    }
    return (
        <button onClick={() => onSendRequest(result.id)} className={btn("muted", "shrink-0")}>
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
        <div className={HUD_PANEL_CLASS}>
            <h3 className={PANEL_TITLE_CLASS}>
                <Icon name="friends" /> Friends
                {incoming.length > 0 && <span className={COUNT_CHIP_CLASS}>{incoming.length}</span>}
            </h3>

            <input type="text" value={query} onChange={handleQueryChange} placeholder="Full email, or part of a name" aria-label="Search for a friend" className={INPUT_CLASS} />

            {query.trim().length >= 2 && (
                <div className="flex flex-col max-h-[180px] overflow-y-auto border-b-2 border-[#cfa877] pb-1">
                    {searchResults.length === 0 && <p className={`${MUTED_TEXT_CLASS} text-center py-2`}>No one found. Try their full email.</p>}
                    {searchResults.map((result) => (
                        <div key={result.id} className={ROW_CLASS}>
                            <Person person={result} />
                            {renderStatusAction(result, onSendRequest, onRespondRequest)}
                        </div>
                    ))}
                </div>
            )}

            <div className={`${SEGMENT_GROUP_CLASS} grid-cols-2`}>
                <button onClick={() => setTab("friends")} aria-pressed={tab === "friends"} className={segment(tab === "friends")}>
                    Friends ({friends.length})
                </button>
                <button onClick={() => setTab("requests")} aria-pressed={tab === "requests"} className={segment(tab === "requests")}>
                    Requests ({incoming.length})
                </button>
            </div>

            <div className="flex flex-col">
                {tab === "friends" &&
                    (friends.length === 0 ? (
                        <p className={`${MUTED_TEXT_CLASS} text-center py-3`}>No friends yet. Search above to add some.</p>
                    ) : (
                        friends.map((friend) => (
                            <div key={friend.friendshipId} className={ROW_CLASS}>
                                <Person person={friend} />
                                <button onClick={() => onVisit(friend.id)} className={btn("muted", "shrink-0")}>
                                    Visit
                                </button>
                                <button onClick={() => onRemoveFriend(friend.friendshipId)} aria-label={`Remove ${displayName(friend)}`} className={btn("danger", "shrink-0")}>
                                    Remove
                                </button>
                            </div>
                        ))
                    ))}

                {tab === "requests" && (
                    <>
                        {incoming.length === 0 && outgoing.length === 0 && <p className={`${MUTED_TEXT_CLASS} text-center py-3`}>No pending requests.</p>}
                        {incoming.map((req) => (
                            <div key={req.friendshipId} className={ROW_CLASS}>
                                <Person person={req} />
                                <button onClick={() => onRespondRequest(req.friendshipId, true)} className={btn("confirm", "shrink-0")}>
                                    Accept
                                </button>
                                <button onClick={() => onRespondRequest(req.friendshipId, false)} className={btn("danger", "shrink-0")}>
                                    Reject
                                </button>
                            </div>
                        ))}
                        {outgoing.map((req) => (
                            <div key={req.friendshipId} className={ROW_CLASS}>
                                <Person person={req} />
                                <span className={`${MUTED_TEXT_CLASS} shrink-0`}>Requested</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
