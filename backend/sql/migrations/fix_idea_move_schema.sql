-- =====================================================
-- MIGRATION: Fix idea move between contexts
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-11
-- =====================================================
--
-- Problem: Moving ideas between contexts fails with "Database schema error"
--          because some schemas are missing columns (42703) or have
--          restrictive CHECK constraints on the context column.
--
-- Solution:
--   1. Add missing columns to all 4 schemas (idempotent)
--   2. Update CHECK constraint to allow all 4 contexts
--
-- Run this in Supabase SQL Editor.
-- =====================================================

-- =====================================================
-- PART 1: Add missing columns to ideas table in all schemas
-- =====================================================
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    -- Columns that may be missing from older schemas (personal/work)
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS raw_transcript TEXT', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS viewed_count INTEGER DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS company_id UUID', s);

    -- Columns that may be missing from newer schemas (learning/creative)
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE', s);

    RAISE NOTICE 'Ensured columns exist in schema: %', s;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Fix CHECK constraint on context column
-- =====================================================
-- The original constraint only allows ('personal', 'work').
-- Update it to allow all 4 contexts.
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.ideas DROP CONSTRAINT IF EXISTS chk_ideas_context', s);
      EXECUTE format(
        'ALTER TABLE %I.ideas ADD CONSTRAINT chk_ideas_context CHECK (context IN (''personal'', ''work'', ''learning'', ''creative''))',
        s
      );
      RAISE NOTICE 'Updated CHECK constraint in schema: %', s;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not update constraint in schema %: %', s, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run this to verify column parity:
--
-- SELECT table_schema, count(*) as column_count
-- FROM information_schema.columns
-- WHERE table_name = 'ideas'
--   AND table_schema IN ('personal', 'work', 'learning', 'creative')
-- GROUP BY table_schema
-- ORDER BY table_schema;
--
-- Run this to verify CHECK constraints:
--
-- SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE contype = 'c'
--   AND conname = 'chk_ideas_context'
-- ORDER BY conrelid::regclass;
