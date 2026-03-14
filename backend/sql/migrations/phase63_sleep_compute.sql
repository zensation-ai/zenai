-- Phase 63: Sleep-Time Compute + Advanced Context Engineering
-- Idempotent migration for all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Sleep Compute Tracking
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.sleep_compute_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cycle_type VARCHAR(50) NOT NULL,
        processed_items INTEGER DEFAULT 0,
        insights_generated INTEGER DEFAULT 0,
        contradictions_resolved INTEGER DEFAULT 0,
        memory_updates INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Context pre-computation cache
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.context_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cache_key VARCHAR(255) NOT NULL UNIQUE,
        domain VARCHAR(50) NOT NULL,
        content JSONB NOT NULL,
        token_count INTEGER DEFAULT 0,
        hit_count INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', schema_name);

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_context_cache_key ON %I.context_cache(cache_key)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_context_cache_expires ON %I.context_cache(expires_at)', schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_sleep_compute_logs_created ON %I.sleep_compute_logs(created_at DESC)', schema_name);

    RAISE NOTICE 'Phase 63 tables created for schema: %', schema_name;
  END LOOP;
END $$;
