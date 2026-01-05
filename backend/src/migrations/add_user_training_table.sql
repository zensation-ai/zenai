-- Migration: Add user_training table for AI Training (Phase 6)
-- Run this on both personal_ai and work_ai databases

-- Create user_training table
CREATE TABLE IF NOT EXISTS user_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
    context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
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

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_training_idea_id ON user_training(idea_id);
CREATE INDEX IF NOT EXISTS idx_user_training_context ON user_training(context);
CREATE INDEX IF NOT EXISTS idx_user_training_type ON user_training(training_type);
CREATE INDEX IF NOT EXISTS idx_user_training_created_at ON user_training(created_at DESC);

-- Add preferences column to user_profile if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_profile' AND column_name = 'preferences'
    ) THEN
        ALTER TABLE user_profile ADD COLUMN preferences JSONB DEFAULT '{}';
    END IF;
END $$;

-- Add context column to ideas if not exists (for filtering)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ideas' AND column_name = 'context'
    ) THEN
        ALTER TABLE ideas ADD COLUMN context VARCHAR(20) DEFAULT 'personal';
    END IF;
END $$;

-- Create function to get training summary for ML model
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

-- Create function to get tone preferences
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

-- Comment for documentation
COMMENT ON TABLE user_training IS 'Stores user corrections and feedback to train the AI system. Each correction has a weight that determines its importance for learning.';
COMMENT ON COLUMN user_training.weight IS 'Learning weight from 1-10. Higher values indicate stronger learning signal. Category=8, Priority=6, Type=7, Tone=10, General=5.';
COMMENT ON COLUMN user_training.applied IS 'Whether the correction has been applied to the original idea.';

-- Print success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed: user_training table created successfully';
END $$;
