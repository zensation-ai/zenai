-- =====================================================
-- MIGRATION: Fix CHECK constraints to allow all 4 contexts
-- ZenAI - Enterprise AI Platform
-- Date: 2026-02-09
-- =====================================================
--
-- Problem: Several tables in the public schema have CHECK constraints
--          that only allow 'personal' and 'work' as context values.
--          Since the system supports 4 contexts (personal, work, learning, creative),
--          inserts for learning/creative contexts fail with constraint violations.
--
-- Affected tables:
--   1. documents                (phase32_document_vault.sql)
--   2. document_folders          (phase32_document_vault.sql)
--   3. conversation_memory       (phase27_conversation_memory.sql)
--   4. conversation_patterns     (phase27_conversation_memory.sql)
--   5. proactive_actions         (phase27_conversation_memory.sql)
--   6. feedback_loops            (phase27_conversation_memory.sql)
--   7. memory_settings           (phase27_conversation_memory.sql)
--   8. learned_facts             (phase27_conversation_memory.sql)
--   9. learning_tasks            (phase22_daily_learning_tasks.sql)
--
-- Solution: Drop old constraints, add new ones allowing all 4 contexts.
--           Uses IF EXISTS / exception handling for idempotency.
--
-- Run this in Supabase SQL Editor.
-- =====================================================

-- =====================================================
-- 1. DOCUMENTS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_context_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 2. DOCUMENT_FOLDERS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE document_folders DROP CONSTRAINT IF EXISTS document_folders_context_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_folders
    ADD CONSTRAINT document_folders_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 3. CONVERSATION_MEMORY TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE conversation_memory DROP CONSTRAINT IF EXISTS valid_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE conversation_memory
    ADD CONSTRAINT valid_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 4. CONVERSATION_PATTERNS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE conversation_patterns DROP CONSTRAINT IF EXISTS valid_pattern_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE conversation_patterns
    ADD CONSTRAINT valid_pattern_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 5. PROACTIVE_ACTIONS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE proactive_actions DROP CONSTRAINT IF EXISTS valid_action_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE proactive_actions
    ADD CONSTRAINT valid_action_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 6. FEEDBACK_LOOPS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE feedback_loops DROP CONSTRAINT IF EXISTS valid_feedback_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE feedback_loops
    ADD CONSTRAINT valid_feedback_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 7. MEMORY_SETTINGS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE memory_settings DROP CONSTRAINT IF EXISTS valid_settings_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE memory_settings
    ADD CONSTRAINT valid_settings_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 8. LEARNED_FACTS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE learned_facts DROP CONSTRAINT IF EXISTS valid_fact_context;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE learned_facts
    ADD CONSTRAINT valid_fact_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 9. LEARNING_TASKS TABLE
-- =====================================================
DO $$ BEGIN
  ALTER TABLE learning_tasks DROP CONSTRAINT IF EXISTS learning_tasks_context_check;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE learning_tasks
    ADD CONSTRAINT learning_tasks_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- VERIFICATION: Check all constraints are updated
-- =====================================================
-- Run this SELECT to verify:
-- SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE contype = 'c'
--   AND conname LIKE '%context%'
-- ORDER BY conrelid::regclass;
