-- ============================================================
-- Migration: fix_schema_parity_and_constraints.sql
-- Date: 2026-02-12
-- Purpose: Fix column mismatches between 4 context schemas,
--          fix type mismatches in ideas table, and extend
--          CHECK constraints to allow all 4 contexts.
-- ============================================================
-- This migration is IDEMPOTENT - safe to run multiple times.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: Fix general_chat_sessions in personal/work schemas
-- Missing: mode, message_count, last_message_at, metadata
-- ============================================================

DO $$ BEGIN
  -- personal schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_sessions' AND column_name = 'mode') THEN
    ALTER TABLE personal.general_chat_sessions ADD COLUMN mode VARCHAR DEFAULT 'conversation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_sessions' AND column_name = 'message_count') THEN
    ALTER TABLE personal.general_chat_sessions ADD COLUMN message_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_sessions' AND column_name = 'last_message_at') THEN
    ALTER TABLE personal.general_chat_sessions ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_sessions' AND column_name = 'metadata') THEN
    ALTER TABLE personal.general_chat_sessions ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;

  -- work schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_sessions' AND column_name = 'mode') THEN
    ALTER TABLE work.general_chat_sessions ADD COLUMN mode VARCHAR DEFAULT 'conversation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_sessions' AND column_name = 'message_count') THEN
    ALTER TABLE work.general_chat_sessions ADD COLUMN message_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_sessions' AND column_name = 'last_message_at') THEN
    ALTER TABLE work.general_chat_sessions ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_sessions' AND column_name = 'metadata') THEN
    ALTER TABLE work.general_chat_sessions ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;


-- ============================================================
-- PART 2: Fix general_chat_messages in personal/work schemas
-- Missing: thinking, tool_calls, tool_results, metadata, tokens_used
-- ============================================================

DO $$ BEGIN
  -- personal schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_messages' AND column_name = 'thinking') THEN
    ALTER TABLE personal.general_chat_messages ADD COLUMN thinking TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_messages' AND column_name = 'tool_calls') THEN
    ALTER TABLE personal.general_chat_messages ADD COLUMN tool_calls JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_messages' AND column_name = 'tool_results') THEN
    ALTER TABLE personal.general_chat_messages ADD COLUMN tool_results JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_messages' AND column_name = 'metadata') THEN
    ALTER TABLE personal.general_chat_messages ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'general_chat_messages' AND column_name = 'tokens_used') THEN
    ALTER TABLE personal.general_chat_messages ADD COLUMN tokens_used INTEGER DEFAULT 0;
  END IF;

  -- work schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_messages' AND column_name = 'thinking') THEN
    ALTER TABLE work.general_chat_messages ADD COLUMN thinking TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_messages' AND column_name = 'tool_calls') THEN
    ALTER TABLE work.general_chat_messages ADD COLUMN tool_calls JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_messages' AND column_name = 'tool_results') THEN
    ALTER TABLE work.general_chat_messages ADD COLUMN tool_results JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_messages' AND column_name = 'metadata') THEN
    ALTER TABLE work.general_chat_messages ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'general_chat_messages' AND column_name = 'tokens_used') THEN
    ALTER TABLE work.general_chat_messages ADD COLUMN tokens_used INTEGER DEFAULT 0;
  END IF;
END $$;


-- ============================================================
-- PART 3: Fix media_items in personal/work schemas
-- Missing: ai_description, duration_seconds, embedding, height, ocr_text, thumbnail_path, width
-- ============================================================

DO $$ BEGIN
  -- personal schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'ai_description') THEN
    ALTER TABLE personal.media_items ADD COLUMN ai_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'duration_seconds') THEN
    ALTER TABLE personal.media_items ADD COLUMN duration_seconds INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'height') THEN
    ALTER TABLE personal.media_items ADD COLUMN height INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'ocr_text') THEN
    ALTER TABLE personal.media_items ADD COLUMN ocr_text TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'thumbnail_path') THEN
    ALTER TABLE personal.media_items ADD COLUMN thumbnail_path TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'width') THEN
    ALTER TABLE personal.media_items ADD COLUMN width INTEGER;
  END IF;

  -- work schema
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'ai_description') THEN
    ALTER TABLE work.media_items ADD COLUMN ai_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'duration_seconds') THEN
    ALTER TABLE work.media_items ADD COLUMN duration_seconds INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'height') THEN
    ALTER TABLE work.media_items ADD COLUMN height INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'ocr_text') THEN
    ALTER TABLE work.media_items ADD COLUMN ocr_text TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'thumbnail_path') THEN
    ALTER TABLE work.media_items ADD COLUMN thumbnail_path TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'width') THEN
    ALTER TABLE work.media_items ADD COLUMN width INTEGER;
  END IF;
