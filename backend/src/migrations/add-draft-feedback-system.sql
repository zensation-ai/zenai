-- Phase 5: Draft Feedback Loop System
-- Advanced feedback tracking, analytics, and learning optimization

-- ================================================
-- 1. DRAFT FEEDBACK HISTORY
-- Tracks all feedback submissions with version history
-- ================================================
CREATE TABLE IF NOT EXISTS draft_feedback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES idea_drafts(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL,

  -- Feedback data
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  content_reused_percent INTEGER CHECK (content_reused_percent >= 0 AND content_reused_percent <= 100),

  -- Detailed edit tracking
  edits_description TEXT,                    -- User describes what they changed
  edit_categories VARCHAR(50)[],             -- ['tone', 'length', 'content', 'structure', 'formatting']
  original_word_count INTEGER,
  final_word_count INTEGER,

  -- Quick feedback options
  was_helpful BOOLEAN,
  would_use_again BOOLEAN,
  quality_aspects JSONB,                     -- { accuracy: 4, tone: 5, completeness: 3, relevance: 4 }

  -- Sentiment analysis (AI-generated)
  feedback_sentiment VARCHAR(20),            -- 'positive', 'neutral', 'negative', 'mixed'
  improvement_areas VARCHAR(100)[],          -- AI-identified areas for improvement

  -- Metadata
  feedback_source VARCHAR(30) DEFAULT 'manual', -- 'manual', 'prompt', 'auto_detected', 'copy_action'
  session_duration_ms INTEGER,               -- How long user spent with draft

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_history_draft ON draft_feedback_history(draft_id);
CREATE INDEX idx_feedback_history_context ON draft_feedback_history(context);
CREATE INDEX idx_feedback_history_rating ON draft_feedback_history(rating);
CREATE INDEX idx_feedback_history_created ON draft_feedback_history(created_at DESC);
CREATE INDEX idx_feedback_history_sentiment ON draft_feedback_history(feedback_sentiment);

-- ================================================
-- 2. PATTERN LEARNING METRICS
-- Detailed analytics for pattern effectiveness
-- ================================================
CREATE TABLE IF NOT EXISTS draft_pattern_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES draft_trigger_patterns(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL,

  -- Time-based metrics (rolling 30-day window)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Generation metrics
  drafts_generated INTEGER DEFAULT 0,
  drafts_viewed INTEGER DEFAULT 0,
  drafts_used INTEGER DEFAULT 0,
  drafts_edited INTEGER DEFAULT 0,
  drafts_discarded INTEGER DEFAULT 0,

  -- Quality metrics
  avg_rating DECIMAL(3,2),
  rating_count INTEGER DEFAULT 0,
  avg_content_reused_percent DECIMAL(5,2),
  avg_generation_time_ms INTEGER,

  -- User behavior metrics
  avg_time_to_view_ms BIGINT,                -- Time from generation to first view
  avg_time_to_use_ms BIGINT,                 -- Time from generation to use
  avg_session_duration_ms BIGINT,

  -- Effectiveness scores (calculated)
  conversion_rate DECIMAL(5,2),              -- (used / generated) * 100
  quality_score DECIMAL(3,2),                -- Weighted score (0-10)
  engagement_score DECIMAL(3,2),             -- Based on views, time spent

  -- Comparative metrics
  vs_baseline_improvement DECIMAL(5,2),      -- % improvement over baseline
  rank_in_category INTEGER,                  -- Rank among same draft_type patterns

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pattern_id, period_start)
);

CREATE INDEX idx_pattern_metrics_pattern ON draft_pattern_metrics(pattern_id);
CREATE INDEX idx_pattern_metrics_period ON draft_pattern_metrics(period_start, period_end);
CREATE INDEX idx_pattern_metrics_quality ON draft_pattern_metrics(quality_score DESC);

