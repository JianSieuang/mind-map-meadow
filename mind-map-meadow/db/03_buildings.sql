-- Visual Layout Coordinates Grid Table
CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,          
    asset_key VARCHAR(100) NOT NULL,     
    x REAL NOT NULL,
    y REAL NOT NULL,
    content TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb, -- Deep dynamic metadata stack storing scales, rotations, flips, etc.
    created_at TIMESTAMP DEFAULT NOW()
);