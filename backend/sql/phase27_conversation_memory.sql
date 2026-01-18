-- Phase 27: Conversation Memory System
-- Supports multi-turn conversations with Claude including persistence and session management

-- ===========================================
-- Conversation Sessions Table
-- ===========================================

CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    messages JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    compressed_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_context CHECK (context IN ('personal', 'work'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_conv_sessions_context ON conversation_sessions(context);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_activity ON conversation_sessions(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_created ON conversation_sessions(created_at DESC);

-- GIN index for JSONB queries on metadata
CREATE INDEX IF NOT EXISTS idx_conv_sessions_metadata ON conversation_sessions USING GIN (metadata);

-- ===========================================
-- Routine Patterns Table (for Phase B)
-- ===========================================

CREATE TABLE IF NOT EXISTS routine_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    pattern_type VARCHAR(50) NOT NULL,
    trigger_config JSONB NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_config JSONB DEFAULT '{}',
    confidence DECIMAL(5,4) DEFAULT 0.5,
    occurrences INTEGER DEFAULT 0,
    last_triggered TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_pattern_context CHECK (context IN ('personal', 'work')),
    CONSTRAINT valid_pattern_type CHECK (pattern_type IN ('time_based', 'sequence_based', 'context_based')),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_routine_patterns_context ON routine_patterns(context);
CREATE INDEX IF NOT EXISTS idx_routine_patterns_active ON routine_patterns(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_routine_patterns_type ON routine_patterns(pattern_type);

-- ===========================================
-- User Action Log Table (for learning routines)
-- ===========================================

CREATE TABLE IF NOT EXISTS user_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    action_type VARCHAR(100) NOT NULL,
    action_data JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    day_of_week INTEGER GENERATED ALWAYS AS (EXTRACT(DOW FROM timestamp)) STORED,
    hour_of_day INTEGER GENERATED ALWAYS AS (EXTRACT(HOUR FROM timestamp)) STORED,

    CONSTRAINT valid_action_context CHECK (context IN ('personal', 'work'))
);

CREATE INDEX IF NOT EXISTS idx_user_actions_context_time ON user_action_log(context, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_action_log(action_type);
CREATE INDEX IF NOT EXISTS idx_user_actions_dow ON user_action_log(day_of_week);
CREATE INDEX IF NOT EXISTS idx_user_actions_hour ON user_action_log(hour_of_day);

-- Partition-ready index for time-based queries
CREATE INDEX IF NOT EXISTS idx_user_actions_timestamp ON user_action_log(timestamp DESC);

-- ===========================================
-- Proactive Suggestions Feedback Table
-- ===========================================

CREATE TABLE IF NOT EXISTS proactive_suggestion_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_id UUID NOT NULL,
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    suggestion_type VARCHAR(50) NOT NULL,
    was_accepted BOOLEAN NOT NULL,
    dismiss_reason TEXT,
    action_taken JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_feedback_context CHECK (context IN ('personal', 'work'))
);

CREATE INDEX IF NOT EXISTS idx_proactive_feedback_context ON proactive_suggestion_feedback(context);
CREATE INDEX IF NOT EXISTS idx_proactive_feedback_type ON proactive_suggestion_feedback(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_proactive_feedback_accepted ON proactive_suggestion_feedback(was_accepted);

-- ===========================================
-- Proactive Settings Table
-- ===========================================

CREATE TABLE IF NOT EXISTS proactive_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL UNIQUE,
    proactivity_level VARCHAR(20) DEFAULT 'balanced',
    enabled_types JSONB DEFAULT '["routine", "connection", "reminder", "draft", "follow_up"]',
    quiet_hours_start INTEGER DEFAULT 22,
    quiet_hours_end INTEGER DEFAULT 7,
    max_suggestions_per_day INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_settings_context CHECK (context IN ('personal', 'work')),
    CONSTRAINT valid_proactivity_level CHECK (proactivity_level IN ('aggressive', 'balanced', 'minimal', 'off')),
    CONSTRAINT valid_quiet_hours CHECK (quiet_hours_start >= 0 AND quiet_hours_start <= 23 AND quiet_hours_end >= 0 AND quiet_hours_end <= 23)
);

-- Insert default settings for both contexts
INSERT INTO proactive_settings (context, proactivity_level)
VALUES ('personal', 'balanced'), ('work', 'balanced')
ON CONFLICT (context) DO NOTHING;

-- ===========================================
-- Helper Functions
-- ===========================================

-- Function to clean up old conversation sessions (run via cron/scheduled job)
CREATE OR REPLACE FUNCTION cleanup_old_conversation_sessions(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM conversation_sessions
    WHERE last_activity < NOW() - (days_old || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old action logs (run via cron/scheduled job)
CREATE OR REPLACE FUNCTION cleanup_old_action_logs(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_action_log
    WHERE timestamp < NOW() - (days_old || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get action patterns by time
CREATE OR REPLACE FUNCTION get_action_patterns_by_time(
    p_context VARCHAR(20),
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    action_type VARCHAR(100),
    day_of_week INTEGER,
    hour_of_day INTEGER,
    occurrence_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ual.action_type,
        ual.day_of_week,
        ual.hour_of_day,
        COUNT(*) as occurrence_count
    FROM user_action_log ual
    WHERE ual.context = p_context
      AND ual.timestamp >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY ual.action_type, ual.day_of_week, ual.hour_of_day
    HAVING COUNT(*) >= 2
    ORDER BY occurrence_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Triggers
-- ===========================================

-- Update timestamp trigger for routine_patterns
CREATE OR REPLACE FUNCTION update_routine_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_routine_patterns_timestamp ON routine_patterns;
CREATE TRIGGER trigger_update_routine_patterns_timestamp
    BEFORE UPDATE ON routine_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_routine_patterns_timestamp();

-- Update timestamp trigger for proactive_settings
CREATE OR REPLACE FUNCTION update_proactive_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_proactive_settings_timestamp ON proactive_settings;
CREATE TRIGGER trigger_update_proactive_settings_timestamp
    BEFORE UPDATE ON proactive_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_proactive_settings_timestamp();

-- ===========================================
-- Personalization Facts Table (Phase C - Long-Term Memory)
-- ===========================================

CREATE TABLE IF NOT EXISTS personalization_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context VARCHAR(20) NOT NULL DEFAULT 'personal',
    fact_type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    confidence DECIMAL(5,4) DEFAULT 0.5,
    source VARCHAR(20) DEFAULT 'inferred',
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_confirmed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    occurrences INTEGER DEFAULT 1,
    embedding vector(1024),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_fact_context CHECK (context IN ('personal', 'work')),
    CONSTRAINT valid_fact_type CHECK (fact_type IN ('preference', 'behavior', 'knowledge', 'goal', 'context')),
    CONSTRAINT valid_fact_source CHECK (source IN ('explicit', 'inferred', 'consolidated')),
    CONSTRAINT valid_fact_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_pers_facts_context ON personalization_facts(context);
CREATE INDEX IF NOT EXISTS idx_pers_facts_type ON personalization_facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_pers_facts_confidence ON personalization_facts(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_pers_facts_active ON personalization_facts(is_active) WHERE is_active = true;

-- Function to update fact confirmation
CREATE OR REPLACE FUNCTION confirm_personalization_fact(p_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE personalization_facts
    SET last_confirmed = NOW(),
        occurrences = occurrences + 1,
        confidence = LEAST(confidence + 0.05, 1.0)
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Comments
-- ===========================================

COMMENT ON TABLE conversation_sessions IS 'Stores multi-turn conversation sessions with Claude for continuity';
COMMENT ON TABLE routine_patterns IS 'Stores detected user routine patterns for proactive suggestions';
COMMENT ON TABLE user_action_log IS 'Logs user actions for routine pattern detection';
COMMENT ON TABLE proactive_suggestion_feedback IS 'Tracks user feedback on proactive suggestions';
COMMENT ON TABLE proactive_settings IS 'User preferences for proactive assistant behavior';
COMMENT ON TABLE personalization_facts IS 'Stores long-term facts about the user for personalization (HiMeS architecture)';
