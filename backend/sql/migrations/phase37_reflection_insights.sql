-- Phase 37: Reflection Insights Table
-- Stores AI self-reflection and metacognitive insights (ReFlexion Framework pattern)
-- Needs to exist in all 4 schemas for context isolation

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.reflection_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        session_id TEXT NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT ''quality_check'',
        trigger_summary TEXT NOT NULL,
        insight TEXT NOT NULL,
        confidence FLOAT NOT NULL DEFAULT 0.5,
        action_item TEXT,
        applied BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT reflection_type_check CHECK (type IN (''quality_check'', ''strategy_review'', ''knowledge_gap'', ''user_alignment''))
      )', schema_name);

    -- Index for efficient querying
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_reflection_context
      ON %I.reflection_insights (context, created_at DESC)',
      schema_name, schema_name);

    -- Index for unapplied lessons
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_reflection_unapplied
      ON %I.reflection_insights (context, applied, confidence DESC)
      WHERE applied = false AND action_item IS NOT NULL',
      schema_name, schema_name);
  END LOOP;
END $$;
