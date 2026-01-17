-- Evolution Tracking Tables
-- Phase 5: Evolution Dashboard & Mobile
-- Visualizes how the AI learns and improves over time

-- ===========================================
-- 1. Evolution Snapshots
-- ===========================================
-- Daily snapshots of learning state for trend analysis

CREATE TABLE IF NOT EXISTS evolution_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Snapshot date (one per day per context)
  snapshot_date DATE NOT NULL,

  -- Learning metrics
  total_ideas INTEGER DEFAULT 0,
  total_corrections INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  total_automations INTEGER DEFAULT 0,

  -- Accuracy metrics (lower correction rate = better accuracy)
  correction_rate DECIMAL(5,4) DEFAULT 0,  -- corrections / total_ideas
  ai_accuracy_score DECIMAL(5,2) DEFAULT 50,  -- 0-100 score

  -- Context depth (how much the AI "knows")
  context_depth_score DECIMAL(5,2) DEFAULT 0,  -- 0-100 score
  profile_completeness DECIMAL(5,2) DEFAULT 0,  -- 0-100
  learned_patterns_count INTEGER DEFAULT 0,
  learned_keywords_count INTEGER DEFAULT 0,
  learned_preferences_count INTEGER DEFAULT 0,

  -- Automation metrics
  automations_active INTEGER DEFAULT 0,
  automations_executed_today INTEGER DEFAULT 0,
  automation_success_rate DECIMAL(5,4) DEFAULT 0,
  estimated_time_saved_minutes INTEGER DEFAULT 0,

  -- Engagement metrics
  active_days_streak INTEGER DEFAULT 0,
  ideas_created_today INTEGER DEFAULT 0,
  feedback_given_today INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one snapshot per day per context
CREATE UNIQUE INDEX IF NOT EXISTS idx_evolution_snapshots_unique
  ON evolution_snapshots(context, snapshot_date);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_evolution_snapshots_context ON evolution_snapshots(context);
CREATE INDEX IF NOT EXISTS idx_evolution_snapshots_date ON evolution_snapshots(snapshot_date DESC);

COMMENT ON TABLE evolution_snapshots IS 'Daily snapshots of AI learning state for trend visualization';

-- ===========================================
-- 2. Learning Events
-- ===========================================
-- Significant learning events for timeline visualization

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Event identification
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'pattern_learned', 'preference_updated', 'accuracy_improved',
    'milestone_reached', 'automation_created', 'automation_suggested',
    'cluster_discovered', 'topic_recognized', 'behavior_adapted',
    'profile_enriched', 'integration_connected', 'weekly_summary'
  )),

  -- Event details
  title VARCHAR(200) NOT NULL,
  description TEXT,
  impact_score DECIMAL(3,2) DEFAULT 0.5 CHECK (impact_score >= 0 AND impact_score <= 1),

  -- Related data
  related_entity_type VARCHAR(50),  -- 'idea', 'automation', 'pattern', etc.
  related_entity_id UUID,
  metadata JSONB DEFAULT '{}',

  -- Display properties
  icon VARCHAR(10) DEFAULT '📈',
  color VARCHAR(20) DEFAULT 'blue',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learning_events_context ON learning_events(context);
CREATE INDEX IF NOT EXISTS idx_learning_events_type ON learning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_time ON learning_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_events_impact ON learning_events(impact_score DESC);

-- Composite index for timeline queries
CREATE INDEX IF NOT EXISTS idx_learning_events_context_time
  ON learning_events(context, created_at DESC);

COMMENT ON TABLE learning_events IS 'Significant learning events for timeline visualization';

-- ===========================================
-- 3. Accuracy History
-- ===========================================
-- Tracks accuracy by field over time

CREATE TABLE IF NOT EXISTS accuracy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Field-specific accuracy
  field_name VARCHAR(50) NOT NULL CHECK (field_name IN (
    'type', 'category', 'priority', 'title', 'summary', 'keywords', 'overall'
  )),

  -- Metrics
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  corrections_received INTEGER DEFAULT 0,
  accuracy_score DECIMAL(5,2) DEFAULT 0,  -- 0-100

  -- Trend (compared to previous period)
  trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('improving', 'stable', 'declining')),
  trend_delta DECIMAL(5,2) DEFAULT 0,  -- percentage change

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_accuracy_history_unique
  ON accuracy_history(context, period_start, field_name);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accuracy_history_context ON accuracy_history(context);
CREATE INDEX IF NOT EXISTS idx_accuracy_history_field ON accuracy_history(field_name);
CREATE INDEX IF NOT EXISTS idx_accuracy_history_period ON accuracy_history(period_start DESC);

