-- =====================================================
-- MIGRATION: Fix Public Schema Tables
-- PersonalAIBrain - Public Schema Tables Fix
-- Date: 2026-01-25
-- =====================================================
--
-- These tables need to exist in the PUBLIC schema because
-- certain routes use the generic query() function instead
-- of queryContext().
--
-- Tables:
-- 1. personalization_topics (used by personalization-chat.ts)
-- 2. personal_facts (used by personalization-chat.ts)
-- 3. personalization_conversations (used by personalization-chat.ts)
-- 4. general_chat_sessions (used by general-chat.ts)
-- 5. general_chat_messages (used by general-chat.ts)
-- 6. media_items (used by media.ts for /api/all-media)
-- 7. export_history (for export tracking)
-- =====================================================

-- Ensure we're working in public schema
SET search_path TO public;

-- =====================================================
-- 1. PERSONALIZATION_TOPICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS personalization_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(100) NOT NULL UNIQUE,
    questions_asked INTEGER DEFAULT 0,
    last_asked_at TIMESTAMP WITH TIME ZONE,
    completion_level DECIMAL(3,2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default topics
INSERT INTO personalization_topics (topic, completion_level)
SELECT topic, 0.0
FROM (VALUES
    ('basic_info'),
    ('personality'),
    ('work_life'),
    ('goals_dreams'),
    ('interests_hobbies'),
    ('communication_style'),
    ('decision_making'),
    ('daily_routines'),
    ('values_beliefs'),
    ('challenges')
) AS t(topic)
WHERE NOT EXISTS (SELECT 1 FROM personalization_topics LIMIT 1)
ON CONFLICT (topic) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_personalization_topics_topic ON personalization_topics(topic);

-- =====================================================
-- 2. PERSONAL_FACTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS personal_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    fact_key VARCHAR(100) NOT NULL,
    fact_value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.8,
    source VARCHAR(20) DEFAULT 'conversation',
    asked_question TEXT,
    user_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_personal_facts_category ON personal_facts(category);
CREATE INDEX IF NOT EXISTS idx_personal_facts_key ON personal_facts(fact_key);

-- =====================================================
-- 3. PERSONALIZATION_CONVERSATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS personalization_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('ai', 'user')),
    message TEXT NOT NULL,
    facts_extracted JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pers_conv_session ON personalization_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_pers_conv_created ON personalization_conversations(created_at DESC);

-- =====================================================
-- 4. GENERAL_CHAT_SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS general_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON general_chat_sessions(context);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON general_chat_sessions(updated_at DESC);

-- =====================================================
-- 5. GENERAL_CHAT_MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS general_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES general_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON general_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON general_chat_messages(created_at ASC);

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_session_updated_at ON general_chat_sessions;
CREATE TRIGGER chat_session_updated_at
  BEFORE UPDATE ON general_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_timestamp();

-- =====================================================
-- 6. MEDIA_ITEMS TABLE (with filename column)
-- =====================================================
CREATE TABLE IF NOT EXISTS media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
    filename VARCHAR(255) NOT NULL DEFAULT 'unknown',
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    caption TEXT,
    context VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add filename column if it doesn't exist (for existing tables)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'media_items'
        AND column_name = 'filename'
    ) THEN
        ALTER TABLE media_items ADD COLUMN filename VARCHAR(255) NOT NULL DEFAULT 'unknown';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(media_type);
CREATE INDEX IF NOT EXISTS idx_media_context ON media_items(context);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_items(created_at DESC);

-- =====================================================
-- 7. EXPORT_HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type VARCHAR(20) NOT NULL CHECK (export_type IN ('pdf', 'markdown', 'csv', 'json', 'backup')),
    filename VARCHAR(255),
    file_size BIGINT,
    ideas_count INTEGER DEFAULT 0,
    filters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_history_type ON export_history(export_type);
CREATE INDEX IF NOT EXISTS idx_export_history_created ON export_history(created_at DESC);

-- =====================================================
-- 8. USER_TRAINING TABLE (with context column)
-- =====================================================

-- First, add context column if the table exists but column doesn't
DO $$
BEGIN
    -- Check if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'user_training'
    ) THEN
        -- Check if context column exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'user_training'
            AND column_name = 'context'
        ) THEN
            ALTER TABLE user_training ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
            RAISE NOTICE 'Added context column to user_training';
        END IF;
    ELSE
        -- Create table if it doesn't exist
        CREATE TABLE user_training (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            idea_id UUID,
            context VARCHAR(20) DEFAULT 'personal',
            training_type VARCHAR(20) NOT NULL CHECK (training_type IN ('category', 'priority', 'type', 'tone', 'general')),
            original_value VARCHAR(100),
            corrected_value VARCHAR(100),
            corrected_category VARCHAR(50),
            corrected_priority VARCHAR(20),
            corrected_type VARCHAR(50),
            tone_feedback VARCHAR(50),
            feedback TEXT,
            weight INTEGER DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
            applied BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE 'Created user_training table';
    END IF;
END $$;

-- Create indexes only if they don't exist and column exists
DO $$
BEGIN
    -- Only create context index if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'user_training'
        AND column_name = 'context'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_user_training_context ON user_training(context);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_training_idea_id ON user_training(idea_id);
CREATE INDEX IF NOT EXISTS idx_user_training_type ON user_training(training_type);
CREATE INDEX IF NOT EXISTS idx_user_training_created_at ON user_training(created_at DESC);

-- =====================================================
-- Success message
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Public schema tables created successfully!';
    RAISE NOTICE '========================================';
END $$;
