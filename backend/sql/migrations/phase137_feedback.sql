-- Phase 137-138: Unified Feedback + Adaptive Behavior
-- Feedback events + behavior signals tables in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Feedback events: central feedback store
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.feedback_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        value FLOAT DEFAULT 0,
        details JSONB DEFAULT ''{}''::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Behavior signals: user preference signals
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.behavior_signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        type TEXT NOT NULL,
        value FLOAT DEFAULT 0,
        details JSONB DEFAULT ''{}''::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_feedback_events_type ON %I.feedback_events (type)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_feedback_events_created ON %I.feedback_events (created_at DESC)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_behavior_signals_type ON %I.behavior_signals (type)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_behavior_signals_created ON %I.behavior_signals (created_at DESC)', schema_name, schema_name);
  END LOOP;
END $$;
