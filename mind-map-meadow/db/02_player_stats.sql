-- Player Profile Management Engine
CREATE TABLE IF NOT EXISTS player_stats (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE DEFAULT 'chong',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    calories_burned INTEGER DEFAULT 0,
    custom_status VARCHAR(255) DEFAULT 'Cozying up',
    inventory JSONB DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default system user profile record
INSERT INTO player_stats (username) VALUES ('chong') ON CONFLICT (username) DO NOTHING;