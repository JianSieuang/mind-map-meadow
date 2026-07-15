DROP TABLE IF EXISTS ai_analysis;

-- Local AI Narrative Vector Memory Table 
CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,
    analysis_text TEXT NOT NULL,
    raw_response TEXT,
    summary_date DATE DEFAULT CURRENT_DATE,
    stats_snapshot JSONB DEFAULT '{}',
    embedding vector(768) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);