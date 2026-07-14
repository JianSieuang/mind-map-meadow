-- Enable the local pgvector extension for local LLM semantic searches
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Player Profile Management Engine
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

-- 2. Visual Layout Coordinates Grid Table
CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    content TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Calendar Productivity & Fitness Log Tracker Table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    building_id INTEGER REFERENCES buildings(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    coins_earned INTEGER DEFAULT 0,
    calories_burned INTEGER DEFAULT 0,
    due_date DATE NOT NULL,
    completed_at TIMESTAMP DEFAULT NULL
);

-- 4. Local AI Narrative Vector Memory Table
CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,
    summary_date DATE DEFAULT CURRENT_DATE,
    summary_text TEXT NOT NULL,
    stats_snapshot JSONB NOT NULL,
    embedding vector(768) DEFAULT NULL
);

-- Seed default system user profile record
INSERT INTO player_stats (username) VALUES ('chong') ON CONFLICT (username) DO NOTHING;