-- =====================================================
-- Phase 65: Row-Level Security - User Isolation Policies
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-14
-- =====================================================
--
-- Replaces permissive USING (true) RLS policies with
-- proper user-based isolation policies.
--
-- Uses current_setting('app.current_user_id', true) to
-- read the user ID set by the backend on each connection.
--
-- COALESCE fallback: when app.current_user_id is NOT set
-- (NULL), the policy degrades to USING (true) for backward
-- compatibility during the migration period.
--
-- Prerequisites:
--   - phase65_multiuser_core.sql (user_id columns exist)
--   - RLS must be enabled on the tables (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
--
-- Run this in Supabase SQL Editor.
-- Idempotent: safe to run multiple times.
-- =====================================================

-- =====================================================
-- PART 1: Enable RLS on all user-scoped tables
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  user_tables TEXT[] := ARRAY[
    -- Core
    'ideas', 'tasks', 'projects', 'emails', 'email_accounts',
    'documents', 'document_folders', 'calendar_events', 'calendar_accounts',
    'contacts', 'organizations',
    -- Finance
    'financial_accounts', 'transactions', 'budgets', 'financial_goals',
    -- Browser
    'browsing_history', 'bookmarks', 'screen_captures',
    -- Chat
    'general_chat_sessions', 'general_chat_messages',
    -- Voice
    'voice_memos', 'voice_sessions',
    -- Other
    'idea_drafts', 'meetings', 'meeting_notes', 'idea_topics',
    'media_items', 'canvas_documents', 'learned_facts',
    'episodic_memories', 'procedural_memories', 'knowledge_entities',
    'mcp_server_connections', 'governance_actions', 'context_rules',
    'proactive_rules', 'thinking_chains', 'rag_query_analytics',
    'rag_feedback', 'sleep_compute_logs', 'saved_locations'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH t IN ARRAY user_tables LOOP
      BEGIN
        -- Enable RLS (idempotent - no error if already enabled)
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);
        RAISE NOTICE 'RLS enabled on %.%', s, t;
      EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'Table %.% does not exist, skipping RLS enable', s, t;
      WHEN OTHERS THEN
        RAISE NOTICE 'Error enabling RLS on %.%: %', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 2: Create user isolation policies
-- =====================================================
--
-- Policy logic:
--   USING (user_id = COALESCE(
--     current_setting('app.current_user_id', true)::uuid,
--     user_id
--   ))
--
-- When app.current_user_id IS set:
--   -> user_id must match (strict isolation)
-- When app.current_user_id is NOT set (NULL/empty):
--   -> COALESCE falls back to user_id = user_id (always true)
--   -> backward compatible for single-user / migration period
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  policy_name TEXT;
  user_tables TEXT[] := ARRAY[
    'ideas', 'tasks', 'projects', 'emails', 'email_accounts',
    'documents', 'document_folders', 'calendar_events', 'calendar_accounts',
    'contacts', 'organizations',
    'financial_accounts', 'transactions', 'budgets', 'financial_goals',
    'browsing_history', 'bookmarks', 'screen_captures',
    'general_chat_sessions', 'general_chat_messages',
    'voice_memos', 'voice_sessions',
    'idea_drafts', 'meetings', 'meeting_notes', 'idea_topics',
    'media_items', 'canvas_documents', 'learned_facts',
    'episodic_memories', 'procedural_memories', 'knowledge_entities',
    'mcp_server_connections', 'governance_actions', 'context_rules',
    'proactive_rules', 'thinking_chains', 'rag_query_analytics',
    'rag_feedback', 'sleep_compute_logs', 'saved_locations'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH t IN ARRAY user_tables LOOP
      policy_name := t || '_user_isolation';
      BEGIN
        -- Check that the table has a user_id column before creating the policy
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = s
            AND table_name = t
            AND column_name = 'user_id'
        ) THEN
          -- Drop existing policy (could be old USING(true) or previous version)
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, s, t);

          -- Also drop any legacy permissive policy names
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'allow_all_' || t, s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_select_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_insert_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_update_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_delete_policy', s, t);

          -- Create unified policy for ALL operations (SELECT, INSERT, UPDATE, DELETE)
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR ALL ' ||
            'USING (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid, user_id)) ' ||
            'WITH CHECK (user_id = COALESCE(NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid, user_id))',
            policy_name, s, t
          );

          RAISE NOTICE 'Created policy % on %.%', policy_name, s, t;
        ELSE
          RAISE NOTICE 'Table %.% has no user_id column, skipping policy', s, t;
        END IF;
      EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'Table %.% does not exist, skipping policy', s, t;
      WHEN OTHERS THEN
        RAISE NOTICE 'Error creating policy on %.%: %', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 3: System/junction tables - keep permissive
-- =====================================================
--
-- These tables either:
--   a) Have no user_id (system tables, junction tables)
--   b) Are shared across users by design
--
-- We ensure RLS is enabled but with USING (true) policies.
-- =====================================================