-- ================================================
-- 3. DRAFT TYPE PERFORMANCE SUMMARY
-- Aggregate metrics by draft type for dashboard
-- ================================================
CREATE TABLE IF NOT EXISTS draft_type_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL,
  draft_type VARCHAR(50) NOT NULL,

  -- Snapshot date
  snapshot_date DATE NOT NULL,

  -- Volume metrics
  total_drafts INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  total_discarded INTEGER DEFAULT 0,

  -- Quality metrics
  avg_rating DECIMAL(3,2),
  total_ratings INTEGER DEFAULT 0,
  five_star_count INTEGER DEFAULT 0,
  one_star_count INTEGER DEFAULT 0,

  -- Content metrics
  avg_word_count INTEGER,
  avg_content_reused_percent DECIMAL(5,2),
  avg_generation_time_ms INTEGER,

  -- User satisfaction
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  would_use_again_count INTEGER DEFAULT 0,

  -- Top improvement areas (JSON array with counts)
  improvement_areas_summary JSONB,

  -- Overall scores
  satisfaction_score DECIMAL(3,2),           -- 0-10 scale
  effectiveness_score DECIMAL(3,2),          -- 0-10 scale

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(context, draft_type, snapshot_date)
);

CREATE INDEX idx_type_perf_context ON draft_type_performance(context);
CREATE INDEX idx_type_perf_type ON draft_type_performance(draft_type);
CREATE INDEX idx_type_perf_date ON draft_type_performance(snapshot_date DESC);

