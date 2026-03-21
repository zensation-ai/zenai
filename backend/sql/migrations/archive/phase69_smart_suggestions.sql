-- Phase 69.1: Smart Suggestion Surface
-- Table: smart_suggestions in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.smart_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        type VARCHAR(50) NOT NULL CHECK (type IN (
          ''connection_discovered'', ''task_reminder'', ''email_followup'',
          ''knowledge_insight'', ''context_switch'', ''meeting_prep'',
          ''learning_opportunity'', ''contradiction_alert''
        )),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT ''{}''::jsonb,
        priority INTEGER DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
        status VARCHAR(20) NOT NULL DEFAULT ''active'' CHECK (status IN (
          ''active'', ''dismissed'', ''snoozed'', ''accepted''
        )),
        snoozed_until TIMESTAMPTZ,
        dismissed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_%1$s_smart_suggestions_user_status
        ON %1$I.smart_suggestions(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_%1$s_smart_suggestions_priority
        ON %1$I.smart_suggestions(priority DESC)
        WHERE status = ''active'';

      CREATE INDEX IF NOT EXISTS idx_%1$s_smart_suggestions_created
        ON %1$I.smart_suggestions(created_at DESC);
    ', schema_name, schema_name, schema_name, schema_name);
  END LOOP;
END $$;