DO $$
DECLARE
  s TEXT;
  t TEXT;
  policy_name TEXT;
  system_tables TEXT[] := ARRAY[
    -- Junction / relation tables (no user_id)
    'idea_relations', 'idea_feedback', 'task_dependencies',
    'entity_relations', 'graph_communities',
    -- Config / system tables
    'notification_settings', 'memory_settings',
    'automation_rules', 'automation_executions',
    'conversation_memory', 'conversation_patterns',
    'email_labels', 'contact_interactions',
    -- Analytics / logs without user scope
    'metric_snapshots', 'job_history',
    'fact_versions', 'memory_entity_links',
    -- Security (managed by admin APIs)
    'security_audit_log', 'rate_limit_config',
    'governance_policies', 'audit_log',
    -- Context / compute
    'context_cache', 'context_rule_performance',
    'system_events',
    -- Budget strategies
    'thinking_budget_strategies',
    -- Workflow / agents
    'mcp_external_tools'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH t IN ARRAY system_tables LOOP
      policy_name := t || '_system_access';
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = s AND table_name = t
        ) THEN
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, s, t);
          -- Also drop old naming patterns
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', t || '_policy', s, t);
          EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'allow_all_' || t, s, t);

          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR ALL USING (true) WITH CHECK (true)',
            policy_name, s, t
          );
          RAISE NOTICE 'Created system policy % on %.%', policy_name, s, t;
        END IF;
      EXCEPTION WHEN undefined_table THEN
        NULL; -- table doesn't exist in this schema
      WHEN OTHERS THEN
        RAISE NOTICE 'Error on system table %.%: %', s, t, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================
-- PART 4: Public schema tables (agent identities, workflows, users)
-- =====================================================
--
-- Public schema tables with user_id get user isolation.
-- Tables without user_id (users, oauth_states) get system policies.
-- =====================================================

DO $$
DECLARE
  policy_name TEXT;
BEGIN
  -- Agent identities: created by users, isolate per user
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_identities' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.agent_identities ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS agent_identities_user_isolation ON public.agent_identities;
    CREATE POLICY agent_identities_user_isolation ON public.agent_identities
      FOR ALL
      USING (created_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, created_by))
      WITH CHECK (created_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, created_by));
    RAISE NOTICE 'Created policy on public.agent_identities';
  END IF;

  -- Agent workflows: isolate per user
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_workflows' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS agent_workflows_user_isolation ON public.agent_workflows;
    CREATE POLICY agent_workflows_user_isolation ON public.agent_workflows
      FOR ALL
      USING (created_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, created_by))
      WITH CHECK (created_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, created_by));
    RAISE NOTICE 'Created policy on public.agent_workflows';
  END IF;

  -- Agent workflow runs: isolate per user
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_workflow_runs' AND column_name = 'triggered_by'
  ) THEN
    ALTER TABLE public.agent_workflow_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS agent_workflow_runs_user_isolation ON public.agent_workflow_runs;
    CREATE POLICY agent_workflow_runs_user_isolation ON public.agent_workflow_runs
      FOR ALL
      USING (triggered_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, triggered_by))
      WITH CHECK (triggered_by = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, triggered_by));
    RAISE NOTICE 'Created policy on public.agent_workflow_runs';
  END IF;

  -- User sessions: users can only see their own sessions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_sessions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_sessions_user_isolation ON public.user_sessions;
    CREATE POLICY user_sessions_user_isolation ON public.user_sessions
      FOR ALL
      USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, user_id))
      WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, user_id));
    RAISE NOTICE 'Created policy on public.user_sessions';
  END IF;

  -- User contexts: users can only see their own contexts
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_contexts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.user_contexts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_contexts_user_isolation ON public.user_contexts;
    CREATE POLICY user_contexts_user_isolation ON public.user_contexts
      FOR ALL
      USING (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, user_id))
      WITH CHECK (user_id = COALESCE(NULLIF(current_setting('app.current_user_id', true), '')::uuid, user_id));
    RAISE NOTICE 'Created policy on public.user_contexts';
  END IF;

  -- Agent action logs: isolate per agent's creator
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_action_logs' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS agent_action_logs_system_access ON public.agent_action_logs;
    CREATE POLICY agent_action_logs_system_access ON public.agent_action_logs
      FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created system policy on public.agent_action_logs (no direct user_id)';
  END IF;

  -- Users table: system access (managed by auth service)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS users_system_access ON public.users;
    CREATE POLICY users_system_access ON public.users
      FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created system policy on public.users';
  END IF;

  -- OAuth states: system access (managed by auth service)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'oauth_states'
  ) THEN
    ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS oauth_states_system_access ON public.oauth_states;
    CREATE POLICY oauth_states_system_access ON public.oauth_states
      FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created system policy on public.oauth_states';
  END IF;

  -- API keys: system access (validated by middleware)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_keys'
  ) THEN
    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS api_keys_system_access ON public.api_keys;
    CREATE POLICY api_keys_system_access ON public.api_keys
      FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created system policy on public.api_keys';
  END IF;
END $$;

-- =====================================================
-- PART 5: A2A tables (public-facing, special access)
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = s AND table_name = 'a2a_tasks'
      ) THEN
        EXECUTE format('ALTER TABLE %I.a2a_tasks ENABLE ROW LEVEL SECURITY', s);
        EXECUTE format('DROP POLICY IF EXISTS a2a_tasks_system_access ON %I.a2a_tasks', s);
        EXECUTE format(
          'CREATE POLICY a2a_tasks_system_access ON %I.a2a_tasks FOR ALL USING (true) WITH CHECK (true)',
          s
        );
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = s AND table_name = 'a2a_external_agents'
      ) THEN
        EXECUTE format('ALTER TABLE %I.a2a_external_agents ENABLE ROW LEVEL SECURITY', s);
        EXECUTE format('DROP POLICY IF EXISTS a2a_external_agents_system_access ON %I.a2a_external_agents', s);
        EXECUTE format(
          'CREATE POLICY a2a_external_agents_system_access ON %I.a2a_external_agents FOR ALL USING (true) WITH CHECK (true)',
          s
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error on A2A tables in schema %: %', s, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================
-- VERIFICATION: Count policies per schema
-- =====================================================

DO $$
DECLARE
  s TEXT;
  policy_count INTEGER;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative', 'public']) LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = s;
    RAISE NOTICE 'Schema %: % RLS policies', s, policy_count;
  END LOOP;
END $$;
