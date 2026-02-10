-- Migration: Create ai_activity_log table in all 4 schemas
-- Date: 2026-02-10
--
-- Problem: Deploy logs show "AI activity log table does not exist" in personal schema.
-- The sync_all_schemas_full_parity.sql migration was never run on production.
--
-- This is a standalone, idempotent migration that creates the ai_activity_log table
-- with the correct schema expected by ai-activity-logger.ts.
--
-- Safe to re-run: Uses CREATE TABLE IF NOT EXISTS and column existence checks.

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Create the table if it doesn't exist
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.ai_activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        activity_type VARCHAR(100) NOT NULL,
        message TEXT,
        idea_id UUID,
        metadata JSONB DEFAULT ''{}''::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )', s);

    -- Create indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_type ON %I.ai_activity_log(activity_type)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_ai_activity_created ON %I.ai_activity_log(created_at DESC)', s, s);

    -- Fix columns if table was created by older migration with wrong columns
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
    END IF;

    -- Add idea_id column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'idea_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log ADD COLUMN idea_id UUID', s);
    END IF;

    -- Drop unused title column if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'title'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log DROP COLUMN title', s);
    END IF;

    -- Drop unused description column if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'ai_activity_log' AND column_name = 'description'
    ) THEN
      EXECUTE format('ALTER TABLE %I.ai_activity_log DROP COLUMN description', s);
    END IF;

    RAISE NOTICE 'ai_activity_log ready in schema: %', s;
  END LOOP;

  RAISE NOTICE 'Migration complete: ai_activity_log exists in all 4 schemas';
END $$;
