-- Fix: Add is_favorite column to ideas table across all 4 schemas
-- Phase 38 added is_favorite to SELECT queries in ideas routes,
-- but the column was never created on the ideas table.
-- It only existed on documents (Phase 32) and tasks (Phase 38).
--
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative'])
  LOOP
    -- Add is_favorite to ideas
    EXECUTE format(
      'ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE',
      schema_name
    );
    -- Partial index for fast favorite lookups
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_ideas_favorite ON %I.ideas(is_favorite) WHERE is_favorite = true',
      schema_name
    );
    -- Also ensure tasks has is_favorite (Phase 38 migration)
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
