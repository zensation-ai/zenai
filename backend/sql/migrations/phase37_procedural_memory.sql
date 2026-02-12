-- Phase 37: Procedural Memory Table
-- Stores learned workflows, skills, and routines (Mem^p Framework pattern)
-- Needs to exist in all 4 schemas for context isolation

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['personal', 'work', 'learning', 'creative']
  LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.procedural_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        context VARCHAR(20) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT ''tool_sequence'',
        name TEXT NOT NULL,
        trigger_description TEXT NOT NULL,
        steps JSONB NOT NULL DEFAULT ''[]'',
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        confidence FLOAT NOT NULL DEFAULT 0.5,
        tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source VARCHAR(20) NOT NULL DEFAULT ''extracted'',
        CONSTRAINT procedural_memory_type_check CHECK (type IN (''workflow'', ''tool_sequence'', ''response_template'', ''sop'')),
        CONSTRAINT procedural_memory_source_check CHECK (source IN (''extracted'', ''manual''))
      )', schema_name);

    -- Index for efficient querying
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_proc_mem_context
      ON %I.procedural_memory (context, confidence DESC)',
      schema_name, schema_name);
  END LOOP;
END $$;
