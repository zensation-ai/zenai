-- Migration: Fix ai_activity_log columns to match service code
-- Date: 2026-02-09
--
-- Problem: The sync_all_schemas_full_parity.sql migration creates ai_activity_log with
-- columns `title VARCHAR(500)` and `description TEXT`, but the service code
-- (ai-activity-logger.ts) expects `message TEXT` and `idea_id UUID`.
--
-- Strategy (idempotent, safe to re-run):
-- 1. Add `message` column if not exists, copy data from `title` if present
-- 2. Add `idea_id` column if not exists
-- 3. Drop unused `title` and `description` columns

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    -- Add message column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'message'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log ADD COLUMN message TEXT', s);
      -- Copy title data to message if title column exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'title'
      ) THEN
        EXECUTE format('UPDATE %I.ai_activity_log SET message = title WHERE message IS NULL', s);
      END IF;
      RAISE NOTICE 'Added message column to %.ai_activity_log', s;
    END IF;

    -- Add idea_id column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'idea_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log ADD COLUMN idea_id UUID', s);
      RAISE NOTICE 'Added idea_id column to %.ai_activity_log', s;
    END IF;

    -- Drop title column if exists (not used by service)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'title'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log DROP COLUMN title', s);
      RAISE NOTICE 'Dropped title column from %.ai_activity_log', s;
    END IF;

    -- Drop description column if exists (not used by service)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'description'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log DROP COLUMN description', s);
      RAISE NOTICE 'Dropped description column from %.ai_activity_log', s;
    END IF;
  END LOOP;

  RAISE NOTICE 'ai_activity_log columns fixed in all schemas';
END $$;
