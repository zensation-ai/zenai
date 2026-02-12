-- Phase 37: Proactive Digests Table
-- Stores auto-generated daily/weekly digests for proactive intelligence
-- Needs to exist in all 4 schemas for context isolation

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.proactive_digests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT ''daily'',
        title TEXT NOT NULL,
        sections JSONB NOT NULL DEFAULT ''[]'',
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        viewed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT proactive_digest_type_check CHECK (type IN (''daily'', ''weekly''))
      )', schema_name);

    -- Index for efficient retrieval of latest unviewed
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_digest_context_viewed
      ON %I.proactive_digests (context, viewed, created_at DESC)',
      schema_name, schema_name);
  END LOOP;
END $$;
