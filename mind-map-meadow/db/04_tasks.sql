-- Calendar Productivity & Fitness Log Tracker Table
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

-- Estimated effort (minutes) used to compute the coin reward on completion
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 30;