END $$;

-- Note: embedding column for media_items requires pgvector extension
-- Only add if extension is available (it should be on Supabase)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'embedding') THEN
    BEGIN
      ALTER TABLE personal.media_items ADD COLUMN embedding vector(1536);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'pgvector not available, skipping embedding column for personal.media_items';
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'embedding') THEN
    BEGIN
      ALTER TABLE work.media_items ADD COLUMN embedding vector(1536);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'pgvector not available, skipping embedding column for work.media_items';
    END;
  END IF;
END $$;


-- ============================================================
-- PART 4: Fix personalization_facts in learning/creative schemas
-- These have a completely wrong structure. Rebuild to match personal/work.
-- ============================================================

DO $$ BEGIN
  -- learning schema: drop and recreate if structure is wrong
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'personalization_facts' AND column_name = 'fact_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'personalization_facts' AND column_name = 'fact_type') THEN
    DROP TABLE IF EXISTS learning.personalization_facts;
    CREATE TABLE learning.personalization_facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      context VARCHAR DEFAULT 'learning',
      fact_type VARCHAR DEFAULT 'knowledge',
      content TEXT NOT NULL,
      confidence NUMERIC DEFAULT 0.5,
      source VARCHAR DEFAULT 'inferred',
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_confirmed TIMESTAMPTZ DEFAULT NOW(),
      occurrences INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;

  -- creative schema: drop and recreate if structure is wrong
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'personalization_facts' AND column_name = 'fact_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'personalization_facts' AND column_name = 'fact_type') THEN
    DROP TABLE IF EXISTS creative.personalization_facts;
    CREATE TABLE creative.personalization_facts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      context VARCHAR DEFAULT 'creative',
      fact_type VARCHAR DEFAULT 'knowledge',
      content TEXT NOT NULL,
      confidence NUMERIC DEFAULT 0.5,
      source VARCHAR DEFAULT 'inferred',
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_confirmed TIMESTAMPTZ DEFAULT NOW(),
      occurrences INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;


-- ============================================================
-- PART 5: Fix user_profile in learning/creative schemas
-- These have a completely wrong structure. Rebuild to match personal/work.
-- ============================================================

DO $$ BEGIN
  -- learning schema: drop and recreate if structure is wrong
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'user_profile' AND column_name = 'preferences')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'user_profile' AND column_name = 'preferred_categories') THEN
    DROP TABLE IF EXISTS learning.user_profile;
    CREATE TABLE learning.user_profile (
      id VARCHAR PRIMARY KEY DEFAULT 'default',
      preferred_categories JSONB DEFAULT '{}',
      preferred_types JSONB DEFAULT '{}',
      topic_interests JSONB DEFAULT '{}',
      active_hours JSONB DEFAULT '{}',
      productivity_patterns JSONB DEFAULT '{}',
      total_ideas INTEGER DEFAULT 0,
      total_meetings INTEGER DEFAULT 0,
      avg_ideas_per_day DOUBLE PRECISION DEFAULT 0,
      priority_keywords JSONB DEFAULT '{"low": [], "high": [], "medium": []}',
      auto_priority_enabled BOOLEAN DEFAULT FALSE,
      interest_embedding vector(1536),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      thinking_patterns JSONB,
      language_style JSONB
    );
  END IF;

  -- creative schema: drop and recreate if structure is wrong
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'user_profile' AND column_name = 'preferences')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'user_profile' AND column_name = 'preferred_categories') THEN
    DROP TABLE IF EXISTS creative.user_profile;
    CREATE TABLE creative.user_profile (
      id VARCHAR PRIMARY KEY DEFAULT 'default',
      preferred_categories JSONB DEFAULT '{}',
      preferred_types JSONB DEFAULT '{}',
      topic_interests JSONB DEFAULT '{}',
      active_hours JSONB DEFAULT '{}',
      productivity_patterns JSONB DEFAULT '{}',
      total_ideas INTEGER DEFAULT 0,
      total_meetings INTEGER DEFAULT 0,
      avg_ideas_per_day DOUBLE PRECISION DEFAULT 0,
      priority_keywords JSONB DEFAULT '{"low": [], "high": [], "medium": []}',
      auto_priority_enabled BOOLEAN DEFAULT FALSE,
      interest_embedding vector(1536),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      thinking_patterns JSONB,
      language_style JSONB
    );
  END IF;
