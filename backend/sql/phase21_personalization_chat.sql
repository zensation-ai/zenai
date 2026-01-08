-- Phase 21: Personalization Chat - "Lerne mich kennen"
-- Enables AI to learn about the user through conversation

-- Store personal facts learned about the user
CREATE TABLE IF NOT EXISTS personal_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,  -- e.g., 'personality', 'preferences', 'goals', 'background', 'work', 'interests'
    fact_key VARCHAR(100) NOT NULL,
    fact_value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.8,  -- 0.0 to 1.0, how confident we are about this fact
    source VARCHAR(20) DEFAULT 'conversation',  -- 'conversation', 'inferred', 'explicit'
    asked_question TEXT,  -- The question that led to this fact
    user_response TEXT,   -- The user's original response
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_personal_facts_category ON personal_facts(category);
CREATE INDEX IF NOT EXISTS idx_personal_facts_key ON personal_facts(fact_key);

-- Track conversation history for personalization chats
CREATE TABLE IF NOT EXISTS personalization_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('ai', 'user')),
    message TEXT NOT NULL,
    facts_extracted JSONB DEFAULT '[]',  -- Facts extracted from this message
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pers_conv_session ON personalization_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_pers_conv_created ON personalization_conversations(created_at DESC);

-- Track which topics have been explored
CREATE TABLE IF NOT EXISTS personalization_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(100) NOT NULL UNIQUE,
    questions_asked INTEGER DEFAULT 0,
    last_asked_at TIMESTAMP WITH TIME ZONE,
    completion_level DECIMAL(3,2) DEFAULT 0.0,  -- 0.0 to 1.0
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initialize default topics to explore
INSERT INTO personalization_topics (topic, completion_level) VALUES
    ('basic_info', 0.0),
    ('personality', 0.0),
    ('work_life', 0.0),
    ('goals_dreams', 0.0),
    ('interests_hobbies', 0.0),
    ('communication_style', 0.0),
    ('decision_making', 0.0),
    ('daily_routines', 0.0),
    ('values_beliefs', 0.0),
    ('challenges', 0.0)
ON CONFLICT (topic) DO NOTHING;

-- Comments
COMMENT ON TABLE personal_facts IS 'Stores learned facts about the user from conversations';
COMMENT ON TABLE personalization_conversations IS 'History of personalization chat sessions';
COMMENT ON TABLE personalization_topics IS 'Tracks which topics have been explored with the user';
