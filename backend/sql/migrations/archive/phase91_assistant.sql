-- Phase 91: Unified AI Assistant
-- Creates assistant_interactions table in all 4 schemas

DO $$
DECLARE
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
  s TEXT;
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.assistant_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        query TEXT NOT NULL,
        intent VARCHAR(50),
        action JSONB,
        result JSONB,
        page_context VARCHAR(100),
        response_time_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_%s_assistant_created ON %I.assistant_interactions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_%s_assistant_user ON %I.assistant_interactions(user_id, created_at DESC);
    ', s, s, s, s, s);
  END LOOP;
END $$;