END $$;


-- ============================================================
-- PART 6: Fix ideas table type mismatches in learning/creative
-- learning/creative have wrong types for several columns.
-- We need to ALTER COLUMN ... TYPE to match personal/work.
-- ============================================================

-- Fix archived_at: timestamptz -> timestamp (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'archived_at' AND data_type = 'timestamp with time zone') THEN
    ALTER TABLE learning.ideas ALTER COLUMN archived_at TYPE TIMESTAMP WITHOUT TIME ZONE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'archived_at' AND data_type = 'timestamp with time zone') THEN
    ALTER TABLE creative.ideas ALTER COLUMN archived_at TYPE TIMESTAMP WITHOUT TIME ZONE;
  END IF;
END $$;

-- Fix company_id: uuid -> varchar (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'company_id' AND udt_name = 'uuid') THEN
    ALTER TABLE learning.ideas ALTER COLUMN company_id TYPE VARCHAR USING company_id::VARCHAR;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'company_id' AND udt_name = 'uuid') THEN
    ALTER TABLE creative.ideas ALTER COLUMN company_id TYPE VARCHAR USING company_id::VARCHAR;
  END IF;
END $$;

-- Fix context_needed: text -> jsonb (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'context_needed' AND data_type = 'text') THEN
    ALTER TABLE learning.ideas ALTER COLUMN context_needed TYPE JSONB USING CASE WHEN context_needed IS NULL THEN NULL WHEN context_needed = '' THEN '[]'::jsonb ELSE context_needed::jsonb END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'context_needed' AND data_type = 'text') THEN
    ALTER TABLE creative.ideas ALTER COLUMN context_needed TYPE JSONB USING CASE WHEN context_needed IS NULL THEN NULL WHEN context_needed = '' THEN '[]'::jsonb ELSE context_needed::jsonb END;
  END IF;
END $$;

-- Fix next_steps: text -> jsonb (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'next_steps' AND data_type = 'text') THEN
    ALTER TABLE learning.ideas ALTER COLUMN next_steps TYPE JSONB USING CASE WHEN next_steps IS NULL THEN NULL WHEN next_steps = '' THEN '[]'::jsonb ELSE next_steps::jsonb END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'next_steps' AND data_type = 'text') THEN
    ALTER TABLE creative.ideas ALTER COLUMN next_steps TYPE JSONB USING CASE WHEN next_steps IS NULL THEN NULL WHEN next_steps = '' THEN '[]'::jsonb ELSE next_steps::jsonb END;
  END IF;
END $$;

-- Fix keywords: ARRAY -> jsonb (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'keywords' AND udt_name = '_text') THEN
    ALTER TABLE learning.ideas ALTER COLUMN keywords TYPE JSONB USING CASE WHEN keywords IS NULL THEN NULL ELSE to_jsonb(keywords) END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'keywords' AND udt_name = '_text') THEN
    ALTER TABLE creative.ideas ALTER COLUMN keywords TYPE JSONB USING CASE WHEN keywords IS NULL THEN NULL ELSE to_jsonb(keywords) END;
  END IF;
END $$;

-- Fix embedding_binary: bit -> text (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'embedding_binary' AND data_type = 'bit') THEN
    ALTER TABLE learning.ideas ALTER COLUMN embedding_binary TYPE TEXT USING embedding_binary::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'embedding_binary' AND data_type = 'bit') THEN
    ALTER TABLE creative.ideas ALTER COLUMN embedding_binary TYPE TEXT USING embedding_binary::TEXT;
  END IF;
