-- Phase 59: Memory Excellence (Letta-Paradigm)
-- Procedural Memory + BM25 Search + Entity-Memory Links
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  schema_name TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH schema_name IN ARRAY schemas
  LOOP
    -- =========================================
    -- 1. procedural_memories table
    -- =========================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.procedural_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger_description TEXT NOT NULL,
        steps TEXT[] NOT NULL,
        tools_used TEXT[] NOT NULL DEFAULT ''{}''::TEXT[],
        outcome VARCHAR(20) NOT NULL CHECK (outcome IN (''success'', ''partial'', ''failure'')),
        duration_ms INTEGER,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 1.0,
        feedback_score REAL,
        embedding vector(1536),
        metadata JSONB DEFAULT ''{}''::JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    ', schema_name);

    -- GIN index on steps for array search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_proc_mem_steps
      ON %I.procedural_memories USING GIN (steps);
    ', schema_name, schema_name);

    -- GIN index on tools_used for array search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_proc_mem_tools
      ON %I.procedural_memories USING GIN (tools_used);
    ', schema_name, schema_name);

    -- Vector index on embedding for similarity search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_proc_mem_embedding
      ON %I.procedural_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
    ', schema_name, schema_name);

    -- Index on outcome + success_rate for top procedures
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_proc_mem_outcome_rate
      ON %I.procedural_memories (outcome, success_rate DESC);
    ', schema_name, schema_name);

    -- =========================================
    -- 2. memory_entity_links table
    -- =========================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.memory_entity_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_id UUID NOT NULL,
        entity_id UUID NOT NULL,
        link_type VARCHAR(50) NOT NULL DEFAULT ''mentions'',
        confidence REAL DEFAULT 0.8,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(fact_id, entity_id)
      );
    ', schema_name);

    -- Index on fact_id for lookups
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_mem_entity_links_fact
      ON %I.memory_entity_links (fact_id);
    ', schema_name, schema_name);

    -- Index on entity_id for reverse lookups
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_mem_entity_links_entity
      ON %I.memory_entity_links (entity_id);
    ', schema_name, schema_name);

    -- =========================================
    -- 3. ALTER learned_facts: add search_vector for BM25
    -- =========================================
    -- Add tsvector column if not exists
    EXECUTE format('
      DO $inner$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = %L AND table_name = ''learned_facts'' AND column_name = ''search_vector''
        ) THEN
          ALTER TABLE %I.learned_facts ADD COLUMN search_vector tsvector;
        END IF;
      END $inner$;
    ', schema_name, schema_name);

    -- GIN index on search_vector for full-text search
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%s_learned_facts_search_vector
      ON %I.learned_facts USING GIN (search_vector);
    ', schema_name, schema_name);

    -- Trigger to auto-update search_vector on INSERT/UPDATE
    EXECUTE format('
      CREATE OR REPLACE FUNCTION %I.update_learned_facts_search_vector()
      RETURNS TRIGGER AS $func$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector(''german'', COALESCE(NEW.content, '''')), ''A'') ||
          setweight(to_tsvector(''english'', COALESCE(NEW.content, '''')), ''B'');
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql;
    ', schema_name);

    -- Drop trigger if exists, then recreate
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_learned_facts_search_vector ON %I.learned_facts;
    ', schema_name);

    EXECUTE format('
      CREATE TRIGGER trg_learned_facts_search_vector
      BEFORE INSERT OR UPDATE OF content ON %I.learned_facts
      FOR EACH ROW
      EXECUTE FUNCTION %I.update_learned_facts_search_vector();
    ', schema_name, schema_name);

    -- Backfill existing rows
    EXECUTE format('
      UPDATE %I.learned_facts
      SET search_vector =
        setweight(to_tsvector(''german'', COALESCE(content, '''')), ''A'') ||
        setweight(to_tsvector(''english'', COALESCE(content, '''')), ''B'')
      WHERE search_vector IS NULL AND content IS NOT NULL;
    ', schema_name);

    RAISE NOTICE 'Phase 59 migration complete for schema: %', schema_name;
  END LOOP;
END $$;
