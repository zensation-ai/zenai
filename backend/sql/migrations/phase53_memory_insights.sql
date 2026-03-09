-- Phase 53: Memory Insights - Performance indexes for memory analysis queries
-- No new tables needed - queries existing memory tables.
-- Creates indexes on created_at columns for efficient timeline aggregation.

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    EXECUTE format('SET search_path TO %I, public', schema_name);

    -- Working memory indexes
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_working_memory_created ON working_memory(created_at)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table working_memory does not exist in schema %', schema_name;
    END;

    -- Episodic memories indexes
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_episodic_memories_created ON episodic_memories(created_at)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table episodic_memories does not exist in schema %', schema_name;
    END;

    -- Short-term memory indexes
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_created ON memory(created_at)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table memory does not exist in schema %', schema_name;
    END;

    -- Long-term memory indexes
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_long_term_memory_created ON long_term_memory(created_at)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table long_term_memory does not exist in schema %', schema_name;
    END;

    -- Long-term memory strength index for impact analysis
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_long_term_memory_strength ON long_term_memory(strength DESC NULLS LAST)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table long_term_memory does not exist in schema %', schema_name;
    END;

    -- Memory strength index for curation suggestions
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_strength ON memory(strength DESC NULLS LAST)';
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table memory does not exist in schema %', schema_name;
    END;

    RAISE NOTICE 'Phase 53 indexes created for schema: %', schema_name;
  END LOOP;

  -- Reset search path
  SET search_path TO public;
END $$;
