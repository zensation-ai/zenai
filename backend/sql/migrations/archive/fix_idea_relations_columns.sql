-- =====================================================
-- MIGRATION: Add missing columns to idea_relations
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-09
-- =====================================================
--
-- Problem: knowledge-graph.ts and knowledge-graph-evolution.ts
--          expect columns that don't exist in idea_relations:
--          reason, discovery_method, confidence, current_strength,
--          valid_from, valid_until, last_reinforced, reinforcement_count,
--          updated_at.
--          Also: UNIQUE constraint is (source_id, target_id) but code
--          uses ON CONFLICT (source_id, target_id, relation_type).
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Add missing columns
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS reason TEXT', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS discovery_method VARCHAR(50)', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 0.5', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS current_strength DECIMAL(3,2) DEFAULT 0.5', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP WITH TIME ZONE', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS last_reinforced TIMESTAMP WITH TIME ZONE', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS reinforcement_count INTEGER DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.idea_relations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()', s);

    -- Fix UNIQUE constraint: change from (source_id, target_id) to (source_id, target_id, relation_type)
    -- Drop old constraint first (name varies by schema)
    BEGIN
      EXECUTE format('ALTER TABLE %I.idea_relations DROP CONSTRAINT IF EXISTS idea_relations_source_id_target_id_key', s);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Create new unique constraint on (source_id, target_id, relation_type)
    BEGIN
      EXECUTE format('ALTER TABLE %I.idea_relations ADD CONSTRAINT idea_relations_source_target_type_key UNIQUE (source_id, target_id, relation_type)', s);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- Already exists
    END;

    -- Add index on discovery_method and valid_until for temporal queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_discovery ON %I.idea_relations(discovery_method)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_idea_relations_valid ON %I.idea_relations(valid_until) WHERE valid_until IS NULL', s, s);

    RAISE NOTICE 'Fixed idea_relations in schema: %', s;
  END LOOP;
END $$;

-- Verify
SELECT schemaname, tablename, (
  SELECT count(*) FROM information_schema.columns c
  WHERE c.table_schema = t.schemaname AND c.table_name = t.tablename
) as column_count
FROM pg_tables t
WHERE tablename = 'idea_relations'
AND schemaname IN ('personal', 'work', 'learning', 'creative')
ORDER BY schemaname;