END $$;

-- Fix embedding_int8: vector -> jsonb (match personal/work)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'ideas' AND column_name = 'embedding_int8' AND udt_name = 'vector') THEN
    ALTER TABLE learning.ideas ALTER COLUMN embedding_int8 TYPE JSONB USING NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'ideas' AND column_name = 'embedding_int8' AND udt_name = 'vector') THEN
    ALTER TABLE creative.ideas ALTER COLUMN embedding_int8 TYPE JSONB USING NULL;
  END IF;
END $$;


-- ============================================================
-- PART 7: Fix CHECK constraints on public schema tables
-- Extend all 2-context constraints to allow all 4 contexts.
-- ============================================================

-- Helper: Drop old constraint and add new one with all 4 contexts
-- For each restricted table in public schema:

-- accuracy_history
ALTER TABLE public.accuracy_history DROP CONSTRAINT IF EXISTS accuracy_history_context_check;
DO $$ BEGIN
  ALTER TABLE public.accuracy_history ADD CONSTRAINT accuracy_history_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ai_activity_log
ALTER TABLE public.ai_activity_log DROP CONSTRAINT IF EXISTS ai_activity_log_context_check;
DO $$ BEGIN
  ALTER TABLE public.ai_activity_log ADD CONSTRAINT ai_activity_log_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ai_response_feedback
ALTER TABLE public.ai_response_feedback DROP CONSTRAINT IF EXISTS ai_response_feedback_context_check;
DO $$ BEGIN
  ALTER TABLE public.ai_response_feedback ADD CONSTRAINT ai_response_feedback_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ai_suggestions
ALTER TABLE public.ai_suggestions DROP CONSTRAINT IF EXISTS ai_suggestions_context_check;
DO $$ BEGIN
  ALTER TABLE public.ai_suggestions ADD CONSTRAINT ai_suggestions_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- automation_definitions
ALTER TABLE public.automation_definitions DROP CONSTRAINT IF EXISTS automation_definitions_context_check;
DO $$ BEGIN
  ALTER TABLE public.automation_definitions ADD CONSTRAINT automation_definitions_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- automation_notifications
ALTER TABLE public.automation_notifications DROP CONSTRAINT IF EXISTS automation_notifications_context_check;
DO $$ BEGIN
  ALTER TABLE public.automation_notifications ADD CONSTRAINT automation_notifications_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- automation_suggestions
ALTER TABLE public.automation_suggestions DROP CONSTRAINT IF EXISTS automation_suggestions_context_check;
DO $$ BEGIN
  ALTER TABLE public.automation_suggestions ADD CONSTRAINT automation_suggestions_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- business_profile
ALTER TABLE public.business_profile DROP CONSTRAINT IF EXISTS business_profile_context_check;
DO $$ BEGIN
  ALTER TABLE public.business_profile ADD CONSTRAINT business_profile_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- business_profiles
ALTER TABLE public.business_profiles DROP CONSTRAINT IF EXISTS business_profiles_context_check;
DO $$ BEGIN
  ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- context_signals
ALTER TABLE public.context_signals DROP CONSTRAINT IF EXISTS context_signals_context_check;
DO $$ BEGIN
  ALTER TABLE public.context_signals ADD CONSTRAINT context_signals_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- conversation_sessions
ALTER TABLE public.conversation_sessions DROP CONSTRAINT IF EXISTS valid_context;
DO $$ BEGIN
  ALTER TABLE public.conversation_sessions ADD CONSTRAINT valid_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- correction_patterns
ALTER TABLE public.correction_patterns DROP CONSTRAINT IF EXISTS correction_patterns_context_check;
DO $$ BEGIN
  ALTER TABLE public.correction_patterns ADD CONSTRAINT correction_patterns_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- daily_learning_log
ALTER TABLE public.daily_learning_log DROP CONSTRAINT IF EXISTS daily_learning_log_context_check;
DO $$ BEGIN
  ALTER TABLE public.daily_learning_log ADD CONSTRAINT daily_learning_log_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- domain_focus
