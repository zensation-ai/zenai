-- =====================================================
-- MIGRATION: Add missing columns to ideas table in all schemas
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-10
-- =====================================================
--
-- Problem: The original complete_schema_init.sql created personal/work
--          schemas WITHOUT raw_transcript, viewed_count, and company_id
--          columns. The add_learning_creative_schemas.sql migration added
--          these columns only to learning/creative schemas.
--          This causes idea move operations between contexts to fail
--          with PostgreSQL error 42703 (undefined column).
--
-- Solution: Add missing columns to all 4 schemas idempotently.
--
-- Run this in Supabase SQL Editor.
-- =====================================================

-- Part 1: Add columns missing from all schemas
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS raw_transcript TEXT', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS viewed_count INTEGER DEFAULT 0', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS company_id UUID', s);

    RAISE NOTICE 'Ensured base columns exist in schema: %', s;
  END LOOP;
END $$;

-- Part 2: Add columns missing from learning/creative (present in personal/work)
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['learning', 'creative']) LOOP
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS embedding_binary BIT(768)', s);
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS embedding_int8 vector(768)', s);

    RAISE NOTICE 'Added embedding/archive columns to schema: %', s;
  END LOOP;
END $$;

-- =====================================================
-- VERIFICATION: Check column parity across schemas
-- =====================================================
-- Run this SELECT to verify all schemas have the same column count:
-- SELECT table_schema, count(*) as column_count
-- FROM information_schema.columns
-- WHERE table_name = 'ideas'
--   AND table_schema IN ('personal', 'work', 'learning', 'creative')
-- GROUP BY table_schema
-- ORDER BY table_schema;