COMMENT ON TABLE accuracy_history IS 'Tracks prediction accuracy by field over time';

-- ===========================================
-- 4. Milestones
-- ===========================================
-- Achievement milestones for gamification

CREATE TABLE IF NOT EXISTS evolution_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work')),

  -- Milestone identification
  milestone_type VARCHAR(50) NOT NULL CHECK (milestone_type IN (
    'ideas_count', 'streak_days', 'accuracy_level', 'automations_count',
    'time_saved', 'patterns_learned', 'integrations_count', 'profile_complete'
  )),
  milestone_level INTEGER NOT NULL DEFAULT 1,

  -- Achievement details
  title VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(10) DEFAULT '🏆',
  threshold_value INTEGER NOT NULL,

  -- Status
  achieved BOOLEAN DEFAULT FALSE,
  achieved_at TIMESTAMPTZ,

  -- Progress
  current_value INTEGER DEFAULT 0,
  progress_percent DECIMAL(5,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one milestone per type and level per context
CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_unique
  ON evolution_milestones(context, milestone_type, milestone_level);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_milestones_context ON evolution_milestones(context);
CREATE INDEX IF NOT EXISTS idx_milestones_achieved ON evolution_milestones(achieved);
CREATE INDEX IF NOT EXISTS idx_milestones_type ON evolution_milestones(milestone_type);

COMMENT ON TABLE evolution_milestones IS 'Achievement milestones for gamification';

-- ===========================================
-- 5. Useful Views
-- ===========================================

-- Latest snapshot per context
CREATE OR REPLACE VIEW latest_evolution_snapshot AS
SELECT DISTINCT ON (context) *
FROM evolution_snapshots
ORDER BY context, snapshot_date DESC;

-- Recent learning events (last 30 days)
CREATE OR REPLACE VIEW recent_learning_events AS
SELECT
  id,
  context,
  event_type,
  title,
  description,
  impact_score,
  icon,
  color,
  created_at
FROM learning_events
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- Accuracy trends (last 12 weeks)
CREATE OR REPLACE VIEW accuracy_trends AS
SELECT
  context,
  field_name,
  period_start,
  accuracy_score,
  trend,
  trend_delta
FROM accuracy_history
WHERE period_start > CURRENT_DATE - INTERVAL '12 weeks'
ORDER BY context, field_name, period_start DESC;

-- Achieved milestones
CREATE OR REPLACE VIEW achieved_milestones AS
SELECT
  context,
  milestone_type,
  milestone_level,
  title,
  icon,
  achieved_at
FROM evolution_milestones
WHERE achieved = true
ORDER BY achieved_at DESC;

-- Upcoming milestones (closest to completion)
CREATE OR REPLACE VIEW upcoming_milestones AS
SELECT
  context,
  milestone_type,
  milestone_level,
  title,
  icon,
  current_value,
  threshold_value,
  progress_percent
FROM evolution_milestones
WHERE achieved = false AND progress_percent >= 50
ORDER BY progress_percent DESC;

-- ===========================================
-- 6. Helper Functions
-- ===========================================

-- Function to calculate context depth score
CREATE OR REPLACE FUNCTION calculate_context_depth(p_context VARCHAR)
RETURNS DECIMAL AS $$
DECLARE
  v_score DECIMAL := 0;
  v_profile_score DECIMAL := 0;
  v_patterns_score DECIMAL := 0;
  v_interactions_score DECIMAL := 0;
  v_automations_score DECIMAL := 0;
BEGIN
  -- Profile completeness (0-25 points)
  SELECT COALESCE(
    (CASE WHEN company_name IS NOT NULL THEN 5 ELSE 0 END +
     CASE WHEN industry IS NOT NULL THEN 5 ELSE 0 END +
     CASE WHEN role IS NOT NULL THEN 5 ELSE 0 END +
     CASE WHEN array_length(tech_stack, 1) > 0 THEN 5 ELSE 0 END +
     CASE WHEN array_length(goals, 1) > 0 THEN 5 ELSE 0 END), 0)
  INTO v_profile_score
  FROM business_profiles
  WHERE context = p_context
  LIMIT 1;

  -- Patterns learned (0-25 points, max at 50 patterns)
  SELECT LEAST(COUNT(*) * 0.5, 25)
  INTO v_patterns_score
  FROM correction_patterns
  WHERE context = p_context AND is_active = true;

  -- Interaction history (0-25 points, max at 1000 interactions)
  SELECT LEAST(COUNT(*) * 0.025, 25)
  INTO v_interactions_score
  FROM interaction_events
  WHERE context = p_context;

  -- Automations (0-25 points, max at 10 automations)
  SELECT LEAST(COUNT(*) * 2.5, 25)
  INTO v_automations_score
  FROM automation_definitions
  WHERE context = p_context AND is_active = true;

  v_score := COALESCE(v_profile_score, 0) + COALESCE(v_patterns_score, 0) +
             COALESCE(v_interactions_score, 0) + COALESCE(v_automations_score, 0);

  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Function to create daily snapshot
CREATE OR REPLACE FUNCTION create_evolution_snapshot(p_context VARCHAR)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_today DATE := CURRENT_DATE;
  v_total_ideas INTEGER;
  v_total_corrections INTEGER;
  v_correction_rate DECIMAL;
  v_context_depth DECIMAL;
BEGIN
  -- Get metrics
  SELECT COUNT(*) INTO v_total_ideas FROM ideas WHERE context = p_context;
  SELECT COUNT(*) INTO v_total_corrections FROM field_corrections WHERE context = p_context;

  v_correction_rate := CASE WHEN v_total_ideas > 0
    THEN v_total_corrections::decimal / v_total_ideas
    ELSE 0 END;

  v_context_depth := calculate_context_depth(p_context);

  -- Insert or update snapshot
  INSERT INTO evolution_snapshots (
    context, snapshot_date, total_ideas, total_corrections,
    correction_rate, ai_accuracy_score, context_depth_score
  )
  VALUES (
    p_context, v_today, v_total_ideas, v_total_corrections,
    v_correction_rate,
    GREATEST(50, 100 - (v_correction_rate * 100)),  -- Simple accuracy estimate
    v_context_depth
  )
  ON CONFLICT (context, snapshot_date)
  DO UPDATE SET
    total_ideas = EXCLUDED.total_ideas,
    total_corrections = EXCLUDED.total_corrections,
    correction_rate = EXCLUDED.correction_rate,
    ai_accuracy_score = EXCLUDED.ai_accuracy_score,
    context_depth_score = EXCLUDED.context_depth_score
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- 7. Initialize Default Milestones
-- ===========================================

-- Insert default milestones for both contexts
DO $$
DECLARE
  ctx VARCHAR;
BEGIN
  FOR ctx IN SELECT unnest(ARRAY['personal', 'work']) LOOP
    -- Ideas milestones
    INSERT INTO evolution_milestones (context, milestone_type, milestone_level, title, icon, threshold_value)
    VALUES
      (ctx, 'ideas_count', 1, 'Erste Schritte', '🌱', 10),
      (ctx, 'ideas_count', 2, 'Ideensammler', '💡', 50),
      (ctx, 'ideas_count', 3, 'Gedankenflut', '🌊', 200),
      (ctx, 'ideas_count', 4, 'Ideenmeister', '🏆', 500)
    ON CONFLICT DO NOTHING;

    -- Streak milestones
    INSERT INTO evolution_milestones (context, milestone_type, milestone_level, title, icon, threshold_value)
    VALUES
      (ctx, 'streak_days', 1, 'Dabei geblieben', '🔥', 7),
      (ctx, 'streak_days', 2, 'Gewohnheit', '💪', 30),
      (ctx, 'streak_days', 3, 'Konsistenz', '⭐', 90)
    ON CONFLICT DO NOTHING;

    -- Accuracy milestones
    INSERT INTO evolution_milestones (context, milestone_type, milestone_level, title, icon, threshold_value)
    VALUES
      (ctx, 'accuracy_level', 1, 'Lernend', '📚', 60),
      (ctx, 'accuracy_level', 2, 'Verständig', '🎯', 80),
      (ctx, 'accuracy_level', 3, 'Präzise', '💎', 95)
    ON CONFLICT DO NOTHING;

    -- Automation milestones
    INSERT INTO evolution_milestones (context, milestone_type, milestone_level, title, icon, threshold_value)
    VALUES
      (ctx, 'automations_count', 1, 'Automatisierer', '⚡', 3),
      (ctx, 'automations_count', 2, 'Workflow-Profi', '🔄', 10)
    ON CONFLICT DO NOTHING;

    -- Time saved milestones (in minutes)
    INSERT INTO evolution_milestones (context, milestone_type, milestone_level, title, icon, threshold_value)
    VALUES
      (ctx, 'time_saved', 1, 'Zeit gespart', '⏱️', 60),
      (ctx, 'time_saved', 2, 'Stunde gewonnen', '⏰', 120),
      (ctx, 'time_saved', 3, 'Effizienz-Meister', '🚀', 600)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ===========================================
-- Done!
-- ===========================================
-- Run this migration in Supabase SQL Editor
-- Verify with: SELECT COUNT(*) FROM evolution_snapshots;
