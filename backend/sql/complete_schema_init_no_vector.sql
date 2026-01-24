-- ==============================================
-- PersonalAIBrain - Database Schema (No Vector)
-- For Railway PostgreSQL without pgvector
-- ==============================================

-- Step 1: Enable uuid extension only
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- CORE TABLES
-- ==============================================

-- Ideas table (main content)
CREATE TABLE IF NOT EXISTS ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    type VARCHAR(50) DEFAULT 'idea',
    category VARCHAR(50) DEFAULT 'general',
    priority VARCHAR(20) DEFAULT 'medium',
    summary TEXT,
    raw_input TEXT,
    next_steps TEXT,
    context_needed TEXT,
    keywords TEXT[],
    context VARCHAR(20) DEFAULT 'personal',
    is_archived BOOLEAN DEFAULT FALSE,
    primary_topic_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_type ON ideas(type);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_priority ON ideas(priority);
CREATE INDEX IF NOT EXISTS idx_ideas_context ON ideas(context);
CREATE INDEX IF NOT EXISTS idx_ideas_is_archived ON ideas(is_archived);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);

-- Voice memos table
CREATE TABLE IF NOT EXISTS voice_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_text TEXT NOT NULL,
    context VARCHAR(50) DEFAULT 'personal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_memos_context ON voice_memos(context);
CREATE INDEX IF NOT EXISTS idx_voice_memos_created_at ON voice_memos(created_at DESC);

-- Idea relations (connections between ideas)
CREATE TABLE IF NOT EXISTS idea_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) DEFAULT 'related',
    strength FLOAT DEFAULT 0.5,
    context VARCHAR(20) DEFAULT 'personal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_idea_relations_source ON idea_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_idea_relations_target ON idea_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_idea_relations_context ON idea_relations(context);

-- ==============================================
-- KNOWLEDGE GRAPH TABLES
-- ==============================================

-- Topic clusters
CREATE TABLE IF NOT EXISTS idea_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) DEFAULT 'personal',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#60a5fa',
    icon VARCHAR(10) DEFAULT '📁',
    idea_count INTEGER DEFAULT 0,
    is_auto_generated BOOLEAN DEFAULT TRUE,
    confidence_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_topics_context ON idea_topics(context);
CREATE INDEX IF NOT EXISTS idx_idea_topics_name ON idea_topics(name);

-- Topic memberships
CREATE TABLE IF NOT EXISTS idea_topic_memberships (
    idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES idea_topics(id) ON DELETE CASCADE,
    membership_score FLOAT DEFAULT 1.0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (idea_id, topic_id)
);

-- ==============================================
-- INCUBATOR TABLES
-- ==============================================

-- Loose thoughts (unstructured input)
CREATE TABLE IF NOT EXISTS loose_thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    raw_input TEXT NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'text',
    user_tags JSONB DEFAULT '[]',
    cluster_id UUID,
    similarity_to_cluster FLOAT,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loose_thoughts_user_id ON loose_thoughts(user_id);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_cluster_id ON loose_thoughts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_is_processed ON loose_thoughts(is_processed);
CREATE INDEX IF NOT EXISTS idx_loose_thoughts_created_at ON loose_thoughts(created_at DESC);

-- Thought clusters
CREATE TABLE IF NOT EXISTS thought_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    title VARCHAR(255),
    summary TEXT,
    suggested_type VARCHAR(50),
    suggested_category VARCHAR(50),
    thought_count INTEGER DEFAULT 0,
    confidence_score FLOAT DEFAULT 0,
    maturity_score FLOAT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'growing',
    consolidated_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    presented_at TIMESTAMP WITH TIME ZONE,
    consolidated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thought_clusters_user_id ON thought_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_thought_clusters_status ON thought_clusters(status);

-- ==============================================
-- USER & TRAINING TABLES
-- ==============================================

-- User profile
CREATE TABLE IF NOT EXISTS user_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE DEFAULT 'default',
    name VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User training data
