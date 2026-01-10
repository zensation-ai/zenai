-- Phase 22: Daily Learning Tasks
-- Enables users to assign topics for the AI to study and deepen knowledge in

-- Main learning tasks table
CREATE TABLE IF NOT EXISTS daily_learning_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    context VARCHAR(20) NOT NULL DEFAULT 'personal' CHECK (context IN ('personal', 'work')),

    -- Task details
    topic VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),  -- e.g., 'leadership', 'technology', 'business', 'personal_development'
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),

    -- Learning tracking
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    target_completion_date TIMESTAMP WITH TIME ZONE,
    completed_date TIMESTAMP WITH TIME ZONE,
    last_study_date TIMESTAMP WITH TIME ZONE,
    study_count INTEGER DEFAULT 0,
    total_study_minutes INTEGER DEFAULT 0,
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),

    -- AI-generated content
    learning_outline TEXT,           -- AI-generated learning plan/outline
    key_concepts JSONB DEFAULT '[]', -- Extracted key concepts
    resources JSONB DEFAULT '[]',    -- Suggested resources (books, articles, etc.)
    summary TEXT,                    -- AI-generated summary of learned content

    -- Relationship tracking
    related_ideas JSONB DEFAULT '[]',    -- Related idea IDs
    related_meetings JSONB DEFAULT '[]', -- Related meeting IDs

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_dlt_user_id ON daily_learning_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_dlt_context ON daily_learning_tasks(context);
CREATE INDEX IF NOT EXISTS idx_dlt_status ON daily_learning_tasks(status);
CREATE INDEX IF NOT EXISTS idx_dlt_category ON daily_learning_tasks(category);
CREATE INDEX IF NOT EXISTS idx_dlt_priority ON daily_learning_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_dlt_created_at ON daily_learning_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlt_last_study ON daily_learning_tasks(last_study_date DESC);

-- Learning sessions - track individual study sessions
CREATE TABLE IF NOT EXISTS learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES daily_learning_tasks(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',

    -- Session details
    session_type VARCHAR(50) NOT NULL DEFAULT 'study' CHECK (session_type IN ('study', 'practice', 'review', 'quiz', 'reflection')),
    duration_minutes INTEGER,

    -- Content
    notes TEXT,
    key_learnings JSONB DEFAULT '[]',  -- Key points learned in this session
    questions JSONB DEFAULT '[]',       -- Questions that came up

    -- AI interaction
    ai_summary TEXT,          -- AI summary of the session
    ai_feedback TEXT,         -- AI feedback on progress
    understanding_level INTEGER CHECK (understanding_level >= 1 AND understanding_level <= 5),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ls_task_id ON learning_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_ls_user_id ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ls_created_at ON learning_sessions(created_at DESC);

-- Learning insights - AI-generated insights about learning patterns
CREATE TABLE IF NOT EXISTS learning_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    task_id UUID REFERENCES daily_learning_tasks(id) ON DELETE SET NULL,

    insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('pattern', 'recommendation', 'milestone', 'connection', 'suggestion')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.8,

    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_li_user_id ON learning_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_li_task_id ON learning_insights(task_id);
CREATE INDEX IF NOT EXISTS idx_li_type ON learning_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_li_acknowledged ON learning_insights(is_acknowledged);

-- Comments
COMMENT ON TABLE daily_learning_tasks IS 'User-assigned topics for the AI to study and learn about';
COMMENT ON TABLE learning_sessions IS 'Individual study sessions for learning tasks';
COMMENT ON TABLE learning_insights IS 'AI-generated insights about learning patterns and progress';

-- Default categories for learning tasks
INSERT INTO personalization_topics (topic, completion_level) VALUES
    ('learning_preferences', 0.0)
ON CONFLICT (topic) DO NOTHING;
