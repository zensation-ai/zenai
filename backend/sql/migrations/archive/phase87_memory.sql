-- Phase 87: Next-Gen Memory — Prospective + Source + Metamemory
-- Apply to all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Prospective Memory table
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.prospective_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT ''00000000-0000-0000-0000-000000000001'',
        trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN (''time'', ''event'', ''activity'', ''context'')),
        trigger_condition JSONB NOT NULL DEFAULT ''{}''::jsonb,
        memory_content TEXT NOT NULL,
        priority VARCHAR(10) DEFAULT ''medium'' CHECK (priority IN (''low'', ''medium'', ''high'')),
        status VARCHAR(20) DEFAULT ''pending'' CHECK (status IN (''pending'', ''fired'', ''dismissed'', ''expired'')),
        fired_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Source tracking on learned_facts
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS source_type VARCHAR(50)', schema_name);
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS source_id VARCHAR(255)', schema_name);
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS source_confidence REAL DEFAULT 1.0', schema_name);
    EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMPTZ DEFAULT NOW()', schema_name);

    -- Indexes for prospective_memories
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_prospective_status ON %I.prospective_memories (status, trigger_type)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_prospective_user ON %I.prospective_memories (user_id, status)', schema_name, schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_prospective_expires ON %I.prospective_memories (expires_at) WHERE status = ''pending''', schema_name, schema_name);

    -- Index for source tracking
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_facts_source ON %I.learned_facts (source_type)', schema_name, schema_name);
  END LOOP;
END $$;