CREATE TABLE IF NOT EXISTS user_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    training_type VARCHAR(20) NOT NULL,
    original_value VARCHAR(100),
    corrected_value VARCHAR(100),
    corrected_category VARCHAR(50),
    corrected_priority VARCHAR(20),
    corrected_type VARCHAR(50),
    tone_feedback VARCHAR(50),
    feedback TEXT,
    weight INTEGER DEFAULT 5,
    applied BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_training_idea_id ON user_training(idea_id);
CREATE INDEX IF NOT EXISTS idx_user_training_context ON user_training(context);

-- Pattern predictions
CREATE TABLE IF NOT EXISTS pattern_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    pattern_type VARCHAR(50) NOT NULL,
    pattern_data JSONB NOT NULL DEFAULT '{}',
    confidence FLOAT DEFAULT 0,
    sample_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interaction history
CREATE TABLE IF NOT EXISTS interaction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    interaction_type VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_history_user_id ON interaction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_history_idea_id ON interaction_history(idea_id);

-- ==============================================
-- MEDIA TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_type VARCHAR(20) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    caption TEXT,
    context VARCHAR(50) DEFAULT 'personal',
    thumbnail_path TEXT,
    duration_seconds FLOAT,
    width INTEGER,
    height INTEGER,
    ocr_text TEXT,
    ai_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(media_type);
CREATE INDEX IF NOT EXISTS idx_media_context ON media_items(context);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_items(created_at DESC);

-- ==============================================
-- NOTIFICATIONS (Phase 19)
-- ==============================================

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL DEFAULT 'ios',
    device_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    daily_digest BOOLEAN DEFAULT TRUE,
    weekly_insights BOOLEAN DEFAULT TRUE,
    idea_reminders BOOLEAN DEFAULT TRUE,
    incubator_alerts BOOLEAN DEFAULT TRUE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(50) DEFAULT 'Europe/Berlin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent ON notification_history(sent_at DESC);

-- ==============================================
-- DIGEST & ANALYTICS (Phase 20)
-- ==============================================

CREATE TABLE IF NOT EXISTS digests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    highlights JSONB DEFAULT '[]',
    statistics JSONB DEFAULT '{}',
    ai_insights TEXT[],
    recommendations TEXT[],
    ideas_count INTEGER DEFAULT 0,
    top_categories TEXT[],
    top_types TEXT[],
    productivity_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notified_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(type, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_digests_type ON digests(type);
CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_digests_created ON digests(created_at DESC);

-- User Productivity Goals Table (single-row configuration)
CREATE TABLE IF NOT EXISTS productivity_goals (
    id INTEGER PRIMARY KEY DEFAULT 1,
    daily_ideas_target INTEGER DEFAULT 3,
    weekly_ideas_target INTEGER DEFAULT 15,
    focus_categories TEXT[],
    enabled_insights BOOLEAN DEFAULT true,
    digest_time TIME DEFAULT '09:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize default productivity goals
INSERT INTO productivity_goals (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    linked_ideas UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_context ON user_goals(context);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);

CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);

-- ==============================================
-- PERSONALIZATION CHAT (Phase 21)
-- ==============================================

CREATE TABLE IF NOT EXISTS personalization_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    status VARCHAR(20) DEFAULT 'active',
    current_phase VARCHAR(50) DEFAULT 'introduction',
    questions_asked INTEGER DEFAULT 0,
    facts_collected INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personalization_sessions_user ON personalization_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_personalization_sessions_status ON personalization_sessions(status);

CREATE TABLE IF NOT EXISTS personalization_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    session_id UUID REFERENCES personalization_sessions(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL,
    fact_key VARCHAR(100) NOT NULL,
    fact_value TEXT NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    source VARCHAR(50) DEFAULT 'chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, category, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_personalization_facts_user ON personalization_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_personalization_facts_category ON personalization_facts(category);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES personalization_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- ==============================================
-- HELPER FUNCTION
-- ==============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- ==============================================
-- VERIFICATION
-- ==============================================

DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Database Schema Initialization Complete!';
    RAISE NOTICE '(Without pgvector - semantic search disabled)';
    RAISE NOTICE '============================================';
END $$;
