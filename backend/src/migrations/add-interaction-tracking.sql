-- Interaction Tracking Tables
-- Phase 4: Deep Learning Feedback Loop
-- Tracks user interactions for learning and personalization

-- ===========================================
-- 1. Interaction Events
-- ===========================================
-- Tracks every meaningful user interaction

CREATE TABLE IF NOT EXISTS interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- What was interacted with
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('idea', 'cluster', 'automation', 'suggestion', 'search', 'profile')),
  entity_id UUID,

  -- Type of interaction
  interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN (
    'view', 'create', 'edit', 'delete', 'archive', 'restore',
    'share', 'export', 'search_click', 'suggestion_accept', 'suggestion_dismiss',
    'feedback_positive', 'feedback_negative', 'correction', 'bulk_action'
  )),

  -- Interaction details
  metadata JSONB DEFAULT '{}',

  -- Session tracking
  session_id VARCHAR(100),

  -- Timing
  duration_ms INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_interaction_events_context ON interaction_events(context);
CREATE INDEX IF NOT EXISTS idx_interaction_events_entity ON interaction_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_type ON interaction_events(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interaction_events_session ON interaction_events(session_id);
CREATE INDEX IF NOT EXISTS idx_interaction_events_time ON interaction_events(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_interaction_events_context_type_time
  ON interaction_events(context, interaction_type, created_at DESC);

COMMENT ON TABLE interaction_events IS 'Tracks user interactions for learning and behavior analysis';

-- ===========================================
-- 2. Field-Level Corrections
-- ===========================================
-- Tracks granular corrections to AI outputs

CREATE TABLE IF NOT EXISTS field_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- What was corrected
  idea_id UUID NOT NULL,
  field_name VARCHAR(50) NOT NULL CHECK (field_name IN (
    'type', 'category', 'priority', 'title', 'summary', 'keywords', 'next_steps'
  )),

  -- Before and after
  old_value TEXT,
  new_value TEXT,

  -- Learning weight (corrections are more valuable)
  weight DECIMAL(3,2) DEFAULT 1.0,

  -- Whether this correction was applied to learning
  applied_to_learning BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_field_corrections_context ON field_corrections(context);
CREATE INDEX IF NOT EXISTS idx_field_corrections_idea ON field_corrections(idea_id);
CREATE INDEX IF NOT EXISTS idx_field_corrections_field ON field_corrections(field_name);
CREATE INDEX IF NOT EXISTS idx_field_corrections_unapplied ON field_corrections(applied_to_learning)
  WHERE applied_to_learning = false;
CREATE INDEX IF NOT EXISTS idx_field_corrections_time ON field_corrections(created_at DESC);

COMMENT ON TABLE field_corrections IS 'Stores granular corrections to AI-generated fields for improved learning';

-- ===========================================
-- 3. Learning Sessions
-- ===========================================
-- Groups interactions into logical sessions

CREATE TABLE IF NOT EXISTS learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Session identifiers
  session_token VARCHAR(100) UNIQUE NOT NULL,

  -- Session metrics
  total_interactions INTEGER DEFAULT 0,
  ideas_created INTEGER DEFAULT 0,
  ideas_edited INTEGER DEFAULT 0,
  corrections_made INTEGER DEFAULT 0,
  searches_performed INTEGER DEFAULT 0,

  -- Session timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Device/client info (optional, for analytics)
  client_info JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learning_sessions_context ON learning_sessions(context);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_token ON learning_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_active ON learning_sessions(ended_at)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_learning_sessions_time ON learning_sessions(started_at DESC);

COMMENT ON TABLE learning_sessions IS 'Groups user interactions into logical sessions for behavior analysis';

-- ===========================================
-- 4. Correction Patterns
-- ===========================================
-- Aggregated patterns from corrections for faster learning

CREATE TABLE IF NOT EXISTS correction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Pattern identification
  field_name VARCHAR(50) NOT NULL,
  pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN (
    'value_mapping', 'keyword_trigger', 'category_preference', 'priority_bias'
  )),

  -- Pattern data
  trigger_condition JSONB NOT NULL,  -- e.g., {"contains": "marketing"}
  correction_value TEXT NOT NULL,     -- e.g., "work" for category

  -- Confidence and usage
  confidence DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  times_applied INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_correction_patterns_context ON correction_patterns(context);
CREATE INDEX IF NOT EXISTS idx_correction_patterns_field ON correction_patterns(field_name);
CREATE INDEX IF NOT EXISTS idx_correction_patterns_active ON correction_patterns(is_active)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_correction_patterns_confidence ON correction_patterns(confidence DESC);

-- Unique constraint to avoid duplicate patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_correction_patterns_unique
  ON correction_patterns(context, field_name, pattern_type, trigger_condition);

COMMENT ON TABLE correction_patterns IS 'Aggregated patterns from user corrections for predictive learning';

-- ===========================================
-- 5. Useful Views
-- ===========================================

-- Recent interactions summary
CREATE OR REPLACE VIEW interaction_summary AS
SELECT
  context,
  interaction_type,
  entity_type,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms,
  MAX(created_at) as last_occurrence
FROM interaction_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY context, interaction_type, entity_type
ORDER BY count DESC;

-- Correction effectiveness
CREATE OR REPLACE VIEW correction_effectiveness AS
SELECT
  context,
  field_name,
  COUNT(*) as total_corrections,
  COUNT(*) FILTER (WHERE applied_to_learning = true) as applied_corrections,
  AVG(weight) as avg_weight
FROM field_corrections
GROUP BY context, field_name
ORDER BY total_corrections DESC;

-- Active learning patterns
CREATE OR REPLACE VIEW active_patterns AS
SELECT
  id,
  context,
  field_name,
  pattern_type,
  trigger_condition,
  correction_value,
  confidence,
  times_applied,
  CASE
    WHEN times_applied > 0 THEN ROUND(times_correct::decimal / times_applied * 100, 1)
    ELSE 0
  END as accuracy_percent,
  created_at
FROM correction_patterns
WHERE is_active = true
ORDER BY confidence DESC, times_applied DESC;

-- User engagement metrics (last 30 days)
CREATE OR REPLACE VIEW user_engagement AS
SELECT
  context,
  COUNT(DISTINCT DATE(created_at)) as active_days,
  COUNT(*) as total_interactions,
  COUNT(*) FILTER (WHERE interaction_type = 'create') as ideas_created,
  COUNT(*) FILTER (WHERE interaction_type IN ('edit', 'correction')) as edits_made,
  COUNT(*) FILTER (WHERE interaction_type LIKE 'feedback%') as feedback_given,
  COUNT(*) FILTER (WHERE interaction_type = 'correction') as corrections_made
FROM interaction_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY context;

-- ===========================================
-- 6. Helper Functions
-- ===========================================

-- Function to update session metrics
CREATE OR REPLACE FUNCTION update_session_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE learning_sessions
  SET
    total_interactions = total_interactions + 1,
    ideas_created = ideas_created + CASE WHEN NEW.interaction_type = 'create' AND NEW.entity_type = 'idea' THEN 1 ELSE 0 END,
    ideas_edited = ideas_edited + CASE WHEN NEW.interaction_type = 'edit' AND NEW.entity_type = 'idea' THEN 1 ELSE 0 END,
    corrections_made = corrections_made + CASE WHEN NEW.interaction_type = 'correction' THEN 1 ELSE 0 END,
    searches_performed = searches_performed + CASE WHEN NEW.entity_type = 'search' THEN 1 ELSE 0 END,
    last_activity_at = NOW()
  WHERE session_token = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic session updates
DROP TRIGGER IF EXISTS trigger_update_session_metrics ON interaction_events;
CREATE TRIGGER trigger_update_session_metrics
  AFTER INSERT ON interaction_events
  FOR EACH ROW
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION update_session_metrics();

-- Function to cleanup old interaction events (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_interactions()
RETURNS void AS $$
BEGIN
  DELETE FROM interaction_events
  WHERE created_at < NOW() - INTERVAL '90 days';

  -- Also cleanup old sessions
  DELETE FROM learning_sessions
  WHERE ended_at IS NOT NULL AND ended_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- Done!
-- ===========================================
-- Run this migration in Supabase SQL Editor
-- Verify with: SELECT COUNT(*) FROM interaction_events;
