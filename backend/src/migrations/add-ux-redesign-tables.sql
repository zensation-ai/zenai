-- ============================================
-- UX Redesign: AI Activity Log & Triage System
-- Migration for Dashboard, Activity Feed, and Inbox/Triage features
-- ============================================

-- ============================================
-- AI Activity Log Table
-- Logs AI activities for the dashboard activity feed
-- ============================================
CREATE TABLE IF NOT EXISTS ai_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
  activity_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ai_activity_context_created
  ON ai_activity_log(context, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_activity_type
  ON ai_activity_log(activity_type);

CREATE INDEX IF NOT EXISTS idx_ai_activity_unread
  ON ai_activity_log(context, is_read) WHERE is_read = false;

-- ============================================
-- Triage History Table
-- Tracks user triage decisions for learning and analytics
-- ============================================
CREATE TABLE IF NOT EXISTS triage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  context VARCHAR(20) NOT NULL CHECK (context IN ('personal', 'work')),
  action VARCHAR(30) NOT NULL CHECK (action IN ('priority', 'keep', 'later', 'archive', 'delete')),
  previous_priority VARCHAR(10),
  new_priority VARCHAR(10),
  triaged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_idea
  ON triage_history(idea_id, triaged_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_context_date
  ON triage_history(context, triaged_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_action
  ON triage_history(action);

-- ============================================
-- Function: Get pending triage count
-- Returns count of ideas not triaged in the last 24 hours
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_triage_count(p_context VARCHAR)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM ideas i
    WHERE i.context = p_context
      AND i.is_archived = false
      AND NOT EXISTS (
        SELECT 1 FROM triage_history th
        WHERE th.idea_id = i.id
          AND th.triaged_at > NOW() - INTERVAL '24 hours'
      )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Log AI activity
-- Helper function to insert activity log entries
-- ============================================
CREATE OR REPLACE FUNCTION log_ai_activity(
  p_context VARCHAR,
  p_activity_type VARCHAR,
  p_message TEXT,
  p_idea_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ai_activity_log (context, activity_type, message, idea_id, metadata)
  VALUES (p_context, p_activity_type, p_message, p_idea_id, p_metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Get recent AI activities
-- Returns recent activities for dashboard feed
-- ============================================
CREATE OR REPLACE FUNCTION get_recent_ai_activities(
  p_context VARCHAR,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  activity_type VARCHAR,
  message TEXT,
  idea_id UUID,
  metadata JSONB,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.activity_type,
    a.message,
    a.idea_id,
    a.metadata,
    a.is_read,
    a.created_at
  FROM ai_activity_log a
  WHERE a.context = p_context
  ORDER BY a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger: Auto-log idea creation
-- Automatically creates activity log when new idea is created
-- ============================================
CREATE OR REPLACE FUNCTION trigger_log_idea_creation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_ai_activity(
    NEW.context,
    'idea_created',
    'Neue Idee strukturiert: "' || LEFT(NEW.title, 50) || CASE WHEN LENGTH(NEW.title) > 50 THEN '...' ELSE '' END || '"',
    NEW.id,
    jsonb_build_object('type', NEW.type, 'category', NEW.category, 'priority', NEW.priority)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_idea_creation'
  ) THEN
    CREATE TRIGGER trg_log_idea_creation
      AFTER INSERT ON ideas
      FOR EACH ROW
      EXECUTE FUNCTION trigger_log_idea_creation();
  END IF;
END;
$$;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE ai_activity_log IS 'Logs AI activities for dashboard feed.
Activity types:
- idea_created: New idea was created and structured
- idea_structured: Existing text was structured by AI
- search_performed: Semantic search was performed
- draft_generated: AI-generated draft was created
- pattern_detected: Learning pattern was detected
- suggestion_made: Proactive suggestion was created
- triage_completed: User completed triage session';

COMMENT ON TABLE triage_history IS 'Tracks user triage decisions for learning.
Actions:
- priority: Set to high priority
- keep: Keep as-is (no change)
- later: Defer to later (set low priority)
- archive: Move to archive
- delete: Delete the idea';

COMMENT ON FUNCTION get_pending_triage_count(VARCHAR) IS 'Returns count of ideas not triaged in last 24 hours';
COMMENT ON FUNCTION log_ai_activity(VARCHAR, VARCHAR, TEXT, UUID, JSONB) IS 'Helper to insert AI activity log entries';
COMMENT ON FUNCTION get_recent_ai_activities(VARCHAR, INTEGER) IS 'Returns recent AI activities for dashboard';
