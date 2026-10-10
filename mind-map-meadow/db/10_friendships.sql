-- Friend relationships between accounts. A single row per requester/addressee
-- pair tracks the whole lifecycle: 'pending' until the addressee responds,
-- then flips to 'accepted' (rejections just delete the row rather than being
-- tracked, so a rejected request can simply be re-sent later).
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT no_self_friendship CHECK (requester_id <> addressee_id),
    CONSTRAINT unique_friendship_pair UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id);