ALTER TABLE public.domain_focus DROP CONSTRAINT IF EXISTS domain_focus_context_check;
DO $$ BEGIN
  ALTER TABLE public.domain_focus ADD CONSTRAINT domain_focus_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- evolution_milestones
ALTER TABLE public.evolution_milestones DROP CONSTRAINT IF EXISTS evolution_milestones_context_check;
DO $$ BEGIN
  ALTER TABLE public.evolution_milestones ADD CONSTRAINT evolution_milestones_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- evolution_snapshots
ALTER TABLE public.evolution_snapshots DROP CONSTRAINT IF EXISTS evolution_snapshots_context_check;
DO $$ BEGIN
  ALTER TABLE public.evolution_snapshots ADD CONSTRAINT evolution_snapshots_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- field_corrections
ALTER TABLE public.field_corrections DROP CONSTRAINT IF EXISTS field_corrections_context_check;
DO $$ BEGIN
  ALTER TABLE public.field_corrections ADD CONSTRAINT field_corrections_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- interaction_events
ALTER TABLE public.interaction_events DROP CONSTRAINT IF EXISTS interaction_events_context_check;
DO $$ BEGIN
  ALTER TABLE public.interaction_events ADD CONSTRAINT interaction_events_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- learning_events
ALTER TABLE public.learning_events DROP CONSTRAINT IF EXISTS learning_events_context_check;
DO $$ BEGIN
  ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- learning_sessions
ALTER TABLE public.learning_sessions DROP CONSTRAINT IF EXISTS learning_sessions_context_check;
DO $$ BEGIN
  ALTER TABLE public.learning_sessions ADD CONSTRAINT learning_sessions_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- proactive_research
ALTER TABLE public.proactive_research DROP CONSTRAINT IF EXISTS proactive_research_context_check;
DO $$ BEGIN
  ALTER TABLE public.proactive_research ADD CONSTRAINT proactive_research_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- proactive_settings
ALTER TABLE public.proactive_settings DROP CONSTRAINT IF EXISTS valid_settings_context;
DO $$ BEGIN
  ALTER TABLE public.proactive_settings ADD CONSTRAINT valid_settings_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- proactive_suggestion_feedback
ALTER TABLE public.proactive_suggestion_feedback DROP CONSTRAINT IF EXISTS valid_feedback_context;
DO $$ BEGIN
  ALTER TABLE public.proactive_suggestion_feedback ADD CONSTRAINT valid_feedback_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- research_patterns
ALTER TABLE public.research_patterns DROP CONSTRAINT IF EXISTS research_patterns_context_check;
DO $$ BEGIN
  ALTER TABLE public.research_patterns ADD CONSTRAINT research_patterns_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- routine_patterns
ALTER TABLE public.routine_patterns DROP CONSTRAINT IF EXISTS valid_pattern_context;
DO $$ BEGIN
  ALTER TABLE public.routine_patterns ADD CONSTRAINT valid_pattern_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- triage_history
ALTER TABLE public.triage_history DROP CONSTRAINT IF EXISTS triage_history_context_check;
DO $$ BEGIN
  ALTER TABLE public.triage_history ADD CONSTRAINT triage_history_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- user_action_log
ALTER TABLE public.user_action_log DROP CONSTRAINT IF EXISTS valid_action_context;
DO $$ BEGIN
  ALTER TABLE public.user_action_log ADD CONSTRAINT valid_action_context
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Fix user_training in personal/work schemas (also only allowed personal/work)
ALTER TABLE personal.user_training DROP CONSTRAINT IF EXISTS user_training_context_check;
DO $$ BEGIN
  ALTER TABLE personal.user_training ADD CONSTRAINT user_training_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE work.user_training DROP CONSTRAINT IF EXISTS user_training_context_check;
DO $$ BEGIN
  ALTER TABLE work.user_training ADD CONSTRAINT user_training_context_check
    CHECK (context IN ('personal', 'work', 'learning', 'creative'));
EXCEPTION WHEN undefined_column THEN NULL;
END $$;


-- ============================================================
-- PART 8: Fix push_tokens type mismatches in personal/work
-- personal/work use text, learning/creative use varchar
-- These are compatible but let's normalize to text for consistency
-- ============================================================

