-- =====================================================
-- Phase 65: Multi-User Data Isolation
-- ZenAI - Enterprise AI Platform
-- Date: 2026-03-14
-- =====================================================
--
-- Adds user_id UUID to ALL user-scoped tables across 4 schemas.
-- Backfills existing data with SYSTEM_USER_ID.
-- Standardizes existing VARCHAR(100) user_id columns to UUID.
-- Creates composite indexes for common multi-user query patterns.
--
-- Run this in Supabase SQL Editor.
-- Idempotent: safe to run multiple times.
-- =====================================================

-- Step 0: Create system default user (for backward compatibility)
INSERT INTO public.users (id, email, email_verified, display_name, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@zensation.ai',
  true,
  'System',
  'admin'
) ON CONFLICT (id) DO NOTHING;

-- Handle email uniqueness conflict separately
DO $$
BEGIN
  UPDATE public.users
  SET id = '00000000-0000-0000-0000-000000000001'
  WHERE email = 'system@zensation.ai'
    AND id != '00000000-0000-0000-0000-000000000001';
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if already correct
END $$;

-- =====================================================
-- PART 1: Add user_id UUID to core tables (26 tables x 4 schemas)
-- =====================================================

DO $$
DECLARE
  s TEXT;
  default_user UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- ---- IDEAS (most critical table) ----
    EXECUTE format('ALTER TABLE %I.ideas ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.ideas SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.ideas ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_ideas_user ON %I.ideas(user_id)', s, s);

    -- ---- TASKS ----
    EXECUTE format('ALTER TABLE %I.tasks ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.tasks SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.tasks ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tasks_user ON %I.tasks(user_id)', s, s);

    -- ---- PROJECTS ----
    EXECUTE format('ALTER TABLE %I.projects ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.projects SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.projects ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_projects_user ON %I.projects(user_id)', s, s);

    -- ---- EMAILS ----
    EXECUTE format('ALTER TABLE %I.emails ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.emails SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.emails ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_user ON %I.emails(user_id)', s, s);

    -- ---- EMAIL_ACCOUNTS ----
    EXECUTE format('ALTER TABLE %I.email_accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.email_accounts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.email_accounts ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_email_accounts_user ON %I.email_accounts(user_id)', s, s);

    -- ---- DOCUMENTS ----
    EXECUTE format('ALTER TABLE %I.documents ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.documents SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.documents ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_documents_user ON %I.documents(user_id)', s, s);

    -- ---- DOCUMENT_FOLDERS ----
    EXECUTE format('ALTER TABLE %I.document_folders ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.document_folders SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.document_folders ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_document_folders_user ON %I.document_folders(user_id)', s, s);

    -- ---- CALENDAR_EVENTS ----
    EXECUTE format('ALTER TABLE %I.calendar_events ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.calendar_events SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.calendar_events ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_calendar_events_user ON %I.calendar_events(user_id)', s, s);

    -- ---- CALENDAR_ACCOUNTS ----
    EXECUTE format('ALTER TABLE %I.calendar_accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.calendar_accounts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.calendar_accounts ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_calendar_accounts_user ON %I.calendar_accounts(user_id)', s, s);

    -- ---- CONTACTS ----
    EXECUTE format('ALTER TABLE %I.contacts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.contacts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.contacts ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contacts_user ON %I.contacts(user_id)', s, s);

    -- ---- ORGANIZATIONS ----
    EXECUTE format('ALTER TABLE %I.organizations ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.organizations SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.organizations ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_organizations_user ON %I.organizations(user_id)', s, s);

    -- ---- FINANCIAL_ACCOUNTS ----
    EXECUTE format('ALTER TABLE %I.financial_accounts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.financial_accounts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.financial_accounts ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_financial_accounts_user ON %I.financial_accounts(user_id)', s, s);

    -- ---- TRANSACTIONS ----
    EXECUTE format('ALTER TABLE %I.transactions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.transactions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.transactions ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_transactions_user ON %I.transactions(user_id)', s, s);

    -- ---- BUDGETS ----
    EXECUTE format('ALTER TABLE %I.budgets ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.budgets SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.budgets ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_budgets_user ON %I.budgets(user_id)', s, s);

    -- ---- FINANCIAL_GOALS ----
    EXECUTE format('ALTER TABLE %I.financial_goals ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.financial_goals SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.financial_goals ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_financial_goals_user ON %I.financial_goals(user_id)', s, s);

    -- ---- BROWSING_HISTORY ----
    EXECUTE format('ALTER TABLE %I.browsing_history ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.browsing_history SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.browsing_history ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_browsing_history_user ON %I.browsing_history(user_id)', s, s);

    -- ---- BOOKMARKS ----
    EXECUTE format('ALTER TABLE %I.bookmarks ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.bookmarks SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.bookmarks ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_bookmarks_user ON %I.bookmarks(user_id)', s, s);

    -- ---- SCREEN_CAPTURES ----
    EXECUTE format('ALTER TABLE %I.screen_captures ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.screen_captures SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.screen_captures ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_screen_captures_user ON %I.screen_captures(user_id)', s, s);

    -- ---- GENERAL_CHAT_SESSIONS ----
    EXECUTE format('ALTER TABLE %I.general_chat_sessions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.general_chat_sessions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.general_chat_sessions ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_sessions_user ON %I.general_chat_sessions(user_id)', s, s);

    -- ---- GENERAL_CHAT_MESSAGES ----
    EXECUTE format('ALTER TABLE %I.general_chat_messages ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.general_chat_messages SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.general_chat_messages ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_messages_user ON %I.general_chat_messages(user_id)', s, s);

    -- ---- VOICE_MEMOS ----
    EXECUTE format('ALTER TABLE %I.voice_memos ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.voice_memos SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.voice_memos ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_voice_memos_user ON %I.voice_memos(user_id)', s, s);

    -- ---- IDEA_DRAFTS ----
    EXECUTE format('ALTER TABLE %I.idea_drafts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.idea_drafts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.idea_drafts ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_idea_drafts_user ON %I.idea_drafts(user_id)', s, s);

    -- ---- MEETINGS ----
    EXECUTE format('ALTER TABLE %I.meetings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.meetings SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.meetings ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_meetings_user ON %I.meetings(user_id)', s, s);

    -- ---- MEETING_NOTES ----
    EXECUTE format('ALTER TABLE %I.meeting_notes ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.meeting_notes SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.meeting_notes ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_meeting_notes_user ON %I.meeting_notes(user_id)', s, s);

    -- ---- CANVAS_DOCUMENTS ----
    -- Note: canvas_documents may be in public schema, add IF EXISTS check
    BEGIN
      EXECUTE format('ALTER TABLE %I.canvas_documents ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.canvas_documents SET user_id = %L WHERE user_id IS NULL', s, default_user);
      EXECUTE format('ALTER TABLE %I.canvas_documents ALTER COLUMN user_id SET NOT NULL', s);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_canvas_documents_user ON %I.canvas_documents(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN
      NULL; -- Skip if table doesn't exist in this schema
    END;

    -- ---- VOICE_SESSIONS ----
    BEGIN
      EXECUTE format('ALTER TABLE %I.voice_sessions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.voice_sessions SET user_id = %L WHERE user_id IS NULL', s, default_user);
      EXECUTE format('ALTER TABLE %I.voice_sessions ALTER COLUMN user_id SET NOT NULL', s);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_voice_sessions_user ON %I.voice_sessions(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    -- ---- IDEA_TOPICS ----
    EXECUTE format('ALTER TABLE %I.idea_topics ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
    EXECUTE format('UPDATE %I.idea_topics SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXECUTE format('ALTER TABLE %I.idea_topics ALTER COLUMN user_id SET NOT NULL', s);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_idea_topics_user ON %I.idea_topics(user_id)', s, s);

    -- ---- MEDIA_ITEMS ----
    BEGIN
      EXECUTE format('ALTER TABLE %I.media_items ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.media_items SET user_id = %L WHERE user_id IS NULL', s, default_user);
      EXECUTE format('ALTER TABLE %I.media_items ALTER COLUMN user_id SET NOT NULL', s);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_media_items_user ON %I.media_items(user_id)', s, s);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    -- ---- AUTOMATIONS (proactive_suggestions, proactive_settings, etc.) ----
    BEGIN
      EXECUTE format('ALTER TABLE %I.proactive_suggestions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.proactive_suggestions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.learned_facts ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.learned_facts SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.episodic_memories ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.episodic_memories SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.procedural_memories ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.procedural_memories SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.knowledge_entities ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.knowledge_entities SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.mcp_server_connections ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.mcp_server_connections SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.governance_actions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.governance_actions SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.context_rules ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.context_rules SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.proactive_rules ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.proactive_rules SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.thinking_chains ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.thinking_chains SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.rag_query_analytics ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.rag_query_analytics SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.rag_feedback ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.rag_feedback SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.sleep_compute_logs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.sleep_compute_logs SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE format('ALTER TABLE %I.saved_locations ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT %L', s, default_user);
      EXECUTE format('UPDATE %I.saved_locations SET user_id = %L WHERE user_id IS NULL', s, default_user);
    EXCEPTION WHEN undefined_table THEN NULL; END;

  END LOOP;
END $$;


-- =====================================================
-- PART 2: VARCHAR(100) → UUID migration for existing user_id columns
-- These 13 tables already have user_id VARCHAR(100) DEFAULT 'default'
-- =====================================================

DO $$
DECLARE
  s TEXT;
  default_user UUID := '00000000-0000-0000-0000-000000000001';
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'loose_thoughts', 'thought_clusters', 'pattern_predictions',
    'interaction_history', 'notification_preferences', 'notification_history',
    'user_goals', 'analytics_events', 'personalization_sessions',
    'learning_tasks', 'study_sessions', 'learning_insights',
    'conversation_memory'
  ];
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP
    FOREACH tbl IN ARRAY tables LOOP
      BEGIN
        -- Check if column is VARCHAR type and convert
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = s AND table_name = tbl AND column_name = 'user_id'
            AND data_type IN ('character varying', 'character')
        ) THEN
          -- Update 'default' values to system user UUID string first
          EXECUTE format(
            'UPDATE %I.%I SET user_id = %L WHERE user_id = ''default'' OR user_id IS NULL',
            s, tbl, default_user::text
          );
          -- Drop any UNIQUE constraints on user_id that would conflict
          -- (notification_preferences has UNIQUE on user_id)
          BEGIN
            EXECUTE format(
              'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
              s, tbl, tbl || '_user_id_key'
            );
          EXCEPTION WHEN OTHERS THEN NULL; END;
          -- Alter column type
          EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN user_id TYPE UUID USING user_id::uuid',
            s, tbl
          );
          EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN user_id SET DEFAULT %L',
            s, tbl, default_user
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Skipping %.%: %', s, tbl, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;


-- =====================================================
-- PART 3: Composite indexes for common multi-user query patterns
-- =====================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT unnest(ARRAY['personal', 'work', 'learning', 'creative']) LOOP

    -- Ideas: user + archived + created (main listing query)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_ideas_user_arch_created ON %I.ideas(user_id, is_archived, created_at DESC)', s, s);

    -- Tasks: user + status (kanban view)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tasks_user_status ON %I.tasks(user_id, status)', s, s);

    -- Emails: user + status + received (inbox view)
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_user_status ON %I.emails(user_id, status, received_at DESC)', s, s);
    EXCEPTION WHEN undefined_column THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_emails_user_status ON %I.emails(user_id, status, created_at DESC)', s, s);
    END;

    -- Chat sessions: user + updated (recent chats)
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chat_user_updated ON %I.general_chat_sessions(user_id, updated_at DESC)', s, s);

    -- Documents: user + created
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_docs_user_created ON %I.documents(user_id, created_at DESC)', s, s);

    -- Calendar: user + start_time
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cal_user_start ON %I.calendar_events(user_id, start_time)', s, s);
    EXCEPTION WHEN undefined_column THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cal_user_start ON %I.calendar_events(user_id, created_at)', s, s);
    END;

    -- Contacts: user + name
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contacts_user ON %I.contacts(user_id, name)', s, s);
    EXCEPTION WHEN undefined_column THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_contacts_user ON %I.contacts(user_id)', s, s);
    END;

  END LOOP;
END $$;


-- =====================================================
-- PART 4: Add user_id to public.api_keys for key→user mapping
-- =====================================================

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);
UPDATE public.api_keys SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON public.api_keys(user_id);


-- =====================================================
-- Done. Verify with:
-- SELECT table_schema, table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE column_name = 'user_id'
-- ORDER BY table_schema, table_name;
-- =====================================================
