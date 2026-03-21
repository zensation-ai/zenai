-- Phase 38: Add is_favorite to tasks across all 4 schemas
-- Ideas already have is_favorite (from phase11_performance_indexes.sql)
-- This migration adds the same field to tasks for feature parity
--
-- Idempotent: uses IF NOT EXISTS

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Add is_favorite to tasks
    EXECUTE format(
      'ALTER TABLE %I.tasks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE',
      schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_tasks_favorite ON %I.tasks(is_favorite) WHERE is_favorite = true',
      schema_name
    );
  END LOOP;
END $$;