-- ================================================
-- 4. FEEDBACK PROMPTS TRACKING
-- Track when/how feedback prompts are shown and responded to
-- ================================================
CREATE TABLE IF NOT EXISTS draft_feedback_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES idea_drafts(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL,

  -- Prompt details
  prompt_type VARCHAR(30) NOT NULL,          -- 'post_copy', 'post_view', 'reminder', 'inline'
  prompt_text TEXT,

  -- Response tracking
  shown_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  response_type VARCHAR(20),                 -- 'rated', 'skipped', 'dismissed', 'detailed'

  -- If responded, link to feedback
  feedback_id UUID REFERENCES draft_feedback_history(id),

  -- Analytics
  time_to_response_ms INTEGER,
  prompt_position VARCHAR(20),               -- 'modal', 'inline', 'toast', 'sheet'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_prompts_draft ON draft_feedback_prompts(draft_id);
CREATE INDEX idx_feedback_prompts_type ON draft_feedback_prompts(prompt_type);
CREATE INDEX idx_feedback_prompts_response ON draft_feedback_prompts(response_type);

-- ================================================
-- 5. LEARNING SUGGESTIONS
-- AI-generated suggestions for improving draft quality
-- ================================================
CREATE TABLE IF NOT EXISTS draft_learning_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL,
  draft_type VARCHAR(50) NOT NULL,

  -- Suggestion details
  suggestion_type VARCHAR(30) NOT NULL,      -- 'prompt_improvement', 'pattern_change', 'context_addition'
  suggestion_text TEXT NOT NULL,
  rationale TEXT,

  -- Based on feedback analysis
  based_on_feedback_count INTEGER,
  avg_rating_before DECIMAL(3,2),
  common_issues VARCHAR(100)[],

  -- Priority and status
  priority VARCHAR(20) DEFAULT 'medium',     -- 'high', 'medium', 'low'
  status VARCHAR(20) DEFAULT 'pending',      -- 'pending', 'applied', 'rejected', 'testing'

  -- If applied, track results
  applied_at TIMESTAMPTZ,
  avg_rating_after DECIMAL(3,2),
  improvement_percent DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_learning_suggestions_type ON draft_learning_suggestions(draft_type);
CREATE INDEX idx_learning_suggestions_priority ON draft_learning_suggestions(priority);
CREATE INDEX idx_learning_suggestions_status ON draft_learning_suggestions(status);

-- ================================================
-- 6. ADD NEW COLUMNS TO idea_drafts
-- Enhanced tracking fields
-- ================================================
ALTER TABLE idea_drafts
  ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_sentiment VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS copy_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_copy_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_to_first_view_ms INTEGER,
  ADD COLUMN IF NOT EXISTS time_to_first_use_ms INTEGER,
  ADD COLUMN IF NOT EXISTS improvement_applied BOOLEAN DEFAULT false;

-- ================================================
-- 7. ADD NEW COLUMNS TO draft_trigger_patterns
-- Enhanced learning fields
-- ================================================
ALTER TABLE draft_trigger_patterns
  ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_low_ratings INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disable_reason TEXT,
  ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0;

-- ================================================
-- 8. HELPER FUNCTIONS
-- ================================================

-- Function to calculate quality score for a draft
CREATE OR REPLACE FUNCTION calculate_draft_quality_score(
  p_rating INTEGER,
  p_content_reused_percent INTEGER,
  p_was_helpful BOOLEAN,
  p_would_use_again BOOLEAN
) RETURNS DECIMAL(3,2) AS $$
DECLARE
  score DECIMAL(3,2);
BEGIN
  -- Base score from rating (0-5 scaled to 0-10)
  score := COALESCE(p_rating, 3) * 2.0;

  -- Adjust for content reuse (±1.5 points)
  IF p_content_reused_percent IS NOT NULL THEN
    score := score + ((p_content_reused_percent - 50) / 50.0) * 1.5;
  END IF;

  -- Bonus for helpful (+0.5)
  IF p_was_helpful = true THEN
    score := score + 0.5;
  ELSIF p_was_helpful = false THEN
    score := score - 0.5;
  END IF;

  -- Bonus for would use again (+0.5)
  IF p_would_use_again = true THEN
    score := score + 0.5;
  END IF;

  -- Clamp to 0-10
  RETURN GREATEST(0, LEAST(10, score));
END;
$$ LANGUAGE plpgsql;

-- Function to update pattern metrics after feedback
CREATE OR REPLACE FUNCTION update_pattern_metrics_on_feedback()
RETURNS TRIGGER AS $$
DECLARE
  v_pattern_id UUID;
  v_draft_type VARCHAR(50);
BEGIN
  -- Get the pattern info from the draft
  SELECT d.draft_type, p.id INTO v_draft_type, v_pattern_id
  FROM idea_drafts d
  LEFT JOIN draft_trigger_patterns p ON p.pattern_text = d.trigger_pattern AND p.context = d.context
  WHERE d.id = NEW.draft_id;

  -- Update the draft's feedback count and sentiment
  UPDATE idea_drafts
  SET
    feedback_count = feedback_count + 1,
    last_feedback_at = NOW(),
    feedback_sentiment = NEW.feedback_sentiment,
    quality_score = calculate_draft_quality_score(NEW.rating, NEW.content_reused_percent, NEW.was_helpful, NEW.would_use_again)
  WHERE id = NEW.draft_id;

  -- Update pattern metrics if we found the pattern
  IF v_pattern_id IS NOT NULL THEN
    UPDATE draft_trigger_patterns
    SET
      feedback_count = feedback_count + 1,
      avg_rating = (COALESCE(avg_rating * feedback_count, 0) + NEW.rating) / (feedback_count + 1),
      quality_score = (COALESCE(quality_score * feedback_count, 0) +
        calculate_draft_quality_score(NEW.rating, NEW.content_reused_percent, NEW.was_helpful, NEW.would_use_again)
      ) / (feedback_count + 1),
      consecutive_low_ratings = CASE
        WHEN NEW.rating <= 2 THEN consecutive_low_ratings + 1
        ELSE 0
      END,
      updated_at = NOW()
    WHERE id = v_pattern_id;

    -- Auto-disable pattern if 3 consecutive low ratings
    UPDATE draft_trigger_patterns
    SET
      is_active = false,
      auto_disabled_at = NOW(),
      disable_reason = 'Auto-disabled due to 3 consecutive low ratings'
    WHERE id = v_pattern_id
      AND consecutive_low_ratings >= 3
      AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic metrics update
DROP TRIGGER IF EXISTS trigger_update_pattern_metrics ON draft_feedback_history;
CREATE TRIGGER trigger_update_pattern_metrics
  AFTER INSERT ON draft_feedback_history
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_metrics_on_feedback();

-- Function to get feedback analytics for a context
CREATE OR REPLACE FUNCTION get_draft_feedback_analytics(
  p_context VARCHAR(50),
  p_days INTEGER DEFAULT 30
) RETURNS TABLE (
  draft_type VARCHAR(50),
  total_drafts BIGINT,
  total_feedback BIGINT,
  avg_rating DECIMAL(3,2),
  avg_content_reused DECIMAL(5,2),
  helpful_percent DECIMAL(5,2),
  top_issues TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.draft_type,
    COUNT(DISTINCT d.id) as total_drafts,
    COUNT(f.id) as total_feedback,
    ROUND(AVG(f.rating)::DECIMAL, 2) as avg_rating,
    ROUND(AVG(f.content_reused_percent)::DECIMAL, 2) as avg_content_reused,
    ROUND((SUM(CASE WHEN f.was_helpful THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(f.id), 0)) * 100, 2) as helpful_percent,
    ARRAY_AGG(DISTINCT unnest) FILTER (WHERE unnest IS NOT NULL) as top_issues
  FROM idea_drafts d
  LEFT JOIN draft_feedback_history f ON f.draft_id = d.id
  LEFT JOIN LATERAL unnest(f.improvement_areas) ON true
  WHERE d.context = p_context
    AND d.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY d.draft_type
  ORDER BY total_drafts DESC;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 9. VIEWS FOR DASHBOARD
-- ================================================

-- Real-time feedback summary view
CREATE OR REPLACE VIEW v_draft_feedback_summary AS
SELECT
  d.context,
  d.draft_type,
  COUNT(DISTINCT d.id) as total_drafts,
  COUNT(DISTINCT CASE WHEN d.status = 'used' THEN d.id END) as used_drafts,
  COUNT(DISTINCT CASE WHEN d.status = 'discarded' THEN d.id END) as discarded_drafts,
  ROUND(AVG(d.user_rating)::DECIMAL, 2) as avg_rating,
  COUNT(d.user_rating) as rating_count,
  ROUND(AVG(d.content_reused_percent)::DECIMAL, 2) as avg_content_reused,
  ROUND((COUNT(DISTINCT CASE WHEN d.status = 'used' THEN d.id END)::DECIMAL /
    NULLIF(COUNT(DISTINCT d.id), 0)) * 100, 2) as conversion_rate,
  COUNT(DISTINCT CASE WHEN d.user_rating = 5 THEN d.id END) as five_star_count,
  COUNT(DISTINCT CASE WHEN d.user_rating <= 2 THEN d.id END) as low_rating_count
FROM idea_drafts d
WHERE d.created_at >= NOW() - INTERVAL '30 days'
GROUP BY d.context, d.draft_type;

-- Pattern effectiveness view
CREATE OR REPLACE VIEW v_pattern_effectiveness AS
SELECT
  p.id as pattern_id,
  p.context,
  p.draft_type,
  p.pattern_text,
  p.pattern_type,
  p.is_active,
  p.times_triggered,
  p.times_used,
  p.times_discarded,
  p.avg_rating,
  p.quality_score,
  p.success_rate,
  p.consecutive_low_ratings,
  CASE
    WHEN p.times_triggered = 0 THEN 'new'
    WHEN p.quality_score >= 8 THEN 'excellent'
    WHEN p.quality_score >= 6 THEN 'good'
    WHEN p.quality_score >= 4 THEN 'average'
    ELSE 'needs_improvement'
  END as performance_tier,
  p.auto_disabled_at,
  p.disable_reason
FROM draft_trigger_patterns p
ORDER BY p.quality_score DESC NULLS LAST;

-- Drafts needing feedback view
CREATE OR REPLACE VIEW v_drafts_needing_feedback AS
SELECT
  d.id,
  d.idea_id,
  d.context,
  d.draft_type,
  d.status,
  d.word_count,
  d.created_at,
  d.viewed_at,
  d.used_at,
  d.copy_count,
  i.title as idea_title
FROM idea_drafts d
JOIN ideas i ON i.id = d.idea_id
WHERE d.status IN ('used', 'viewed')
  AND d.user_rating IS NULL
  AND d.created_at >= NOW() - INTERVAL '7 days'
ORDER BY d.used_at DESC NULLS LAST, d.viewed_at DESC NULLS LAST;
