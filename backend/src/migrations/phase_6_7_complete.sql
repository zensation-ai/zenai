-- Complete Migration for Phase 6 & 7
-- Run on BOTH personal_ai AND work_ai databases
-- Usage:
--   docker exec ai-brain-postgres psql -U postgres -d personal_ai -f /path/to/phase_6_7_complete.sql
--   docker exec ai-brain-postgres psql -U postgres -d work_ai -f /path/to/phase_6_7_complete.sql

-- ============================================
-- 1. Add context column to ideas table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ideas' AND column_name = 'context'
    ) THEN
        ALTER TABLE ideas ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
        CREATE INDEX IF NOT EXISTS idx_ideas_context ON ideas(context);
        RAISE NOTICE 'Added context column to ideas table';
    END IF;
END $$;

-- ============================================
-- 2. Create voice_memos table
-- ============================================
CREATE TABLE IF NOT EXISTS voice_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_text TEXT NOT NULL,
    context VARCHAR(50) DEFAULT 'personal',
    embedding vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_memos_context ON voice_memos(context);
CREATE INDEX IF NOT EXISTS idx_voice_memos_created_at ON voice_memos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_memos_embedding ON voice_memos USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================
-- 3. Create/Update media_items table (with correct embedding dimension)
-- ============================================
CREATE TABLE IF NOT EXISTS media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('photo', 'video')),
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    caption TEXT,
    context VARCHAR(50) DEFAULT 'personal',
    embedding vector(768),  -- Same dimension as ideas (768)
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
CREATE INDEX IF NOT EXISTS idx_media_embedding ON media_items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================
-- 4. Create user_training table
-- ============================================
CREATE TABLE IF NOT EXISTS user_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work', 'creative', 'strategic')),
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

CREATE INDEX IF NOT EXISTS idx_user_training_idea_id ON user_training(idea_id);
CREATE INDEX IF NOT EXISTS idx_user_training_context ON user_training(context);
CREATE INDEX IF NOT EXISTS idx_user_training_type ON user_training(training_type);
CREATE INDEX IF NOT EXISTS idx_user_training_created_at ON user_training(created_at DESC);

-- ============================================
-- 5. Add preferences column to user_profile
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_profile' AND column_name = 'preferences'
    ) THEN
        ALTER TABLE user_profile ADD COLUMN preferences JSONB DEFAULT '{}';
        RAISE NOTICE 'Added preferences column to user_profile table';
    END IF;
END $$;

-- ============================================
-- 6. Create helper functions
-- ============================================

-- Function to get training summary for ML model
CREATE OR REPLACE FUNCTION get_training_summary(p_context VARCHAR)
RETURNS TABLE (
    training_type VARCHAR,
    total_count BIGINT,
    total_weight BIGINT,
    most_common_correction VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.training_type::VARCHAR,
        COUNT(*)::BIGINT as total_count,
        SUM(t.weight)::BIGINT as total_weight,
        MODE() WITHIN GROUP (ORDER BY t.corrected_value)::VARCHAR as most_common_correction
    FROM user_training t
    WHERE t.context = p_context
    GROUP BY t.training_type;
END;
$$ LANGUAGE plpgsql;

-- Function to get tone preferences
CREATE OR REPLACE FUNCTION get_tone_preferences(p_context VARCHAR)
RETURNS TABLE (
    tone_type VARCHAR,
    score BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.tone_feedback::VARCHAR as tone_type,
        SUM(t.weight)::BIGINT as score
    FROM user_training t
    WHERE t.context = p_context
      AND t.training_type = 'tone'
      AND t.tone_feedback IS NOT NULL
    GROUP BY t.tone_feedback
    ORDER BY score DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Update trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_voice_memos_updated_at ON voice_memos;
CREATE TRIGGER update_voice_memos_updated_at
    BEFORE UPDATE ON voice_memos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_media_items_updated_at ON media_items;
CREATE TRIGGER update_media_items_updated_at
    BEFORE UPDATE ON media_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_training_updated_at ON user_training;
CREATE TRIGGER update_user_training_updated_at
    BEFORE UPDATE ON user_training
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. Add comments for documentation
-- ============================================
COMMENT ON TABLE voice_memos IS 'Stores raw voice memo transcriptions with embeddings for semantic search';
COMMENT ON TABLE media_items IS 'Stores photos and videos with AI-generated descriptions and embeddings';
COMMENT ON TABLE user_training IS 'Stores user corrections to train the AI system. Each correction has a weight for learning priority';
COMMENT ON COLUMN user_training.weight IS 'Learning weight 1-10. Higher = stronger learning signal. Category=8, Priority=6, Type=7, Tone=10, General=5';

-- ============================================
-- Verification
-- ============================================
DO $$
DECLARE
    v_ideas_context BOOLEAN;
    v_voice_memos BOOLEAN;
    v_media_items BOOLEAN;
    v_user_training BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ideas' AND column_name = 'context'
    ) INTO v_ideas_context;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'voice_memos'
    ) INTO v_voice_memos;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'media_items'
    ) INTO v_media_items;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_training'
    ) INTO v_user_training;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Migration Verification:';
    RAISE NOTICE '  ideas.context:    %', CASE WHEN v_ideas_context THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  voice_memos:      %', CASE WHEN v_voice_memos THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  media_items:      %', CASE WHEN v_media_items THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '  user_training:    %', CASE WHEN v_user_training THEN 'OK' ELSE 'MISSING' END;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Phase 6 & 7 Migration Complete!';
END $$;
