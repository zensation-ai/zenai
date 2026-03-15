-- Phase 76: Production Audit Database Fixes
-- Date: 2026-03-15
-- Consolidates all database fixes from the production quality audit
-- Idempotent: safe to run multiple times

DO $$
DECLARE
  s TEXT;
  default_user UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ============================================================
  -- 1. agent_executions.tokens: INTEGER → JSONB
  --    Code uses JSONB operators (tokens->>'input') but column was INTEGER
  -- ============================================================
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.agent_executions ALTER COLUMN tokens TYPE JSONB USING CASE WHEN tokens IS NULL THEN NULL ELSE json_build_object(''input'', 0, ''output'', tokens)::jsonb END',
        s
      );
    EXCEPTION WHEN undefined_table THEN NULL;
              WHEN undefined_column THEN NULL;
              WHEN cannot_coerce THEN NULL; -- already JSONB
    END;
  END LOOP;

  -- ============================================================
  -- 2. Canvas tables in PUBLIC schema (not context schemas)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS public.canvas_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT DEFAULT '',
    document_type TEXT DEFAULT 'freeform',
    context TEXT DEFAULT 'personal',
    chat_session_id UUID,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE public.canvas_documents ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  CREATE INDEX IF NOT EXISTS idx_canvas_docs_user ON public.canvas_documents(user_id);
  CREATE INDEX IF NOT EXISTS idx_canvas_docs_context ON public.canvas_documents(context);

  CREATE TABLE IF NOT EXISTS public.canvas_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.canvas_documents(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    version_number INT DEFAULT 1,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE public.canvas_versions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  CREATE INDEX IF NOT EXISTS idx_canvas_versions_doc ON public.canvas_versions(document_id);

  -- ============================================================
  -- 3. RAG feedback/analytics tables in CONTEXT schemas
  -- ============================================================
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.rag_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_id UUID,
        query_text TEXT NOT NULL,
        session_id UUID,
        result_id UUID,
        was_helpful BOOLEAN NOT NULL,
        relevance_rating INT CHECK (relevance_rating BETWEEN 1 AND 5),
        feedback_text TEXT,
        strategies_used JSONB,
        confidence NUMERIC,
        response_time_ms INT,
        user_id UUID DEFAULT %L,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rag_feedback_query ON %I.rag_feedback(query_id)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rag_feedback_created ON %I.rag_feedback(created_at)', s, s);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.rag_query_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_text TEXT NOT NULL,
        session_id UUID,
        strategies_used JSONB,
        results_count INT DEFAULT 0,
        avg_confidence NUMERIC,
        response_time_ms INT,
        used_hyde BOOLEAN DEFAULT false,
        used_cross_encoder BOOLEAN DEFAULT false,
        user_id UUID DEFAULT %L,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_rag_analytics_created ON %I.rag_query_analytics(created_at)', s, s);
  END LOOP;

  -- ============================================================
  -- 4. Missing user_id columns on existing tables
  -- ============================================================
  -- voice_settings (exists but missing user_id)
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.voice_settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_voice_settings_user ON %I.voice_settings(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;

  -- digests
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.digests ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_digests_user ON %I.digests(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;

  -- triage_history
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.triage_history ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_triage_history_user ON %I.triage_history(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;

  -- email_labels
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.email_labels ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_email_labels_user ON %I.email_labels(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;

  -- chat_messages
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.chat_messages ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_messages_user ON %I.chat_messages(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;

  -- notification_history (public schema)
  ALTER TABLE public.notification_history ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
  CREATE INDEX IF NOT EXISTS idx_notification_history_user ON public.notification_history(user_id);

  -- ============================================================
  -- 5. Missing budgets table (phase_finance.sql never ran for this table)
  -- ============================================================
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_limit DECIMAL(12,2) NOT NULL,
        period TEXT DEFAULT ''monthly'' CHECK (period IN (''weekly'', ''monthly'', ''quarterly'', ''yearly'')),
        current_spent DECIMAL(12,2) DEFAULT 0,
        alert_threshold DECIMAL(3,2) DEFAULT 0.80,
        is_active BOOLEAN DEFAULT TRUE,
        user_id UUID DEFAULT %L,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', s, default_user);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_category ON %I.budgets(category)', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_active ON %I.budgets(is_active) WHERE is_active = TRUE', s, s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_user ON %I.budgets(user_id)', s, s);
  END LOOP;

END
$$;
