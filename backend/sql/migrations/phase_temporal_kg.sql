-- Phase Temporal KG: Add time dimension to Knowledge Graph
-- ALTER idea_relations + CREATE fact_versions in all 4 schemas

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- =============================================
    -- ALTER idea_relations: Add temporal columns
    -- =============================================

    -- valid_from: when this relation became active
    EXECUTE format('
      ALTER TABLE %I.idea_relations
      ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW()
    ', schema_name);

    -- valid_until: NULL = still active, set = superseded/expired
    EXECUTE format('
      ALTER TABLE %I.idea_relations
      ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ
    ', schema_name);

    -- superseded_by: points to the newer relation that replaced this one
    EXECUTE format('
      ALTER TABLE %I.idea_relations
      ADD COLUMN IF NOT EXISTS superseded_by UUID
    ', schema_name);

    -- Index for temporal queries: find active relations
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_temporal
      ON %I.idea_relations(source_id, target_id, valid_from DESC)
      WHERE valid_until IS NULL
    ', schema_name, schema_name);

    -- Index for history queries
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_history
      ON %I.idea_relations(source_id, target_id, valid_from, valid_until)
    ', schema_name, schema_name);

    -- =============================================
    -- fact_versions: Version history for learned facts
    -- =============================================
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.fact_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_id UUID NOT NULL,
        content TEXT NOT NULL,
        confidence DECIMAL(3,2),
        source VARCHAR(50),
        valid_from TIMESTAMPTZ DEFAULT NOW(),
        valid_until TIMESTAMPTZ,
        version_number INTEGER DEFAULT 1,
        change_reason TEXT,
        previous_version_id UUID REFERENCES %I.fact_versions(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_fact_versions_fact
      ON %I.fact_versions(fact_id, valid_from DESC)
    ', schema_name, schema_name);

    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_%I_fact_versions_active
      ON %I.fact_versions(fact_id)
      WHERE valid_until IS NULL
    ', schema_name, schema_name);

    RAISE NOTICE 'Temporal KG tables created for schema: %', schema_name;
  END LOOP;
END $$;
