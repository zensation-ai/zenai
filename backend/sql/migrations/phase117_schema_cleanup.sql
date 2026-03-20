-- =====================================================
-- Phase 117: Unused Table Cleanup
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-20
-- =====================================================
--
-- Moves unused/deprecated tables to a _deprecated schema for safe cleanup.
-- Tables are NOT dropped - they can be restored by moving back.
--
-- Audit methodology:
--   1. Checked all table names in migration files
--   2. Searched backend/src/ for any SQL references to each table
--   3. Tables with 0 references in service/route code are candidates
--
-- Idempotent: safe to run multiple times.
-- =====================================================

-- Create _deprecated schema if not exists
CREATE SCHEMA IF NOT EXISTS _deprecated;

-- =====================================================
-- PART 1: Tables with 0 references in backend service code
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];

  -- Tables confirmed unused in service code:
  --
  -- metric_snapshots: Phase 61 created for OTel metric persistence,
  --   but observability uses in-memory snapshots only. 0 references in src/.
  --
  -- job_history: Phase 61 created for BullMQ job tracking,
  --   but BullMQ manages its own Redis-based history. 0 references in src/.
  --
  deprecated_tables TEXT[] := ARRAY[
    'metric_snapshots',
    'job_history'
  ];
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    FOREACH t IN ARRAY deprecated_tables LOOP
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = s AND table_name = t
        ) THEN
          -- Move to _deprecated schema with schema prefix to avoid name collisions
          EXECUTE format(
            'ALTER TABLE %I.%I SET SCHEMA _deprecated',
            s, t
          );
          -- Rename to include source schema to avoid collisions
          EXECUTE format(
            'ALTER TABLE _deprecated.%I RENAME TO %I',
            t, s || '_' || t
          );
          RAISE NOTICE 'Deprecated %.% -> _deprecated.%_%', s, t, s, t;
        ELSE
          RAISE NOTICE 'Table %.% does not exist, skipping', s, t;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Table might already be moved, or name collision
        RAISE NOTICE 'Error deprecating %.%: % (may already be deprecated)', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Old graph_communities table (replaced by graph_communities_v2 in Phase 58)
-- =====================================================
-- Phase 48 created graph_communities, Phase 58 created graph_communities_v2.
-- All code references graph_communities_v2. The original is unused.

DO $$
DECLARE
  s TEXT;
  schemas TEXT[] := ARRAY['personal', 'work', 'learning', 'creative'];
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = s AND table_name = 'graph_communities'
      ) THEN
        EXECUTE format('ALTER TABLE %I.graph_communities SET SCHEMA _deprecated', s);
        EXECUTE format('ALTER TABLE _deprecated.graph_communities RENAME TO %I', s || '_graph_communities');
        RAISE NOTICE 'Deprecated %.graph_communities (replaced by graph_communities_v2)', s;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error deprecating %.graph_communities: %', s, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================
-- PART 3: Verification
-- =====================================================

DO $$
DECLARE
  deprecated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deprecated_count
  FROM information_schema.tables
  WHERE table_schema = '_deprecated';

  RAISE NOTICE '_deprecated schema contains % tables', deprecated_count;
END $$;

-- To restore a table:
-- ALTER TABLE _deprecated.{schema}_{table} RENAME TO {table};
-- ALTER TABLE _deprecated.{table} SET SCHEMA {schema};
