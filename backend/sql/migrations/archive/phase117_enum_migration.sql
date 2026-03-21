-- =====================================================
-- Phase 117: ENUM Type Definitions (Preparation)
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-20
-- =====================================================
--
-- Creates PostgreSQL ENUM types for frequently-used status/priority columns.
-- This is PREPARATION ONLY - columns are NOT converted yet.
--
-- ENUMs created. Column conversion will be done in a separate migration after validation.
--
-- Benefits of ENUMs over VARCHAR + CHECK:
--   - 4 bytes vs variable length (storage savings)
--   - Built-in validation (no need for CHECK constraints)
--   - Better query planner hints
--   - Self-documenting schema
--
-- Risks of conversion (why we defer it):
--   - ALTER COLUMN TYPE requires ACCESS EXCLUSIVE lock
--   - Existing data must match enum values exactly
--   - Application code must be validated first
--
-- Idempotent: safe to run multiple times.
-- =====================================================

-- =====================================================
-- PART 1: Create ENUM types in public schema
-- =====================================================
-- ENUMs are created in public schema so they're accessible from all 4 context schemas.

-- idea_status_enum
-- NOTE: The ideas table currently uses is_archived BOOLEAN, not a status column.
-- This ENUM is aspirational for a future schema redesign. Not currently applicable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idea_status_enum') THEN
    CREATE TYPE idea_status_enum AS ENUM ('active', 'incubating', 'archived', 'deleted');
    RAISE NOTICE 'Created type idea_status_enum (aspirational — ideas table uses is_archived BOOLEAN)';
  ELSE
    RAISE NOTICE 'Type idea_status_enum already exists';
  END IF;
END $$;

-- task_status_enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status_enum') THEN
    CREATE TYPE task_status_enum AS ENUM ('backlog', 'todo', 'in_progress', 'done', 'cancelled');
    RAISE NOTICE 'Created type task_status_enum';
  ELSE
    RAISE NOTICE 'Type task_status_enum already exists';
  END IF;
END $$;

-- task_priority_enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority_enum') THEN
    CREATE TYPE task_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');
    RAISE NOTICE 'Created type task_priority_enum';
  ELSE
    RAISE NOTICE 'Type task_priority_enum already exists';
  END IF;
END $$;

-- email_status_enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_status_enum') THEN
    CREATE TYPE email_status_enum AS ENUM ('received', 'read', 'draft', 'sending', 'sent', 'failed', 'archived', 'trash');
    RAISE NOTICE 'Created type email_status_enum';
  ELSE
    RAISE NOTICE 'Type email_status_enum already exists';
  END IF;
END $$;

-- suggestion_status_enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestion_status_enum') THEN
    CREATE TYPE suggestion_status_enum AS ENUM ('active', 'dismissed', 'snoozed', 'accepted');
    RAISE NOTICE 'Created type suggestion_status_enum';
  ELSE
    RAISE NOTICE 'Type suggestion_status_enum already exists';
  END IF;
END $$;

-- =====================================================
-- PART 2: Verification
-- =====================================================

DO $$
DECLARE
  enum_count INTEGER;
  enum_name TEXT;
BEGIN
  FOR enum_name IN
    SELECT unnest(ARRAY[
      'idea_status_enum',
      'task_status_enum',
      'task_priority_enum',
      'email_status_enum',
      'suggestion_status_enum'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = enum_name) THEN
      RAISE NOTICE 'ENUM % exists', enum_name;
    ELSE
      RAISE WARNING 'ENUM % is MISSING', enum_name;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- REFERENCE: Future column conversion (DO NOT RUN YET)
-- =====================================================
--
-- When ready to convert columns, the pattern would be:
--
-- ALTER TABLE {schema}.ideas
--   ALTER COLUMN status TYPE idea_status_enum
--   USING status::idea_status_enum;
--
-- ALTER TABLE {schema}.tasks
--   ALTER COLUMN status TYPE task_status_enum
--   USING status::task_status_enum;
--
-- ALTER TABLE {schema}.tasks
--   ALTER COLUMN priority TYPE task_priority_enum
--   USING priority::task_priority_enum;
--
-- ALTER TABLE {schema}.emails
--   ALTER COLUMN status TYPE email_status_enum
--   USING status::email_status_enum;
--
-- ALTER TABLE {schema}.smart_suggestions
--   ALTER COLUMN status TYPE suggestion_status_enum
--   USING status::suggestion_status_enum;
--
-- After conversion, the corresponding CHECK constraints can be dropped.
-- =====================================================