-- Fix push_tokens: add missing user_id column in personal/work
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'push_tokens' AND column_name = 'user_id') THEN
    ALTER TABLE personal.push_tokens ADD COLUMN user_id VARCHAR;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'push_tokens' AND column_name = 'user_id') THEN
    ALTER TABLE work.push_tokens ADD COLUMN user_id VARCHAR;
  END IF;
END $$;


-- ============================================================
-- PART 9: Fix media_items timestamp types in personal/work
-- personal/work use timestamp, learning/creative use timestamptz
-- Normalize to timestamptz (PostgreSQL best practice)
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE personal.media_items ALTER COLUMN created_at TYPE TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'media_items' AND column_name = 'updated_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE personal.media_items ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE work.media_items ALTER COLUMN created_at TYPE TIMESTAMPTZ;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'media_items' AND column_name = 'updated_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE work.media_items ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================
-- PART 10: Normalize remaining type mismatches
-- push_tokens: varchar -> text, user_profile: double precision -> numeric,
-- user_training: text -> varchar (learning/creative to match personal/work)
-- ============================================================

-- push_tokens device_id/device_name: varchar -> text in learning/creative
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'push_tokens' AND column_name = 'device_id' AND udt_name = 'varchar') THEN
    ALTER TABLE learning.push_tokens ALTER COLUMN device_id TYPE TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'push_tokens' AND column_name = 'device_name' AND udt_name = 'varchar') THEN
    ALTER TABLE learning.push_tokens ALTER COLUMN device_name TYPE TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'push_tokens' AND column_name = 'device_id' AND udt_name = 'varchar') THEN
    ALTER TABLE creative.push_tokens ALTER COLUMN device_id TYPE TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'push_tokens' AND column_name = 'device_name' AND udt_name = 'varchar') THEN
    ALTER TABLE creative.push_tokens ALTER COLUMN device_name TYPE TEXT;
  END IF;
END $$;

-- user_profile avg_ideas_per_day: double precision -> numeric in learning/creative
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'user_profile' AND column_name = 'avg_ideas_per_day' AND data_type = 'double precision') THEN
    ALTER TABLE learning.user_profile ALTER COLUMN avg_ideas_per_day TYPE NUMERIC;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'user_profile' AND column_name = 'avg_ideas_per_day' AND data_type = 'double precision') THEN
    ALTER TABLE creative.user_profile ALTER COLUMN avg_ideas_per_day TYPE NUMERIC;
  END IF;
END $$;

-- user_training corrected_value/original_value: text -> varchar in learning/creative
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'user_training' AND column_name = 'corrected_value' AND udt_name = 'text') THEN
    ALTER TABLE learning.user_training ALTER COLUMN corrected_value TYPE VARCHAR USING corrected_value::VARCHAR;
    ALTER TABLE learning.user_training ALTER COLUMN original_value TYPE VARCHAR USING original_value::VARCHAR;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'user_training' AND column_name = 'corrected_value' AND udt_name = 'text') THEN
    ALTER TABLE creative.user_training ALTER COLUMN corrected_value TYPE VARCHAR USING corrected_value::VARCHAR;
    ALTER TABLE creative.user_training ALTER COLUMN original_value TYPE VARCHAR USING original_value::VARCHAR;
  END IF;
END $$;

-- personalization_facts metadata: add if missing in learning/creative
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'learning' AND table_name = 'personalization_facts' AND column_name = 'metadata') THEN
    ALTER TABLE learning.personalization_facts ADD COLUMN metadata JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'creative' AND table_name = 'personalization_facts' AND column_name = 'metadata') THEN
    ALTER TABLE creative.personalization_facts ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- user_profile interest_embedding: add if missing in personal/work
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'personal' AND table_name = 'user_profile' AND column_name = 'interest_embedding') THEN
    BEGIN
      ALTER TABLE personal.user_profile ADD COLUMN interest_embedding vector(1536);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'work' AND table_name = 'user_profile' AND column_name = 'interest_embedding') THEN
    BEGIN
      ALTER TABLE work.user_profile ADD COLUMN interest_embedding vector(1536);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
