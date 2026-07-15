-- Visual Layout Coordinates Grid Table
CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    content TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);