-- =====================================================
-- MIGRATION: Fix Missing Schema Elements
-- PersonalAIBrain - Comprehensive Schema Fix
-- Date: 2026-01-25
-- =====================================================
--
-- This migration adds all missing tables and columns
-- to both 'personal' and 'work' schemas.
--
-- Fixes:
-- 1. personalization_topics table
-- 2. personal_facts table (with correct columns)
-- 3. general_chat_sessions table
-- 4. general_chat_messages table
-- 5. media_items.filename column (if missing)
-- 6. user_training.context column (if missing)
-- =====================================================

-- Function to create tables in both schemas
DO $$
DECLARE
    schema_name text;
BEGIN
    -- Loop through both schemas
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        -- =====================================================
        -- 1. PERSONALIZATION_TOPICS TABLE
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.personalization_topics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                topic VARCHAR(100) NOT NULL,
                questions_asked INTEGER DEFAULT 0,
                last_asked_at TIMESTAMP WITH TIME ZONE,
                completion_level DECIMAL(3,2) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT %I_personalization_topics_topic_unique UNIQUE (topic)
            )', schema_name, schema_name);

        -- Insert default topics if table was just created
        EXECUTE format('
            INSERT INTO %I.personalization_topics (topic, completion_level)
            SELECT topic, 0.0
            FROM (VALUES
                (''basic_info''),
                (''personality''),
                (''work_life''),
                (''goals_dreams''),
                (''interests_hobbies''),
                (''communication_style''),
                (''decision_making''),
                (''daily_routines''),
                (''values_beliefs''),
                (''challenges'')
            ) AS t(topic)
            WHERE NOT EXISTS (SELECT 1 FROM %I.personalization_topics LIMIT 1)
            ON CONFLICT DO NOTHING
        ', schema_name, schema_name);

        RAISE NOTICE 'Created personalization_topics in schema: %', schema_name;

        -- =====================================================
        -- 2. PERSONAL_FACTS TABLE (with correct schema)
        -- =====================================================
        -- Drop old table if it has wrong schema
        -- First check if it exists and has the right columns
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.personal_facts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                category VARCHAR(50) NOT NULL,
                fact_key VARCHAR(100) NOT NULL,
                fact_value TEXT NOT NULL,
                confidence DECIMAL(3,2) DEFAULT 0.8,
                source VARCHAR(20) DEFAULT ''conversation'',
                asked_question TEXT,
                user_response TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT %I_personal_facts_unique UNIQUE (category, fact_key)
            )', schema_name, schema_name);

        -- Add missing columns if they don't exist
        BEGIN
            EXECUTE format('ALTER TABLE %I.personal_facts ADD COLUMN IF NOT EXISTS fact_key VARCHAR(100)', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE %I.personal_facts ADD COLUMN IF NOT EXISTS fact_value TEXT', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE %I.personal_facts ADD COLUMN IF NOT EXISTS asked_question TEXT', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        BEGIN
            EXECUTE format('ALTER TABLE %I.personal_facts ADD COLUMN IF NOT EXISTS user_response TEXT', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        -- Create indexes
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_personal_facts_category ON %I.personal_facts(category)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_personal_facts_key ON %I.personal_facts(fact_key)', schema_name, schema_name);

        RAISE NOTICE 'Created/updated personal_facts in schema: %', schema_name;

        -- =====================================================
        -- 3. PERSONALIZATION_CONVERSATIONS TABLE
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.personalization_conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL,
                role VARCHAR(10) NOT NULL CHECK (role IN (''ai'', ''user'')),
                message TEXT NOT NULL,
                facts_extracted JSONB DEFAULT ''[]'',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )', schema_name);

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_conv_session ON %I.personalization_conversations(session_id)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_pers_conv_created ON %I.personalization_conversations(created_at DESC)', schema_name, schema_name);

        RAISE NOTICE 'Created personalization_conversations in schema: %', schema_name;

        -- =====================================================
        -- 4. GENERAL_CHAT_SESSIONS TABLE
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.general_chat_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                context VARCHAR(20) NOT NULL DEFAULT ''personal'',
                title VARCHAR(255),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )', schema_name);

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_sessions_context ON %I.general_chat_sessions(context)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_sessions_updated ON %I.general_chat_sessions(updated_at DESC)', schema_name, schema_name);

        RAISE NOTICE 'Created general_chat_sessions in schema: %', schema_name;

        -- =====================================================
        -- 5. GENERAL_CHAT_MESSAGES TABLE
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.general_chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES %I.general_chat_sessions(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL CHECK (role IN (''user'', ''assistant'')),
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )', schema_name, schema_name);

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_messages_session ON %I.general_chat_messages(session_id)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_chat_messages_created ON %I.general_chat_messages(created_at ASC)', schema_name, schema_name);

        RAISE NOTICE 'Created general_chat_messages in schema: %', schema_name;

        -- =====================================================
        -- 6. MEDIA_ITEMS TABLE - Add filename if missing
        -- =====================================================
        -- First ensure table exists
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.media_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                media_type VARCHAR(20) NOT NULL CHECK (media_type IN (''photo'', ''video'')),
                filename VARCHAR(255) NOT NULL DEFAULT ''unknown'',
                file_path TEXT NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                file_size BIGINT NOT NULL DEFAULT 0,
                caption TEXT,
                context VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )', schema_name);

        -- Add filename column if missing
        BEGIN
            EXECUTE format('ALTER TABLE %I.media_items ADD COLUMN IF NOT EXISTS filename VARCHAR(255) NOT NULL DEFAULT ''unknown''', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_media_type ON %I.media_items(media_type)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_media_context ON %I.media_items(context)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_media_created_at ON %I.media_items(created_at DESC)', schema_name, schema_name);

        RAISE NOTICE 'Created/updated media_items in schema: %', schema_name;

        -- =====================================================
        -- 7. USER_TRAINING TABLE - Add context if missing
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.user_training (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                idea_id UUID,
                context VARCHAR(20) NOT NULL DEFAULT ''personal'' CHECK (context IN (''personal'', ''work'')),
                training_type VARCHAR(20) NOT NULL CHECK (training_type IN (''category'', ''priority'', ''type'', ''tone'', ''general'')),
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
            )', schema_name);

        -- Add context column if missing
        BEGIN
            EXECUTE format('ALTER TABLE %I.user_training ADD COLUMN IF NOT EXISTS context VARCHAR(20) NOT NULL DEFAULT ''personal''', schema_name);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_training_idea_id ON %I.user_training(idea_id)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_training_context ON %I.user_training(context)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_training_type ON %I.user_training(training_type)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_training_created_at ON %I.user_training(created_at DESC)', schema_name, schema_name);

        RAISE NOTICE 'Created/updated user_training in schema: %', schema_name;

        -- =====================================================
        -- 8. EXPORT_HISTORY TABLE (for export tracking)
        -- =====================================================
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I.export_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                export_type VARCHAR(20) NOT NULL CHECK (export_type IN (''pdf'', ''markdown'', ''csv'', ''json'', ''backup'')),
                filename VARCHAR(255),
                file_size BIGINT,
                ideas_count INTEGER DEFAULT 0,
                filters JSONB DEFAULT ''{}''::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )', schema_name);

        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_export_history_type ON %I.export_history(export_type)', schema_name, schema_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_export_history_created ON %I.export_history(created_at DESC)', schema_name, schema_name);

        RAISE NOTICE 'Created export_history in schema: %', schema_name;

    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'All tables created in personal and work schemas.';
    RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- Trigger for chat session updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to both schemas
DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['personal', 'work']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS chat_session_updated_at ON %I.general_chat_sessions', schema_name);
        EXECUTE format('
            CREATE TRIGGER chat_session_updated_at
            BEFORE UPDATE ON %I.general_chat_sessions
            FOR EACH ROW
            EXECUTE FUNCTION update_chat_session_timestamp()
        ', schema_name);
    END LOOP;
END $$;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON FUNCTION update_chat_session_timestamp() IS 'Auto-updates updated_at timestamp on chat session changes';
