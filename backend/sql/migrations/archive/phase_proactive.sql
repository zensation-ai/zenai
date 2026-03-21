-- Phase 6: Proaktive Intelligenz-Engine
-- Migration: workflow_patterns + proactive_briefings in all 4 schemas

DO $outer$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- workflow_patterns
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.workflow_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern_name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_conditions JSONB DEFAULT ''{}''::jsonb,
        suggested_actions JSONB DEFAULT ''[]''::jsonb,
        confidence DECIMAL(3,2) DEFAULT 0.50,
        occurrence_count INTEGER DEFAULT 1,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        is_confirmed BOOLEAN DEFAULT FALSE,
        is_automated BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_workflow_patterns_trigger ON %I.workflow_patterns(trigger_type);
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_workflow_patterns_confirmed ON %I.workflow_patterns(is_confirmed);
    ', s, s);

    -- proactive_briefings
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_briefings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        briefing_type TEXT NOT NULL,
        content JSONB NOT NULL DEFAULT ''{}''::jsonb,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        read_at TIMESTAMPTZ,
        dismissed_at TIMESTAMPTZ,
        acted_on JSONB DEFAULT ''[]''::jsonb,
        metadata JSONB DEFAULT ''{}''::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_briefings_type ON %I.proactive_briefings(briefing_type);
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_briefings_generated ON %I.proactive_briefings(generated_at DESC);
    ', s, s);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_briefings_unread ON %I.proactive_briefings(read_at) WHERE read_at IS NULL;
    ', s, s);

    RAISE NOTICE 'Phase 6 tables created for schema: %', s;
  END LOOP;
END $outer$;
